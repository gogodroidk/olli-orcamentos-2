/**
 * CONTRATO RECORRENTE POR ATIVO — o motor (TypeScript PURO).
 *
 * A resposta à sazonalidade: o prestador fecha "manutenção mensal da piscina do
 * condomínio" uma vez e o OLLI gera sozinho cada visita (ordem de serviço + agenda),
 * lembra o técnico e prepara a cobrança do mês. O prestador não cancela o OLLI no
 * inverno porque é o OLLI que mantém os contratos dele rodando.
 *
 * Sem React Native, sem banco, sem relógio escondido: o app (celular e desktop), o
 * painel web, o worker (cron) e os testes em Node chamam ESTAS funções. Quem grava
 * é `contratoRecorrenteGeracao.ts`, que recebe uma "porta" de escrita.
 *
 * O PMOC é um caso particular: a periodicidade usa o MESMO vocabulário
 * (`FREQUENCIAS_PMOC`) e o plano PMOC já aponta para o contrato por
 * `pmoc_plans.contract_id`. A diferença é de âncora: o PMOC alinha períodos ao
 * calendário (exigência de fiscalização: "o 3º trimestre"), o contrato comercial
 * ancora no DIA combinado com o cliente ("todo dia 10").
 *
 * FUSO: o Brasil não tem horário de verão desde 2019 — Brasília é UTC−3 o ano todo.
 * Usamos o deslocamento fixo em vez de `Intl` com `timeZone` de propósito: o Hermes
 * do APK já quebrou em API de internacionalização que a web aceitava, e uma conta de
 * soma não depende de tabela de fuso nenhuma. Se o Brasil voltar a ter horário de
 * verão, a troca é aqui, num lugar só.
 */
import { CATEGORIAS_HVAC, FREQUENCIAS_PMOC } from '../types/index.ts';
import type {
  Agendamento,
  AtivoContrato,
  ContratoRecorrente,
  Empresa,
  Equipamento,
  ItemChecklist,
  ModoCobrancaContrato,
  RecorrenciaAgendamento,
  SituacaoContrato,
} from '../types/index.ts';
import { formatCurrency } from './currency.ts';
import { gerarPixCopiaECola, normalizarChavePix, pixCopiaEColaValido } from './pixBrCode.ts';

// ─── Vocabulário ──────────────────────────────────────────────────────────────

/** As periodicidades do contrato são as do PMOC (uma fonte só). */
export const PERIODICIDADES_CONTRATO = FREQUENCIAS_PMOC;

