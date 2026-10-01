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
import { CATEGORIAS_HVAC, DURACAO_PADRAO_AGENDAMENTO_MIN, FREQUENCIAS_PMOC } from '../types/index.ts';
import type {
  Agendamento,
  AtivoContrato,
  ContratoRecorrente,
  Empresa,
  Equipamento,
  ExcecaoOcorrencia,
  ExcecoesAgendamento,
  ItemChecklist,
  ModoCobrancaContrato,
  OrdemServico,
  RecorrenciaAgendamento,
  SituacaoContrato,
  StatusAgendamento,
  TipoAgendamento,
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

/** A regra de uma série já resolvida (âncora, passo, limite e duração). */
interface RegraSerie {
  /** Dia da 1ª ocorrência ('YYYY-MM-DD', Brasília) — a âncora. */
  diaBase: string;
  /** 'HH:MM' (Brasília) de todas as ocorrências não movidas. */
  horaBase: string;
  passoDias: number | null;
  meses: number | null;
  /** Último dia da série (inclusive) ou `null` = sem fim. */
  limiteDia: string | null;
  /** fim − início da linha base, em ms; `null` = sem fim. */
  duracao: number | null;
}

function regraDaSerie(a: Agendamento): RegraSerie | null {
  const ini = new Date(a.inicio).getTime();
  if (!Number.isFinite(ini) || !a.recorrencia) return null;
  const passoDias = DIAS_RECORRENCIA[a.recorrencia] ?? null;
  const meses = passoDias ? null : mesesDaPeriodicidade(a.recorrencia);
  if (!passoDias && !meses) return null;
  const fimMs = a.fim ? new Date(a.fim).getTime() : Number.NaN;
  return {
    diaBase: hojeNoBrasil(new Date(ini)),
    horaBase: new Date(ini + DESLOCAMENTO_BRASIL_MS).toISOString().slice(11, 16),
    passoDias,
    meses,
    limiteDia: a.recorrenciaAte && diaValido(a.recorrenciaAte) ? a.recorrenciaAte : null,
    duracao: Number.isFinite(fimMs) ? fimMs - ini : null,
  };
}

/** Dia da `k`-ésima ocorrência (k = 0 é a própria base). */
function diaDoCiclo(r: RegraSerie, k: number): string {
  return r.passoDias ? somarDias(r.diaBase, r.passoDias * k) : dataAncorada(r.diaBase, r.meses as number, k);
}

function diasEntre(de: string, ate: string): number {
  const a = partes(de);
  const b = partes(ate);
  return Math.round((Date.UTC(b.ano, b.mes - 1, b.d) - Date.UTC(a.ano, a.mes - 1, a.d)) / MS_DIA);
}

/**
 * `dia` ('YYYY-MM-DD') é uma ocorrência ORIGINAL da série `a` (respeitando o início
 * e o `recorrenciaAte`)? É o que impede uma exceção gravada com chave errada (ou de
 * uma regra antiga) de fabricar uma visita que a série nunca teve.
 */
export function ehDiaDaSerie(a: Agendamento, dia: string): boolean {
  const r = regraDaSerie(a);
  if (!r || !diaValido(dia) || dia < r.diaBase) return false;
  if (r.limiteDia && dia > r.limiteDia) return false;
  if (r.passoDias) return diasEntre(r.diaBase, dia) % r.passoDias === 0;
  const b = partes(r.diaBase);
  const d = partes(dia);
  const totalMeses = (d.ano - b.ano) * 12 + (d.mes - b.mes);
  const meses = r.meses as number;
  if (totalMeses % meses !== 0) return false;
  return dataAncorada(r.diaBase, meses, totalMeses / meses) === dia;
}

/** Instante (ms) ORIGINAL da ocorrência de `dia` — antes de qualquer exceção. */
function instanteOriginal(r: RegraSerie, dia: string): number {
  return new Date(instanteNoBrasil(dia, r.horaBase)).getTime();
}

function msValido(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Monta a ocorrência de `dia`, com a exceção (se houver) aplicada. */
function montarOcorrencia(a: Agendamento, r: RegraSerie, dia: string, exc?: ExcecaoOcorrencia): OcorrenciaAgendamento {
  // A 1ª ocorrência SEM exceção é a própria linha (comportamento de sempre: a tela
  // abre a base ao tocar). Com exceção ela vira `<base>@<dia>` como as demais.
  if (dia === r.diaBase && !exc) return a;
  const t = msValido(exc?.inicio) ?? instanteOriginal(r, dia);
  const fimExc = msValido(exc?.fim);
  const fim = fimExc !== null && fimExc > t ? fimExc : r.duracao !== null ? t + r.duracao : null;
  const o: OcorrenciaAgendamento = {
    ...a,
    id: `${a.id}@${dia}`,
    inicio: new Date(t).toISOString(),
    fim: fim !== null ? new Date(fim).toISOString() : undefined,
    ocorrenciaDe: a.id,
    dataOcorrencia: dia,
  };
  if (exc?.status) o.status = exc.status;
  if (exc?.titulo) o.titulo = exc.titulo;
  if (exc?.observacao !== undefined) o.observacao = exc.observacao;
  if (exc?.responsavelId) {
    o.responsavelId = exc.responsavelId;
    o.responsavelNome = exc.responsavelNome;
  }
  return o;
}

/**
 * Projeta as ocorrências de um agendamento recorrente que caem em [desdeISO, ateISO).
 * A primeira ocorrência É a própria linha (sem `ocorrenciaDe`); as demais são cópias
 * com `id` = `<base>@<YYYY-MM-DD>` e `ocorrenciaDe` = base — a tela abre a base ao
 * tocar. Âncora mensal igual à do contrato (dia 31 → último dia do mês). Série
 * cancelada ou na lixeira não projeta nada. Sem recorrência → a própria linha se
 * cair no intervalo. Nunca lança.
 *
 * EXCEÇÕES (`a.excecoes`, chave = dia ORIGINAL): ocorrência `cancelada` some; a
 * MOVIDA entra pelo horário NOVO — aparece na janela do dia para onde foi, mesmo que
 * o dia original esteja fora dela, e some do dia de onde saiu. Chave que não é dia
 * da série é ignorada (nunca fabrica visita).
 */
export function expandirRecorrencia(a: Agendamento, desdeISO: string, ateISO: string): OcorrenciaAgendamento[] {
  const ini = new Date(a.inicio).getTime();
  const desde = new Date(desdeISO).getTime();
  const ate = new Date(ateISO).getTime();
  if (!Number.isFinite(ini) || !Number.isFinite(desde) || !Number.isFinite(ate) || a.excluidoEm) return [];
  const dentro = (t: number) => t >= desde && t < ate;

  if (!a.recorrencia || a.status === 'cancelado') return dentro(ini) ? [a] : [];
  const r = regraDaSerie(a);
  if (!r) return dentro(ini) ? [a] : [];
  const excecoes = a.excecoes ?? {};
  const temExcecao = (dia: string) => Object.prototype.hasOwnProperty.call(excecoes, dia);

  // Começa um ciclo antes de `desde` sem caminhar a série inteira (uma série semanal
  // de 2024 não pode custar 100 iterações a cada troca de mês na agenda).
  let k = 0;
  if (desde > ini) {
    if (r.passoDias) {
      k = Math.max(0, Math.floor((desde - ini) / (r.passoDias * MS_DIA)) - 1);
    } else {
      const b = partes(r.diaBase);
      const d = partes(hojeNoBrasil(new Date(desde)));
      k = Math.max(0, Math.floor(((d.ano - b.ano) * 12 + (d.mes - b.mes)) / (r.meses as number)) - 1);
    }
  }

  const out: OcorrenciaAgendamento[] = [];
  for (let guarda = 0; guarda < MAX_OCORRENCIAS * 4 && out.length < MAX_OCORRENCIAS; guarda++, k++) {
    const dia = diaDoCiclo(r, k);
    if (r.limiteDia && dia > r.limiteDia) break;
    const t = instanteOriginal(r, dia);
    if (t >= ate) break;
    if (temExcecao(dia)) continue; // tratada abaixo, pelo horário efetivo
    if (!dentro(t)) continue;
    out.push(montarOcorrencia(a, r, dia));
  }

  for (const dia of Object.keys(excecoes).sort()) {
    if (out.length >= MAX_OCORRENCIAS) break;
    const exc = excecoes[dia];
    if (!exc || exc.cancelada || !ehDiaDaSerie(a, dia)) continue;
    const o = montarOcorrencia(a, r, dia, exc);
    if (dentro(new Date(o.inicio).getTime())) out.push(o);
  }
  return out.sort((x, y) => x.inicio.localeCompare(y.inicio));
}

// ─── Exceções: leitura defensiva (SQLite TEXT / jsonb da nuvem) ───────────────

const STATUS_AGENDAMENTO_VALIDOS: readonly StatusAgendamento[] = ['agendado', 'concluido', 'cancelado'];

function textoOuNada(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/**
 * `excecoes` como vem do banco (TEXT JSON no SQLite, objeto no jsonb da nuvem, nulo
 * em linha antiga) → domínio. Nulo/vazio = sem exceções (`undefined`). Campo
 * desconhecido e chave que não é dia são descartados.
 *
 * LANÇA se o valor existe mas é ilegível (JSON quebrado, array, número): "não sei
 * quais ocorrências foram canceladas" não pode virar "nenhuma foi" — isso faria a
 * visita cancelada reaparecer na agenda e tocar lembrete. Quem lista mostra o erro.
 */
export function lerExcecoes(v: unknown): ExcecoesAgendamento | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  let bruto: unknown = v;
  if (typeof v === 'string') {
    try {
      bruto = JSON.parse(v);
    } catch {
      throw new Error('Exceções da série ilegíveis (JSON inválido).');
    }
  }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    throw new Error('Exceções da série ilegíveis (esperado um objeto por dia).');
  }
  const out: ExcecoesAgendamento = {};
  for (const [dia, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!diaValido(dia) || !valor || typeof valor !== 'object' || Array.isArray(valor)) continue;
    const o = valor as Record<string, unknown>;
    const exc: ExcecaoOcorrencia = {};
    if (o.cancelada === true) exc.cancelada = true;
    if (msValido(textoOuNada(o.inicio)) !== null) exc.inicio = o.inicio as string;
    if (msValido(textoOuNada(o.fim)) !== null) exc.fim = o.fim as string;
    if (STATUS_AGENDAMENTO_VALIDOS.includes(o.status as StatusAgendamento)) exc.status = o.status as StatusAgendamento;
    const titulo = textoOuNada(o.titulo);
    if (titulo) exc.titulo = titulo;
    if (typeof o.observacao === 'string') exc.observacao = o.observacao;
    const resp = textoOuNada(o.responsavelId);
    if (resp) {
      exc.responsavelId = resp;
      const nome = textoOuNada(o.responsavelNome);
      if (nome) exc.responsavelNome = nome;
    }
    if (Object.keys(exc).length) out[dia] = exc;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Domínio → TEXT do SQLite (`null` = sem exceções). */
export function excecoesParaTexto(e: ExcecoesAgendamento | undefined): string | null {
  return e && Object.keys(e).length ? JSON.stringify(e) : null;
}

// ─── Editar UMA ocorrência, esta e as próximas, ou a série toda ──────────────

/** Alcance de uma edição feita a partir de uma ocorrência da série. */
export type AlcanceEdicaoRecorrente = 'so_esta' | 'esta_e_proximas' | 'toda_serie';

/** O que o prestador mudou na ocorrência que abriu. Só os campos presentes mudam. */
export interface MudancaOcorrencia {
  /** Cancela (só esta / esta e as próximas / a série). */
  cancelar?: boolean;
  /** Novo início desta ocorrência (ISO). Na série, o deslocamento vale para todas. */
  inicio?: string;
  /** Novo fim desta ocorrência (ISO); `null` = sem fim. */
  fim?: string | null;
  status?: StatusAgendamento;
  titulo?: string;
  observacao?: string;
  /** Outro técnico. `null` = volta para o técnico da série (em "só esta") ou tira o técnico. */
  responsavelId?: string | null;
  responsavelNome?: string;
}

/** As linhas a gravar depois de uma edição recorrente. */
export interface PlanoEdicaoRecorrente {
  /** A linha da série, já atualizada — sempre gravar. */
  base: Agendamento;
  /** Série NOVA criada por "esta e as próximas" (gravar também), quando houver. */
  novaSerie?: Agendamento;
}

/** `'<base>@<dia>'` → { baseId, dia }; id sem `@` → dia `null` (a 1ª ocorrência). */
export function dividirIdOcorrencia(id: string): { baseId: string; dia: string | null } {
  const i = id.indexOf('@');
  return i < 0 ? { baseId: id, dia: null } : { baseId: id.slice(0, i), dia: id.slice(i + 1) };
}

function semVazios(e: ExcecoesAgendamento): ExcecoesAgendamento | undefined {
  const out: ExcecoesAgendamento = {};
  for (const [dia, exc] of Object.entries(e)) if (exc && Object.keys(exc).length) out[dia] = exc;
  return Object.keys(out).length ? out : undefined;
}

/** Aplica `m` sobre a exceção atual de UMA ocorrência; o que volta a ser igual à série sai. */
function mesclarExcecao(
  base: Agendamento,
  r: RegraSerie,
  dia: string,
  atual: ExcecaoOcorrencia | undefined,
  m: MudancaOcorrencia,
): ExcecaoOcorrencia {
  if (m.cancelar) return { cancelada: true };
  const exc: ExcecaoOcorrencia = { ...(atual ?? {}) };
  delete exc.cancelada;
  const original = instanteOriginal(r, dia);
  if (m.inicio !== undefined) {
    const t = msValido(m.inicio);
    if (t === null) throw new Error('Novo horário inválido.');
    if (t === original) delete exc.inicio;
    else exc.inicio = new Date(t).toISOString();
  }
  if (m.fim !== undefined) {
    const t = msValido(m.fim);
    if (m.fim !== null && t === null) throw new Error('Novo horário de término inválido.');
    if (t === null) delete exc.fim;
    else exc.fim = new Date(t).toISOString();
  }
  if (m.status !== undefined) {
    if (m.status === base.status) delete exc.status;
    else exc.status = m.status;
  }
  if (m.titulo !== undefined) {
    if (!m.titulo.trim() || m.titulo === base.titulo) delete exc.titulo;
    else exc.titulo = m.titulo;
  }
  if (m.observacao !== undefined) {
    if (m.observacao === (base.observacao ?? '')) delete exc.observacao;
    else exc.observacao = m.observacao;
  }
  if (m.responsavelId !== undefined) {
    if (!m.responsavelId || m.responsavelId === base.responsavelId) {
      delete exc.responsavelId;
      delete exc.responsavelNome;
    } else {
      exc.responsavelId = m.responsavelId;
      if (m.responsavelNome) exc.responsavelNome = m.responsavelNome;
      else delete exc.responsavelNome;
    }
  }
  return exc;
}

/** Aplica os campos "de série" de `m` (sem horário) a uma cópia de `a`. */
function aplicarCamposDaSerie(a: Agendamento, m: MudancaOcorrencia): Agendamento {
  const b: Agendamento = { ...a };
  if (m.status !== undefined) b.status = m.status;
  if (m.titulo !== undefined && m.titulo.trim()) b.titulo = m.titulo;
  if (m.observacao !== undefined) b.observacao = m.observacao || undefined;
  if (m.responsavelId !== undefined) {
    b.responsavelId = m.responsavelId || undefined;
    b.responsavelNome = m.responsavelId ? m.responsavelNome : undefined;
  }
  return b;
}

/**
 * Planeja a edição de uma ocorrência de série recorrente (`idOcorrencia` =
 * `'<base>@<dia>'` ou o próprio id da base = 1ª ocorrência). PURO: devolve as linhas
 * a gravar; quem grava é `services/agenda.ts:editarRecorrente`.
 *
 *  - `so_esta`: grava/atualiza a EXCEÇÃO do dia (cancelar, mover, concluir, trocar
 *    técnico…). A série não muda.
 *  - `esta_e_proximas`: a série antiga termina na véspera (`recorrenciaAte`) e uma
 *    série NOVA (id `novoId`) começa nesta ocorrência, já com a mudança. Exceções
 *    futuras que continuam sendo dia da série nova vão junto. Cancelar = só encerrar.
 *    Na 1ª ocorrência equivale a `toda_serie`.
 *  - `toda_serie`: muda a linha base. Mudar o horário desloca a série inteira pelo
 *    mesmo tanto; se o deslocamento troca o DIA, as exceções (que são chaveadas pelo
 *    dia antigo) deixam de valer e são descartadas. Cancelar = série cancelada.
 *
 * LANÇA (mensagem para a tela) quando o pedido não faz sentido: id de outra linha,
 * agendamento sem recorrência, na lixeira, dia que não é da série ou horário inválido.
 * Edição recusada nunca vira "salvo sem mudar nada".
 *
 * Limite conhecido: dividir uma série mensal ancorada no dia 31 numa ocorrência
 * cortada (30/abr) ancora a série nova no dia 30.
 */
export function planejarEdicaoRecorrente(
  base: Agendamento,
  idOcorrencia: string,
  alcance: AlcanceEdicaoRecorrente,
  mudanca: MudancaOcorrencia,
  opcoes: { agora: Date; novoId: string },
): PlanoEdicaoRecorrente {
  const { baseId, dia: diaPedido } = dividirIdOcorrencia(idOcorrencia);
  if (baseId !== base.id) throw new Error('A ocorrência não pertence a este agendamento.');
  if (base.excluidoEm) throw new Error('Este agendamento está na lixeira.');
  const r = regraDaSerie(base);
  if (!r) throw new Error('Este agendamento não se repete.');
  const dia = diaPedido ?? r.diaBase;
  if (!ehDiaDaSerie(base, dia)) throw new Error('Esse dia não faz parte da série.');
  const agoraIso = opcoes.agora.toISOString();

  if (alcance === 'so_esta') {
    const excecoes = { ...(base.excecoes ?? {}) };
    excecoes[dia] = mesclarExcecao(base, r, dia, excecoes[dia], mudanca);
    return { base: { ...base, excecoes: semVazios(excecoes), atualizadoEm: agoraIso } };
  }

  // Horário EFETIVO desta ocorrência hoje (pode já ter sido movida só ela).
  const excAtual = base.excecoes?.[dia];
  const tAtual = msValido(excAtual?.inicio) ?? instanteOriginal(r, dia);
  const tNovo = mudanca.inicio !== undefined ? msValido(mudanca.inicio) : tAtual;
  if (tNovo === null) throw new Error('Novo horário inválido.');
  const fimNovo = mudanca.fim === undefined ? undefined : mudanca.fim === null ? null : msValido(mudanca.fim);
  if (mudanca.fim && fimNovo === null) throw new Error('Novo horário de término inválido.');
  if (typeof fimNovo === 'number' && fimNovo <= tNovo) throw new Error('O término precisa ser depois do início.');

  if (alcance === 'toda_serie' || dia === r.diaBase) {
    if (mudanca.cancelar) return { base: { ...base, status: 'cancelado', atualizadoEm: agoraIso } };
    const b = aplicarCamposDaSerie(base, mudanca);
    // Sem horário novo, a série fica onde está (mesmo que ESTA ocorrência tenha sido
    // movida sozinha antes: o deslocamento dela não vira regra da série).
    const delta = mudanca.inicio !== undefined ? tNovo - instanteOriginal(r, dia) : 0;
    const iniBase = new Date(base.inicio).getTime() + delta;
    b.inicio = new Date(iniBase).toISOString();
    if (fimNovo === null) b.fim = undefined;
    else if (typeof fimNovo === 'number') b.fim = new Date(iniBase + (fimNovo - tNovo)).toISOString();
    else if (r.duracao !== null) b.fim = new Date(iniBase + r.duracao).toISOString();
    // Exceções são chaveadas pelo dia ORIGINAL: se a série mudou de dia, nenhuma
    // chave antiga aponta mais para uma ocorrência real.
    const mudouDia = hojeNoBrasil(new Date(iniBase)) !== r.diaBase;
    const excecoes = { ...(base.excecoes ?? {}) };
    delete excecoes[dia]; // a mudança de série absorve a exceção da ocorrência editada
    b.excecoes = mudouDia ? undefined : semVazios(excecoes);
    b.atualizadoEm = agoraIso;
    return { base: b };
  }

  // esta_e_proximas (dia > diaBase): corta a série antiga na véspera…
  const antigas: ExcecoesAgendamento = {};
  const futuras: ExcecoesAgendamento = {};
  for (const [d, exc] of Object.entries(base.excecoes ?? {})) (d < dia ? antigas : futuras)[d] = exc;
  const baseCortada: Agendamento = {
    ...base,
    recorrenciaAte: somarDias(dia, -1),
    excecoes: semVazios(antigas),
    atualizadoEm: agoraIso,
  };
  if (mudanca.cancelar) return { base: baseCortada };

  // …e abre a série nova nesta ocorrência, com a mudança aplicada.
  const nova = aplicarCamposDaSerie(base, mudanca);
  nova.id = opcoes.novoId;
  nova.inicio = new Date(tNovo).toISOString();
  nova.fim =
    fimNovo === null
      ? undefined
      : typeof fimNovo === 'number'
        ? new Date(fimNovo).toISOString()
        : r.duracao !== null
          ? new Date(tNovo + r.duracao).toISOString()
          : undefined;
  nova.recorrenciaAte = base.recorrenciaAte;
  nova.ordemServicoId = undefined; // a OS é de UMA visita, não da série
  nova.excluidoEm = undefined;
  nova.criadoEm = agoraIso;
  nova.atualizadoEm = agoraIso;
  delete futuras[dia]; // a ocorrência editada É a 1ª da série nova
  nova.excecoes = undefined;
  const transferidas: ExcecoesAgendamento = {};
  for (const [d, exc] of Object.entries(futuras)) if (ehDiaDaSerie(nova, d)) transferidas[d] = exc;
  nova.excecoes = semVazios(transferidas);
  return { base: baseCortada, novaSerie: nova };
}

// ─── Lembretes por ocorrência ─────────────────────────────────────────────────

/**
 * Até quantos dias à frente as ocorrências de uma SÉRIE ganham lembrete local. O
 * celular tem teto de notificações agendadas (64 no iOS); duas semanas cobre a
 * próxima visita de qualquer série e a reconciliação (`resincronizarLembretes`, a
 * cada sync) empurra a janela para frente. Agendamento avulso não tem janela.
 */
export const JANELA_LEMBRETES_DIAS = 14;

export interface LembretePlanejado {
  /** Chave no mapa de lembretes: o id da ocorrência (`<base>@<dia>`, ou o da base). */
  chave: string;
  /** Quando tocar. */
  disparo: Date;
  ocorrencia: OcorrenciaAgendamento;
}

/**
 * Lembretes que o agendamento `a` deve ter AGORA: um por ocorrência ainda
 * `agendado` cujo disparo (`inicio − antecedência`) está no futuro. Série: só as
 * ocorrências dos próximos `janelaDias` (exceções aplicadas — cancelada não toca,
 * movida toca no horário novo). Avulso: o próprio, a qualquer distância. Puro.
 */
export function planejarLembretes(
  a: Agendamento,
  agora: Date,
  antecedenciaMin: number,
  janelaDias: number = JANELA_LEMBRETES_DIAS,
): LembretePlanejado[] {
  const agoraMs = agora.getTime();
  const antecedencia = antecedenciaMin * 60 * 1000;
  let ocorrencias: OcorrenciaAgendamento[];
  if (a.recorrencia) {
    ocorrencias = expandirRecorrencia(a, agora.toISOString(), new Date(agoraMs + janelaDias * MS_DIA).toISOString());
  } else {
    ocorrencias = a.excluidoEm ? [] : [a];
  }
  const out: LembretePlanejado[] = [];
  for (const o of ocorrencias) {
    if (o.status !== 'agendado') continue;
    const ini = new Date(o.inicio).getTime();
    if (!Number.isFinite(ini)) continue;
    const disparo = ini - antecedencia;
    if (disparo <= agoraMs) continue; // horário do lembrete já passou
    out.push({ chave: o.id, disparo: new Date(disparo), ocorrencia: o });
  }
  return out;
}

// ─── OS concluída → visita concluída ──────────────────────────────────────────

/**
 * Id do agendamento gerado junto com a OS de um contrato recorrente
 * (`os_cv_<x>` ↔ `ag_cv_<x>`, ver `idsDaVisita`); `null` para OS de outra origem.
 */
export function idAgendamentoDaOS(osId: string): string | null {
  return osId.startsWith('os_cv_') ? `ag_cv_${osId.slice('os_cv_'.length)}` : null;
}

/** A visita `a` está ligada à OS `osId` (pelo campo ou pelo id do contrato)? */
export function visitaLigadaAOS(a: Pick<Agendamento, 'id' | 'ordemServicoId'>, osId: string): boolean {
  return a.ordemServicoId === osId || a.id === idAgendamentoDaOS(osId);
}

/**
 * A visita como ela deve ficar depois que a OS foi CONCLUÍDA — ou `null` quando não
 * há nada a mudar (OS não concluída, visita não ligada, já concluída, cancelada ou
 * na lixeira). Avulsa: status vira `concluido`. Série: conclui só a ocorrência do
 * dia da OS (`dataAgendada`, senão `concluidoEm`), via exceção — a série continua.
 * Puro e idempotente: aplicar duas vezes não muda nada na segunda.
 */
export function visitaConcluidaPelaOS(
  a: Agendamento,
  os: Pick<OrdemServico, 'id' | 'status' | 'dataAgendada' | 'concluidoEm'>,
  agora: Date,
): Agendamento | null {
  if (os.status !== 'concluida' || a.excluidoEm || !visitaLigadaAOS(a, os.id)) return null;
  const agoraIso = agora.toISOString();
  if (!a.recorrencia) {
    if (a.status !== 'agendado') return null;
    return { ...a, status: 'concluido', atualizadoEm: agoraIso };
  }
  if (a.status === 'cancelado') return null;
  const diaOS = diaNoBrasil(os.dataAgendada || os.concluidoEm || agoraIso);
  if (!diaOS) return null;
  // A ocorrência pode ter sido MOVIDA para o dia da OS: procura pela data efetiva.
  const excecoes = a.excecoes ?? {};
  const movida = Object.keys(excecoes).find((d) => excecoes[d]?.inicio && diaNoBrasil(excecoes[d].inicio) === diaOS);
  const dia = movida ?? (ehDiaDaSerie(a, diaOS) ? diaOS : null);
  if (!dia) return null;
  const exc = excecoes[dia];
  if (exc?.cancelada || exc?.status === 'concluido') return null;
  return { ...a, excecoes: { ...excecoes, [dia]: { ...(exc ?? {}), status: 'concluido' } }, atualizadoEm: agoraIso };
}

// ─── Conflito de horário por técnico ──────────────────────────────────────────

/** O que se quer marcar (ou o que se está editando) para checar conflito. */
export interface CandidatoConflito {
  inicio: string | Date;
  /** Sem fim → duração padrão do tipo (`DURACAO_PADRAO_AGENDAMENTO_MIN`). */
  fim?: string | Date | null;
  tipo?: TipoAgendamento;
  /** Técnico. Ausente/nulo = a agenda "sem responsável" (o dono, no autônomo). */
  responsavelId?: string | null;
  /** Ao EDITAR: o id (ou id de ocorrência) do próprio item — a série inteira dele é ignorada. */
  ignorarId?: string;
}

function msDe(v: string | Date | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Fim efetivo (ms): o `fim` gravado, ou início + duração padrão do tipo. */
function fimEfetivo(ini: number, fim: string | Date | null | undefined, tipo: TipoAgendamento | undefined): number {
  const f = msDe(fim);
  if (f !== null && f > ini) return f;
  const minutos = (tipo && DURACAO_PADRAO_AGENDAMENTO_MIN[tipo]) || 60;
  return ini + minutos * 60 * 1000;
}

/**
 * Itens ATIVOS do MESMO técnico cujo intervalo cruza o do candidato, em ordem de
 * início. A duração conta: sem `fim`, vale a duração padrão do TIPO (instalação =
 * 3h, orçamento = 30min…). Técnico diferente não conflita (estão em lugares
 * diferentes); "sem responsável" só conflita com "sem responsável". Cancelado não
 * ocupa horário. Passe os itens JÁ expandidos (`getAgendamentosExpandidos`) para as
 * séries contarem. Puro — é aviso: quem chama decide se deixa salvar.
 *
 * LANÇA se o início do candidato for inválido (pergunta sem resposta não vira "livre").
 */
export function encontrarConflitosPorTecnico<
  T extends Pick<Agendamento, 'id' | 'inicio' | 'fim' | 'tipo' | 'status' | 'responsavelId'>,
>(itens: readonly T[], candidato: CandidatoConflito): T[] {
  const ini = msDe(candidato.inicio);
  if (ini === null) throw new Error('Horário de início inválido para checar conflito.');
  const fim = fimEfetivo(ini, candidato.fim, candidato.tipo);
  const tecnico = candidato.responsavelId || null;
  const ignorar = candidato.ignorarId ? idBaseDaOcorrencia(candidato.ignorarId) : null;
  const out: { item: T; ini: number }[] = [];
  for (const item of itens) {
    if (item.status === 'cancelado') continue;
    if (ignorar && idBaseDaOcorrencia(item.id) === ignorar) continue;
    if ((item.responsavelId || null) !== tecnico) continue;
    const iIni = msDe(item.inicio);
    if (iIni === null) continue; // linha sem início legível não ocupa horário conhecido
    const iFim = fimEfetivo(iIni, item.fim, item.tipo);
    if (ini < iFim && fim > iIni) out.push({ item, ini: iIni });
  }
  return out.sort((a, b) => a.ini - b.ini).map((x) => x.item);
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
