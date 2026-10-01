/**
 * historicoEquipamento.ts — a FICHA do equipamento a partir do que já existe.
 *
 * O técnico lê o QR colado na máquina e precisa ver, em segundos: o que já foi
 * feito ali (OS, fotos, PMOC), quando foi o último serviço, se ainda está na
 * garantia e quando é a próxima manutenção. Nada disso é cadastro novo — tudo vem
 * das ordens de serviço ligadas ao equipamento (check-in pelo QR, `equipamentoId`)
 * e das visitas PMOC geradas para ele (`pmoc_ordens_geradas`).
 *
 * Módulo PURO (sem import de runtime): roda no app, no painel e no teste de linha
 * de comando (`scripts/teste-qr-equipamento.ts`). Datas comparadas em ISO; o "hoje"
 * entra por parâmetro para o teste não depender do relógio.
 */
import type { OrdemServico, PmocOrdemGerada, StatusOS } from '../types';

/** OS que ainda pode receber trabalho (o técnico retoma em vez de abrir outra). */
const STATUS_ABERTOS: ReadonlySet<StatusOS> = new Set<StatusOS>(['aberta', 'agendada', 'em_execucao', 'pausada']);

/** Ordem de preferência para RETOMAR um atendimento: quem já está em campo primeiro. */
const PRIORIDADE_RETOMAR: Record<StatusOS, number> = {
  em_execucao: 0,
  pausada: 1,
  agendada: 2,
  aberta: 3,
  concluida: 9,
  cancelada: 9,
};

export interface UltimoServico {
  osId: string;
  numero: string;
  titulo: string;
  /** ISO do fechamento (concluidoEm; na falta, a última edição da OS concluída). */
  data: string;
  tecnicoNome?: string;
}

export interface ProximaManutencao {
  /** Dia (YYYY-MM-DD) da próxima manutenção conhecida. */
  dia: string;
  /** 'agendada' = OS aberta com data; 'pmoc' = vencimento de visita do plano. */
  origem: 'agendada' | 'pmoc';
  osId?: string;
}

export interface GarantiaEquipamento {
  /** Texto da garantia como o prestador escreveu no orçamento ("90 dias"). */
  texto: string;
  /** Dia (YYYY-MM-DD) em que o serviço que deu a garantia terminou. */
  desde: string;
  /** Dia final, quando o texto traz um prazo legível ("90 dias", "6 meses", "1 ano"). */
  ate?: string;
  /** true/false só quando `ate` existe; sem prazo legível não afirmamos nada. */
  vigente?: boolean;
  osNumero: string;
}

export interface HistoricoEquipamento {
  /** Todas as OS do equipamento (diretas + PMOC), mais recentes primeiro. */
  ordens: OrdemServico[];
  /** As que ainda aceitam trabalho, na ordem em que o técnico deve retomar. */
  abertas: OrdemServico[];
  ultimoServico?: UltimoServico;
  proximaManutencao?: ProximaManutencao;
  /** Visita PMOC cujo vencimento passou sem a OS concluída (a mais antiga). */
  pmocVencida?: { dia: string; osId: string };
  /** Fotos do equipamento + das OS (sem repetir), as do equipamento primeiro. */
  fotos: string[];
  garantia?: GarantiaEquipamento;
  /** Quantas visitas PMOC o equipamento tem no livro (geradas, ativas). */
  visitasPmoc: number;
}

export interface EntradaHistorico {
  equipamentoId: string;
  fotosEquipamento: string[];
  /** OS candidatas (o loader já filtra; aqui revalidamos o vínculo). */
  ordens: OrdemServico[];
  geradas: PmocOrdemGerada[];
  /** Texto de garantia por id de orçamento (só os orçamentos das OS concluídas). */
  garantiaPorOrcamento?: Record<string, string | undefined>;
  /** Hoje, YYYY-MM-DD (fuso do aparelho). */
  hoje: string;
}