export const SITUACAO_CONTRATO_LABEL: Record<SituacaoContrato, string> = {
  rascunho: 'Rascunho',
  vigente: 'Ativo',
  suspenso: 'Pausado',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

export const MODO_COBRANCA_LABEL: Record<ModoCobrancaContrato, string> = {
  mensal: 'por mês',
  por_visita: 'por visita',
};

/** Meses por ciclo, ou `null` se a periodicidade não é uma que o app sabe calcular. */
export function mesesDaPeriodicidade(periodicidade: string): number | null {
  return PERIODICIDADES_CONTRATO.find((p) => p.id === periodicidade)?.meses ?? null;
}

export function rotuloPeriodicidade(periodicidade: string): string {
  return PERIODICIDADES_CONTRATO.find((p) => p.id === periodicidade)?.label ?? periodicidade;
}

// ─── Datas no fuso do Brasil ──────────────────────────────────────────────────

/** Brasília = UTC−3 fixo (ver cabeçalho). Em milissegundos. */
export const DESLOCAMENTO_BRASIL_MS = -3 * 60 * 60 * 1000;
const MS_DIA = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, '0');
const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 'YYYY-MM-DD' válido (inclusive o dia existir no mês)? */
export function diaValido(dia: string | null | undefined): dia is string {
  if (!dia) return false;
  const m = RE_DIA.exec(dia);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function horaValida(hora: string | null | undefined): hora is string {
  return !!hora && RE_HORA.test(hora);
}

/** O dia de calendário em Brasília em que o instante `agora` cai ('YYYY-MM-DD'). */
export function hojeNoBrasil(agora: Date = new Date()): string {
  return new Date(agora.getTime() + DESLOCAMENTO_BRASIL_MS).toISOString().slice(0, 10);
}

/** Dia (Brasília) de um ISO qualquer; '' se inválido. */
export function diaNoBrasil(iso: string | null | undefined): string {
  if (!iso) return '';
  if (diaValido(iso)) return iso;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? hojeNoBrasil(new Date(t)) : '';
}

function partes(dia: string): { ano: number; mes: number; d: number } {
  const [ano, mes, d] = dia.split('-').map(Number);
  return { ano, mes, d };
}

function ultimoDiaDoMes(ano: number, mes1: number): number {
  return new Date(Date.UTC(ano, mes1, 0)).getUTCDate();
}

/** Soma dias a um 'YYYY-MM-DD'. */
export function somarDias(dia: string, dias: number): string {
  const { ano, mes, d } = partes(dia);
  return new Date(Date.UTC(ano, mes - 1, d) + dias * MS_DIA).toISOString().slice(0, 10);
}

/**
 * `k`-ésima data a partir da âncora, andando `meses` por vez. O dia do mês é o da
 * ÂNCORA, cortado no último dia do mês de destino (âncora 31 → 28/29 em fevereiro,
 * 30 em abril) — e volta a ser 31 no mês seguinte que tiver 31. Somar mês a mês sobre
 * o resultado anterior faria a data "escorregar" para 28 para sempre.
 */
export function dataAncorada(ancora: string, meses: number, k: number): string {
  const { ano, mes, d } = partes(ancora);
  const total = mes - 1 + meses * k;
  const anoAlvo = ano + Math.floor(total / 12);
  const mesAlvo = (((total % 12) + 12) % 12) + 1;
  const dia = Math.min(d, ultimoDiaDoMes(anoAlvo, mesAlvo));
  return `${anoAlvo}-${pad2(mesAlvo)}-${pad2(dia)}`;
}

/** Instante ISO (UTC) de um dia + 'HH:MM' no fuso do Brasil. */
export function instanteNoBrasil(dia: string, hora: string): string {
  const { ano, mes, d } = partes(dia);
  const [h, min] = (horaValida(hora) ? hora : '08:00').split(':').map(Number);
  return new Date(Date.UTC(ano, mes - 1, d, h, min) - DESLOCAMENTO_BRASIL_MS).toISOString();
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** 'out/2026' — referência legível de um período 'YYYY-MM'. */
export function rotuloReferencia(periodo: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (!m) return periodo;
  return `${MESES_CURTOS[Number(m[2]) - 1] ?? m[2]}/${m[1]}`;
}

/** 'DD/MM/AAAA' de um 'YYYY-MM-DD'. */
export function diaBR(dia: string): string {
  const m = RE_DIA.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

// ─── Visitas do contrato ──────────────────────────────────────────────────────

/**
 * Quanto à frente o motor materializa visitas. 31 dias garante que a PRÓXIMA visita
 * de um contrato mensal já esteja na agenda do técnico — sem encher a agenda com o
 * ano inteiro (o que viraria ruído e lembrete falso se o contrato for pausado).
 */
export const HORIZONTE_DIAS = 31;

/**
 * Quanto para trás o motor ainda cria visita atrasada. Um contrato pausado por três
 * meses e reativado não pode despejar três OS vencidas no técnico; um gestor que
 * ficou duas semanas sem abrir o app ainda precisa ver a visita que venceu.
 */
export const JANELA_ATRASO_DIAS = 45;

/** Teto defensivo por contrato e por execução. */
export const MAX_VISITAS_POR_EXECUCAO = 24;

export interface VisitaPrevista {
  /**
   * Chave de idempotência da visita: o MÊS em que ela cai ('YYYY-MM'). Como a
   * periodicidade mínima é mensal, cada mês tem no máximo uma visita — e a chave
   * sobrevive a uma edição do dia ("do dia 10 para o dia 15" não duplica o mês).
   */
  periodo: string;
  /** Dia da visita ('YYYY-MM-DD', Brasília). */
  data: string;
}

/** Contrato que ainda está valendo em `hoje` (e por isso entra na soma e gera visita)? */
export function contratoEmVigor(c: ContratoRecorrente, hoje: string): boolean {
  if (c.excluidoEm) return false;
  if (c.situacao !== 'vigente') return false;
  if (c.dataFim && diaValido(c.dataFim) && c.dataFim < hoje) return false;
  return true;
}

/**
 * Situação que a tela mostra: um contrato `vigente` cujo fim já passou aparece como
 * encerrado (ninguém precisa lembrar de mudar a chave no dia seguinte).
 */
export function situacaoEfetiva(c: ContratoRecorrente, hoje: string): SituacaoContrato {
  if (c.situacao === 'vigente' && c.dataFim && diaValido(c.dataFim) && c.dataFim < hoje) return 'encerrado';
  return c.situacao;
}

/**
 * Datas do cronograma do contrato dentro de [desde, ate] (inclusive), respeitando o
 * início e o fim do contrato. Periodicidade desconhecida ou datas inválidas → [].
 * Nunca lança.
 */
export function datasDoCronograma(
  c: Pick<ContratoRecorrente, 'dataInicio' | 'dataFim' | 'periodicidade'>,
  desde: string,
  ate: string,
): string[] {
  const meses = mesesDaPeriodicidade(c.periodicidade);
  if (!meses || !diaValido(c.dataInicio) || !diaValido(desde) || !diaValido(ate)) return [];
  const limite = c.dataFim && diaValido(c.dataFim) && c.dataFim < ate ? c.dataFim : ate;
  if (limite < desde || limite < c.dataInicio) return [];

  // Pula direto para perto de `desde` em vez de caminhar desde o início do contrato
  // (um contrato de 2019 não pode custar 80 iterações a cada abertura do app).
  const ini = partes(c.dataInicio);
  const alvo = partes(desde);
  const mesesAteDesde = (alvo.ano - ini.ano) * 12 + (alvo.mes - ini.mes);
  let k = Math.max(0, Math.floor(mesesAteDesde / meses) - 1);

  const out: string[] = [];
  for (let guarda = 0; guarda < 2000; guarda++, k++) {
    const data = dataAncorada(c.dataInicio, meses, k);
    if (data > limite) break;
    if (data >= desde && data >= c.dataInicio) out.push(data);
  }
  return out;
}

/**
 * As visitas que o motor deve MATERIALIZAR agora (OS + agendamento), em ordem:
 *   - só contrato em vigor (vigente, fora da lixeira, antes do fim);
 *   - da maior data entre o início do contrato, o dia em que ele foi CADASTRADO
 *     (visita anterior ao cadastro aconteceu fora do OLLI) e hoje − JANELA_ATRASO_DIAS;
 *   - até hoje + HORIZONTE_DIAS (e nunca depois do fim do contrato);
 *   - no máximo MAX_VISITAS_POR_EXECUCAO (as mais recentes).
 */
export function visitasParaGerar(c: ContratoRecorrente, agora: Date = new Date()): VisitaPrevista[] {
  const hoje = hojeNoBrasil(agora);
  if (!contratoEmVigor(c, hoje)) return [];
  const cadastro = diaNoBrasil(c.criadoEm) || c.dataInicio;
  // ISO curta ordena como data: o maior texto é a data mais recente.
  const desde = [c.dataInicio, cadastro, somarDias(hoje, -JANELA_ATRASO_DIAS)].sort()[2];
  const ate = somarDias(hoje, HORIZONTE_DIAS);
  return datasDoCronograma(c, desde, ate)
    .slice(-MAX_VISITAS_POR_EXECUCAO)
    .map((data) => ({ periodo: data.slice(0, 7), data }));
}

/** As próximas `n` visitas a partir de hoje (para a tela). Contrato fora de vigor → []. */
export function proximasVisitas(c: ContratoRecorrente, agora: Date = new Date(), n = 3): string[] {
  const hoje = hojeNoBrasil(agora);
  if (!contratoEmVigor(c, hoje)) return [];
  const meses = mesesDaPeriodicidade(c.periodicidade) ?? 1;
  // Janela folgada: n ciclos + 1 cobre qualquer âncora.
  const ate = somarDias(hoje, (n + 1) * meses * 31);
  return datasDoCronograma(c, hoje, ate).slice(0, n);
}

// ─── Dinheiro ─────────────────────────────────────────────────────────────────

const centavos = (v: number): number => Math.round(v * 100) / 100;

/**
 * Receita mensal equivalente do contrato. Por mês = o próprio valor; por visita =
 * valor ÷ meses do ciclo (trimestral de R$ 300 por visita = R$ 100/mês). Valor
 * inválido ou negativo conta ZERO — nunca infla a soma.
 */
export function valorMensalEquivalente(c: Pick<ContratoRecorrente, 'valor' | 'modoCobranca' | 'periodicidade'>): number {
  const valor = Number.isFinite(c.valor) && c.valor > 0 ? c.valor : 0;
  if (c.modoCobranca === 'mensal') return centavos(valor);
  const meses = mesesDaPeriodicidade(c.periodicidade);
  return meses ? centavos(valor / meses) : 0;
}

export interface ResumoContratos {
  /** Contratos em vigor hoje. */
  ativos: number;
  /** Soma da receita mensal equivalente dos contratos em vigor ("R$ X/mês em contratos"). */
  receitaMensal: number;
  /** Em vigor com fim nos próximos 30 dias (hora de renovar). */
  terminandoEm30Dias: number;
}

export function resumirContratos(contratos: readonly ContratoRecorrente[], agora: Date = new Date()): ResumoContratos {
  const hoje = hojeNoBrasil(agora);
  const em30 = somarDias(hoje, 30);
  let ativos = 0;
  let receita = 0;
  let terminando = 0;
  for (const c of contratos) {
    if (!contratoEmVigor(c, hoje)) continue;
    ativos += 1;
    receita += valorMensalEquivalente(c);
    if (c.dataFim && diaValido(c.dataFim) && c.dataFim <= em30) terminando += 1;
  }
  return { ativos, receitaMensal: centavos(receita), terminandoEm30Dias: terminando };
}

/** "R$ 1.250,00/mês em contratos" — a frase do topo da lista. */
export function fraseReceitaMensal(resumo: ResumoContratos): string {
  return `${formatCurrency(resumo.receitaMensal)}/mês em contratos`;
}

// ─── Ids determinísticos (idempotência entre aparelhos) ───────────────────────
//
// Celular, painel e cron podem gerar a MESMA visita ao mesmo tempo. Se cada um
// sorteasse um id, dois inserts "novos" passariam e o técnico iria duas vezes ao
// cliente. Com o id derivado de (contrato, período), a segunda escrita colide com a
// primeira e vira no-op — no banco, não na sorte.

export function idsDaVisita(contratoId: string, periodo: string): { reserva: string; ordem: string; agendamento: string } {
  const base = `${contratoId}_${periodo}`;
  return { reserva: `cv_${base}`, ordem: `os_cv_${base}`, agendamento: `ag_cv_${base}` };
}

// ─── Linhas que a geração grava (formato do BANCO, snake_case) ────────────────

export type Linha = Record<string, unknown>;

/** Checklist da visita: cada atividade para cada ativo (ou "Atender <ativo>"). */
export function checklistDaVisita(
  ordemId: string,
  ativos: readonly AtivoContrato[],
  atividades: readonly string[],
): ItemChecklist[] {
  const tarefas = atividades.map((a) => a?.trim()).filter((a): a is string => !!a);
  const alvos = ativos.map((a) => a?.nome?.trim()).filter((n): n is string => !!n);
  const textos: string[] = [];
  if (!alvos.length) textos.push(...tarefas);
  for (const alvo of alvos) {
    if (!tarefas.length) textos.push(`Atender ${alvo}`);
    for (const t of tarefas) textos.push(`${alvo}: ${t}`);
  }
  return textos.map((texto, i) => ({ id: `${ordemId}_${i + 1}`, texto, feito: false }));
}

/** Título da visita: "Manutenção da piscina — out/2026". */
export function tituloDaVisita(c: Pick<ContratoRecorrente, 'titulo'>, periodo: string): string {
  return `${c.titulo?.trim() || 'Contrato'} — ${rotuloReferencia(periodo)}`;
}

export interface LinhasDaVisita {
  reserva: Linha;
  ordem: Linha;
  agendamento: Linha;
}

/**
 * As três linhas de uma visita. `userId` é o DONO do tenant (o do contrato), nunca
 * quem está logado: a visita de um contrato do dono nasce no tenant do dono mesmo
 * quando quem disparou foi o gestor. `numeroOs` vem de fora (sequência do tenant).
 */
export function linhasDaVisita(
  c: ContratoRecorrente,
  visita: VisitaPrevista,
  opcoes: { userId: string; numeroOs: string; agora: Date },
): LinhasDaVisita {
  const ids = idsDaVisita(c.id, visita.periodo);
  const inicio = instanteNoBrasil(visita.data, c.horarioVisita);
  const fim = new Date(new Date(inicio).getTime() + 60 * 60 * 1000).toISOString();
  const agoraIso = opcoes.agora.toISOString();
  const titulo = tituloDaVisita(c, visita.periodo);
  const ativos = c.ativos.map((a) => a.nome).filter(Boolean).join(', ');
  const observacoes =
    `Visita gerada pelo contrato ${c.numero ? `nº ${c.numero} ` : ''}"${c.titulo}" ` +
    `(${rotuloPeriodicidade(c.periodicidade).toLowerCase()}) — ${diaBR(visita.data)}.` +
    (ativos ? ` Ativos: ${ativos}.` : '');

  return {
    reserva: {
      id: ids.reserva,
      user_id: opcoes.userId,
      contrato_id: c.id,
      periodo: visita.periodo,
      data_prevista: visita.data,
      ordem_id: ids.ordem,
      agendamento_id: ids.agendamento,
      criado_em: agoraIso,
      atualizado_em: agoraIso,
    },
    ordem: {
      id: ids.ordem,
      user_id: opcoes.userId,
      numero: opcoes.numeroOs,
      cliente_id: c.clienteId ?? null,
      cliente_nome: c.clienteNome ?? '',
      titulo,
      status: 'agendada',
      tecnico_id: c.responsavelId ?? null,
      tecnico_nome: c.responsavelId ? (c.responsavelNome ?? null) : null,
      data_agendada: inicio,
      checklist: checklistDaVisita(ids.ordem, c.ativos, c.atividades),
      fotos: [],
      observacoes,
      // Por visita: a OS carrega o valor a cobrar. Mensal: a cobrança é do mês, não da OS.
      valor: c.modoCobranca === 'por_visita' && c.valor > 0 ? centavos(c.valor) : null,
      criado_em: agoraIso,
      atualizado_em: agoraIso,
    },
    agendamento: {
      id: ids.agendamento,
      user_id: opcoes.userId,
      cliente_id: c.clienteId ?? null,
      cliente_nome: c.clienteNome ?? '',
      titulo,
      tipo: 'manutencao',
      inicio,
      fim,
      endereco: c.endereco ?? null,
      status: 'agendado',
      observacao: observacoes,
      responsavel_id: c.responsavelId ?? null,
      responsavel_nome: c.responsavelId ? (c.responsavelNome ?? null) : null,
      contrato_id: c.id,
      criado_em: agoraIso,
      atualizado_em: agoraIso,
    },
  };
}

/**
 * Nome curto de um equipamento do inventário para virar ativo do contrato
 * ("Split Sala 302"). Mesma regra do título da OS do PMOC.
 */
export function nomeDoEquipamento(
  eq: Pick<Equipamento, 'categoria' | 'localizacao' | 'modelo' | 'codigoInterno' | 'patrimonio' | 'numeroSerie'>,
): string {
  const categoria = eq.categoria ? (CATEGORIAS_HVAC.find((c) => c.id === eq.categoria)?.label ?? eq.categoria) : '';
  const partes = [categoria, eq.localizacao?.trim()].filter((s): s is string => !!s);
  if (partes.length) return partes.join(' ');
  return eq.modelo?.trim() || eq.codigoInterno?.trim() || eq.patrimonio?.trim() || eq.numeroSerie?.trim() || 'Equipamento';
}

// ─── Linha do banco ⇄ domínio (service_contracts) ─────────────────────────────

function lerAtivos(v: unknown): AtivoContrato[] {
  if (!Array.isArray(v)) return [];
  const out: AtivoContrato[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const nome = typeof o.nome === 'string' ? o.nome.trim() : '';
    const id = typeof o.id === 'string' && o.id ? o.id : '';
    if (!nome || !id) continue;
    out.push({ id, nome, ...(typeof o.assetId === 'string' && o.assetId ? { assetId: o.assetId } : {}) });
  }
  return out;
}

function lerTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [];
}

const SITUACOES: readonly SituacaoContrato[] = ['rascunho', 'vigente', 'suspenso', 'encerrado', 'cancelado'];

/**
 * Data vinda do banco como texto. O PostgREST devolve `date` como 'YYYY-MM-DD' e
 * `timestamptz` como ISO; um driver Postgres direto (o cron, os testes) pode devolver
 * `Date` — sem isto, `String(Date)` viraria "Thu Sep 10 2026…" e o contrato pararia
 * de gerar visita em silêncio.
 */
function textoData(v: unknown, soDia: boolean): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? (soDia ? v.toISOString().slice(0, 10) : v.toISOString()) : undefined;
  return String(v);
}

/** Linha de `service_contracts` → domínio. Campo desconhecido/estranho vira o default seguro. */
export function linhaParaContrato(r: Linha): ContratoRecorrente {
  const situacaoBruta = String(r.situacao ?? 'rascunho') as SituacaoContrato;
  // Situações do fluxo jurídico antigo (em_revisao, aguardando_assinatura) NÃO geram
  // visita: caem em rascunho para a tela, sem reescrever o banco.
  const situacao = SITUACOES.includes(situacaoBruta) ? situacaoBruta : 'rascunho';
  const valor = Number(r.valor);
  return {
    id: String(r.id),
    userId: typeof r.user_id === 'string' ? r.user_id : undefined,
    numero: (r.numero as string | null) ?? undefined,
    titulo: (r.titulo as string | null)?.trim() || 'Contrato',
    clienteId: (r.cliente_id as string | null) ?? undefined,
    clienteNome: (r.cliente_nome as string | null) ?? undefined,
    endereco: (r.endereco as string | null) ?? undefined,
    situacao,
    periodicidade: String(r.periodicidade ?? 'mensal'),
    dataInicio: textoData(r.data_inicio, true) ?? '',
    dataFim: textoData(r.data_fim, true),
    renovacao: r.renovacao === 'automatica' ? 'automatica' : r.renovacao === 'manual' ? 'manual' : undefined,
    horarioVisita: horaValida(r.horario_visita as string) ? (r.horario_visita as string) : '08:00',
    ativos: lerAtivos(r.ativos),
    atividades: lerTextos(r.atividades),
    modoCobranca: r.modo_cobranca === 'por_visita' ? 'por_visita' : 'mensal',
    valor: Number.isFinite(valor) && valor >= 0 ? valor : 0,
    responsavelId: (r.responsavel_id as string | null) ?? undefined,
    responsavelNome: (r.responsavel_nome as string | null) ?? undefined,
    observacoes: (r.observacoes as string | null) ?? undefined,
    criadoEm: textoData(r.criado_em, false) ?? new Date(0).toISOString(),
    atualizadoEm: textoData(r.atualizado_em, false) ?? textoData(r.criado_em, false) ?? new Date(0).toISOString(),
    excluidoEm: textoData(r.excluido_em, false),
  };
}

/** Domínio → linha de `service_contracts` (sem user_id: quem grava decide o tenant). */
export function contratoParaLinha(c: ContratoRecorrente): Linha {
  return {
    id: c.id,
    numero: c.numero?.trim() || null,
    titulo: c.titulo.trim(),
    cliente_id: c.clienteId ?? null,
    cliente_nome: c.clienteNome?.trim() || null,
    endereco: c.endereco?.trim() || null,
    situacao: c.situacao,
    periodicidade: c.periodicidade,
    data_inicio: c.dataInicio,
    data_fim: c.dataFim || null,
    renovacao: c.renovacao ?? 'manual',
    horario_visita: horaValida(c.horarioVisita) ? c.horarioVisita : '08:00',
    ativos: c.ativos.map((a) => ({ id: a.id, nome: a.nome.trim(), ...(a.assetId ? { assetId: a.assetId } : {}) })),
    atividades: c.atividades.map((a) => a.trim()).filter(Boolean),
    modo_cobranca: c.modoCobranca,
    valor: centavos(Math.max(0, Number.isFinite(c.valor) ? c.valor : 0)),
    responsavel_id: c.responsavelId || null,
    responsavel_nome: c.responsavelId ? c.responsavelNome?.trim() || null : null,
    observacoes: c.observacoes?.trim() || null,
    criado_em: c.criadoEm,
    atualizado_em: c.atualizadoEm,
    excluido_em: c.excluidoEm ?? null,
  };
}

/**
 * Motivos pelos quais o contrato NÃO pode ser salvo (vazio = pode). A tela mostra o
 * primeiro; o banco tem CHECKs equivalentes como última linha de defesa.
 */
export function validarContrato(c: ContratoRecorrente): string[] {
  const erros: string[] = [];
  if (!c.titulo?.trim()) erros.push('Dê um nome ao contrato (ex.: "Manutenção mensal da piscina").');
  if (!c.clienteId && !c.clienteNome?.trim()) erros.push('Escolha o cliente do contrato.');
  if (!c.ativos.length) erros.push('Inclua pelo menos um ativo atendido (equipamento, piscina, caixa d\'água…).');
  if (!mesesDaPeriodicidade(c.periodicidade)) erros.push('Escolha a periodicidade das visitas.');
  if (!diaValido(c.dataInicio)) erros.push('Informe a data da primeira visita.');
  if (c.dataFim && !diaValido(c.dataFim)) erros.push('A data de fim não é válida.');
  if (c.dataFim && diaValido(c.dataInicio) && diaValido(c.dataFim) && c.dataFim < c.dataInicio) {
    erros.push('O fim do contrato não pode ser antes da primeira visita.');
  }
  if (!horaValida(c.horarioVisita)) erros.push('Informe o horário da visita (HH:MM).');
  if (!Number.isFinite(c.valor) || c.valor < 0) erros.push('Informe um valor válido (pode ser zero).');
  return erros;
}

// ─── Cobrança do contrato (Pix do PRESTADOR — o OLLI não intermedeia) ─────────

export type SituacaoPixContrato = 'com_pix' | 'sem_chave' | 'chave_invalida' | 'sem_valor';

export interface CobrancaContrato {
  texto: string;
  situacaoPix: SituacaoPixContrato;
  pixCopiaECola: string;
  valor: number;
}

function primeiroNome(nome?: string): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'tudo bem';
}

/**
 * Mensagem de cobrança do contrato para o WhatsApp — a MESMA regra de ouro da
 * cobrança com 1 toque (`utils/cobrancaCliente.ts`): o Pix só entra com chave
 * RECONHECIDA e código aprovado na conferência EMV+CRC. Sem chave, chave duvidosa ou
 * valor zerado, a mensagem sai SEM Pix (nunca com um Pix quebrado). O dinheiro vai
 * direto para a conta do prestador: não é compra dentro do app, vale em qualquer loja.
 *
 * `valor` = o do contrato (por mês ou por visita, conforme o modo). Nunca lança.
 */
export function prepararCobrancaContrato(entrada: {
  contrato: ContratoRecorrente;
  empresa: Pick<Empresa, 'chavePix' | 'nome' | 'nomePrestador' | 'cidade'> | null | undefined;
  /** Período cobrado ('YYYY-MM'); ausente = o mês de hoje em Brasília. */
  periodo?: string;
  agora?: Date;
}): CobrancaContrato {
  const { contrato: c, empresa } = entrada;
  const periodo = entrada.periodo ?? hojeNoBrasil(entrada.agora ?? new Date()).slice(0, 7);
  const valor = centavos(Number.isFinite(c.valor) && c.valor > 0 ? c.valor : 0);
  const referencia = c.modoCobranca === 'por_visita' ? `visita de ${rotuloReferencia(periodo)}` : `mensalidade de ${rotuloReferencia(periodo)}`;
  const cabeca = `Olá, ${primeiroNome(c.clienteNome)}! Segue a ${referencia} do contrato "${c.titulo}"${c.numero ? ` (nº ${c.numero})` : ''}: ${formatCurrency(valor)}.`;

  const semPix = (situacaoPix: SituacaoPixContrato): CobrancaContrato => ({
    texto: [cabeca, 'Qualquer dúvida sobre a forma de pagamento, é só me chamar por aqui.'].join('\n'),
    situacaoPix,
    pixCopiaECola: '',
    valor,
  });

  const bruta = (empresa?.chavePix ?? '').trim();
  if (!bruta) return semPix('sem_chave');
  const chave = normalizarChavePix(bruta);
  if (!chave) return semPix('chave_invalida');
  if (valor <= 0) return semPix('sem_valor');

  const pix = gerarPixCopiaECola({
    chave: chave.chave,
    valor,
    nome: empresa?.nome || empresa?.nomePrestador || '',
    cidade: empresa?.cidade || '',
    // txid só alfanumérico (o gerador limpa): contrato + mês, para o prestador conciliar.
    txid: `CT${(c.numero || c.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}${periodo.replace('-', '')}`,
  });
  if (!pixCopiaEColaValido(pix)) return semPix('chave_invalida');

  return {
    texto: [cabeca, 'Dá pra pagar por Pix copiando o código abaixo (já vem com o valor):', pix].join('\n'),
    situacaoPix: 'com_pix',
    pixCopiaECola: pix,
    valor,
  };
}