/**
 * YYYY-MM-DD de um ISO/data; '' se ilegível. Dia civil puro ('2026-10-15') passa
 * direto; ISO com hora vira o dia NO FUSO DO APARELHO (o mesmo de `hojeLocal`).
 * Cortar os 10 primeiros caracteres de um ISO em UTC punha o serviço concluído às
 * 22h de Brasília no dia SEGUINTE (e adiantava a garantia em um dia).
 */
export function diaDe(iso?: string): string {
  if (!iso) return '';
  const civil = /^(\d{4}-\d{2}-\d{2})$/.exec(iso);
  if (civil) return civil[1];
  const t = Date.parse(iso);
  if (Number.isFinite(t)) return hojeLocal(new Date(t));
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : '';
}

/**
 * Soma dias/meses/anos a um dia YYYY-MM-DD (UTC puro, sem fuso). Mês/ano
 * PRENDEM no último dia do mês de chegada (31/01 + 1 mês = 28/02, não 03/03):
 * garantia nunca "ganha" dias por aritmética de calendário.
 */
function somar(dia: string, qtd: number, unidade: 'dia' | 'mes' | 'ano'): string {
  const [a, m, d] = dia.split('-').map(Number);
  if (unidade === 'dia') {
    const base = new Date(Date.UTC(a, m - 1, d));
    base.setUTCDate(base.getUTCDate() + qtd);
    return base.toISOString().slice(0, 10);
  }
  const meses = (m - 1) + (unidade === 'mes' ? qtd : qtd * 12);
  const ano = a + Math.floor(meses / 12);
  const mes = meses % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d, ultimoDia))).toISOString().slice(0, 10);
}

/**
 * Prazo de garantia legível no texto livre do orçamento. Aceita "90 dias",
 * "garantia de 3 meses", "6 MESES", "1 ano", "12 meses de garantia". Devolve
 * null para texto sem número+unidade ("conforme fabricante") — nesse caso a ficha
 * mostra o texto e NÃO afirma se está vigente.
 */
export function prazoGarantia(texto?: string): { qtd: number; unidade: 'dia' | 'mes' | 'ano' } | null {
  if (!texto) return null;
  const norm = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = /(\d{1,4})\s*(dias?|mes(?:es)?|anos?)\b/.exec(norm);
  if (!m) return null;
  const qtd = Number(m[1]);
  if (!Number.isFinite(qtd) || qtd <= 0) return null;
  const u = m[2].startsWith('dia') ? 'dia' : m[2].startsWith('mes') ? 'mes' : 'ano';
  return { qtd, unidade: u };
}

/** Data efetiva de fechamento de uma OS concluída. */
function fechamento(os: OrdemServico): string {
  return os.concluidoEm || os.atualizadoEm || os.criadoEm;
}

/** A OS aberta que o técnico deve RETOMAR (em execução > pausada > agendada mais cedo > aberta). */
export function osParaRetomar(abertas: OrdemServico[]): OrdemServico | undefined {
  return [...abertas].sort((a, b) => {
    const p = PRIORIDADE_RETOMAR[a.status] - PRIORIDADE_RETOMAR[b.status];
    if (p !== 0) return p;
    const da = a.dataAgendada || '9999';
    const db = b.dataAgendada || '9999';
    if (da !== db) return da.localeCompare(db);
    return (b.atualizadoEm || '').localeCompare(a.atualizadoEm || '');
  })[0];
}

/**
 * A OS que ESTE técnico deve retomar. Técnico de equipe só retoma OS dele ou
 * ainda sem técnico — nunca "rouba" (põe em execução) a OS atribuída a um colega,
 * que ficaria fora da lista "minhas OS" dele. Sem `tecnicoId` (dono/gestão) vale
 * a regra geral de `osParaRetomar`.
 */
export function osParaRetomarPor(abertas: OrdemServico[], tecnicoId?: string): OrdemServico | undefined {
  if (!tecnicoId) return osParaRetomar(abertas);
  return osParaRetomar(abertas.filter((os) => !os.tecnicoId || os.tecnicoId === tecnicoId));
}