// ─── Recorrência de agendamento (projeção, sem materializar linhas) ───────────

const DIAS_RECORRENCIA: Partial<Record<RecorrenciaAgendamento, number>> = { semanal: 7, quinzenal: 14 };

/** Teto de ocorrências projetadas por série numa consulta (uma agenda de 1 ano semanal = 53). */
export const MAX_OCORRENCIAS = 400;

/** Ocorrência projetada: a base com `inicio`/`fim` deslocados e `ocorrenciaDe` = id da base. */
export type OcorrenciaAgendamento = Agendamento & { ocorrenciaDe?: string; dataOcorrencia?: string };

/**
 * Projeta as ocorrências de um agendamento recorrente que caem em [desdeISO, ateISO).
 * A primeira ocorrência É a própria linha (sem `ocorrenciaDe`); as demais são cópias
 * com `id` = `<base>@<YYYY-MM-DD>` e `ocorrenciaDe` = base — a tela abre a base ao
 * tocar. Âncora mensal igual à do contrato (dia 31 → último dia do mês). Série
 * cancelada ou na lixeira não projeta nada. Sem recorrência → a própria linha se
 * cair no intervalo. Nunca lança.
 */
export function expandirRecorrencia(a: Agendamento, desdeISO: string, ateISO: string): OcorrenciaAgendamento[] {
  const ini = new Date(a.inicio).getTime();
  const desde = new Date(desdeISO).getTime();
  const ate = new Date(ateISO).getTime();
  if (!Number.isFinite(ini) || !Number.isFinite(desde) || !Number.isFinite(ate) || a.excluidoEm) return [];
  const duracao = a.fim && Number.isFinite(new Date(a.fim).getTime()) ? new Date(a.fim).getTime() - ini : null;
  const dentro = (t: number) => t >= desde && t < ate;

  if (!a.recorrencia || a.status === 'cancelado') return dentro(ini) ? [a] : [];

  const diaBase = hojeNoBrasil(new Date(ini));
  const horaBase = new Date(ini + DESLOCAMENTO_BRASIL_MS).toISOString().slice(11, 16);
  const limiteDia = a.recorrenciaAte && diaValido(a.recorrenciaAte) ? a.recorrenciaAte : null;
  const passoDias = DIAS_RECORRENCIA[a.recorrencia];
  const meses = passoDias ? null : mesesDaPeriodicidade(a.recorrencia);
  if (!passoDias && !meses) return dentro(ini) ? [a] : [];

  // Começa um ciclo antes de `desde` sem caminhar a série inteira (uma série semanal
  // de 2024 não pode custar 100 iterações a cada troca de mês na agenda).
  let k = 0;
  if (desde > ini) {
    if (passoDias) {
      k = Math.max(0, Math.floor((desde - ini) / (passoDias * MS_DIA)) - 1);
    } else {
      const b = partes(diaBase);
      const d = partes(hojeNoBrasil(new Date(desde)));
      k = Math.max(0, Math.floor(((d.ano - b.ano) * 12 + (d.mes - b.mes)) / (meses as number)) - 1);
    }
  }

  const out: OcorrenciaAgendamento[] = [];
  for (let guarda = 0; guarda < MAX_OCORRENCIAS * 4 && out.length < MAX_OCORRENCIAS; guarda++, k++) {
    const dia = passoDias ? somarDias(diaBase, passoDias * k) : dataAncorada(diaBase, meses as number, k);
    if (limiteDia && dia > limiteDia) break;
    const t = new Date(instanteNoBrasil(dia, horaBase)).getTime();
    if (t >= ate) break;
    if (!dentro(t)) continue;
    if (k === 0) {
      out.push(a);
      continue;
    }
    out.push({
      ...a,
      id: `${a.id}@${dia}`,
      inicio: new Date(t).toISOString(),
      fim: duracao !== null ? new Date(t + duracao).toISOString() : undefined,
      ocorrenciaDe: a.id,
      dataOcorrencia: dia,
    });
  }
  return out;
}

/** Id da linha real por trás de uma ocorrência projetada (a própria, se não for projeção). */
export function idBaseDaOcorrencia(id: string): string {
  const i = id.indexOf('@');
  return i < 0 ? id : id.slice(0, i);
}

/** Rótulo curto da recorrência para o cartão da agenda ("Repete: todo mês"). */
export function rotuloRecorrencia(r: RecorrenciaAgendamento | undefined | null): string {
  switch (r) {
    case 'semanal':
      return 'toda semana';
    case 'quinzenal':
      return 'a cada 15 dias';
    case 'mensal':
      return 'todo mês';
    case 'bimestral':
      return 'a cada 2 meses';
    case 'trimestral':
      return 'a cada 3 meses';
    case 'semestral':
      return 'a cada 6 meses';
    case 'anual':
      return 'todo ano';
    default:
      return '';
  }
}

// ─── Visão por técnico ────────────────────────────────────────────────────────

/** Filtro da agenda por responsável: 'todos', 'sem' (ninguém definido) ou um user id. */
export type FiltroResponsavel = 'todos' | 'sem' | string;

export function filtrarPorResponsavel<T extends Pick<Agendamento, 'responsavelId'>>(itens: readonly T[], filtro: FiltroResponsavel): T[] {
  if (filtro === 'todos') return [...itens];
  if (filtro === 'sem') return itens.filter((i) => !i.responsavelId);
  return itens.filter((i) => i.responsavelId === filtro);
}