export function montarHistoricoEquipamento(e: EntradaHistorico): HistoricoEquipamento {
  const geradasDoEquip = e.geradas.filter((g) => g.equipamentoId === e.equipamentoId && !g.excluidoEm);
  const idsPmoc = new Set(geradasDoEquip.map((g) => g.ordemId));

  // Revalida o vínculo (a OS pode ter vindo de uma consulta mais larga) e tira duplicata.
  const vistos = new Set<string>();
  const ordens = e.ordens
    .filter((os) => !os.excluidoEm && (os.equipamentoId === e.equipamentoId || idsPmoc.has(os.id)))
    .filter((os) => (vistos.has(os.id) ? false : (vistos.add(os.id), true)))
    .sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const porId = new Map(ordens.map((os) => [os.id, os]));

  const abertasOrdenadas = ordens.filter((os) => STATUS_ABERTOS.has(os.status));
  const retomar = osParaRetomar(abertasOrdenadas);
  const abertas = retomar ? [retomar, ...abertasOrdenadas.filter((o) => o.id !== retomar.id)] : [];

  const concluidas = ordens
    .filter((os) => os.status === 'concluida')
    .sort((a, b) => fechamento(b).localeCompare(fechamento(a)));
  const ult = concluidas[0];
  const ultimoServico: UltimoServico | undefined = ult
    ? { osId: ult.id, numero: ult.numero, titulo: ult.titulo, data: fechamento(ult), tecnicoNome: ult.tecnicoNome }
    : undefined;

  // Próxima: OS aberta com data agendada de hoje em diante, ou vencimento PMOC
  // futuro cuja OS não foi concluída/cancelada. A mais cedo vence; empate → agendada.
  const candidatas: ProximaManutencao[] = [];
  for (const os of abertasOrdenadas) {
    const dia = diaDe(os.dataAgendada);
    if (dia && dia >= e.hoje) candidatas.push({ dia, origem: 'agendada', osId: os.id });
  }
  let pmocVencida: HistoricoEquipamento['pmocVencida'];
  for (const g of geradasDoEquip) {
    const dia = diaDe(g.vencimento);
    if (!dia) continue;
    const os = porId.get(g.ordemId);
    if (os && (os.status === 'concluida' || os.status === 'cancelada')) continue;
    if (dia >= e.hoje) candidatas.push({ dia, origem: 'pmoc', osId: g.ordemId });
    else if (!pmocVencida || dia < pmocVencida.dia) pmocVencida = { dia, osId: g.ordemId };
  }
  candidatas.sort((a, b) => a.dia.localeCompare(b.dia) || (a.origem === 'agendada' ? -1 : 1));

  // Garantia: a do serviço concluído mais recente que tem texto de garantia.
  let garantia: GarantiaEquipamento | undefined;
  for (const os of concluidas) {
    const texto = os.orcamentoId ? e.garantiaPorOrcamento?.[os.orcamentoId]?.trim() : undefined;
    if (!texto) continue;
    const desde = diaDe(fechamento(os));
    const prazo = prazoGarantia(texto);
    const ate = prazo && desde ? somar(desde, prazo.qtd, prazo.unidade) : undefined;
    garantia = { texto, desde, ate, vigente: ate ? ate >= e.hoje : undefined, osNumero: os.numero };
    break;
  }

  const fotos: string[] = [];
  const add = (uri?: string) => { if (uri && !fotos.includes(uri)) fotos.push(uri); };
  e.fotosEquipamento.forEach(add);
  for (const os of ordens) os.fotos?.forEach(add);

  return {
    ordens,
    abertas,
    ultimoServico,
    proximaManutencao: candidatas[0],
    pmocVencida,
    fotos,
    garantia,
    visitasPmoc: geradasDoEquip.length,
  };
}

/** Dia local do aparelho (YYYY-MM-DD) — o "hoje" da ficha. */
export function hojeLocal(agora: Date = new Date()): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** "15/10/2026" a partir de YYYY-MM-DD ou ISO (sem depender de Intl/Hermes). */
export function diaBr(isoOuDia?: string): string {
  const dia = diaDe(isoOuDia);
  if (!dia) return '';
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}
