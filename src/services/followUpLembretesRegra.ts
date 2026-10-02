/**
 * followUpLembretesRegra.ts — a regra PURA dos lembretes locais de follow-up
 * (item 2.12). Sem banco, sem React, sem expo-notifications: o service
 * `followUpLembretes.ts` lê o SQLite/AsyncStorage, chama estas funções e agenda;
 * o teste `scripts/teste-followup-lembretes.ts` roda tudo isto em `node`.
 *
 * O que esta regra decide:
 *  1. FOLLOW-UP D+2 / D+5. Proposta 'enviado' (sem sinal de que o cliente abriu
 *     o link) ganha um lembrete 2 dias depois do último movimento; proposta
 *     'visualizado' (abriu e não respondeu) ganha um lembrete 5 dias depois. As
 *     duas às 09h, nunca no domingo mudo (mesma preferência do Ritual diário).
 *     "Último movimento" = `atualizadoEm` (cai para `criadoEm`), a MESMA âncora de
 *     "dias parado" do radar (`radarFollowUpRegra.ts`).
 *  2. QUEM SAI DO FOLLOW-UP NÃO RECEBE LEMBRETE. Reaproveita a regra do radar:
 *     pagamento registrado (`orcamentosComPagamento`) e proposta vencida no dia do
 *     disparo (`validaAteYmd` + `propostaExpirada`) ficam de fora; resposta do
 *     cliente (aprovado/recusado) ou qualquer status fora de enviado/visualizado
 *     também. Como o service reconcilia a cada sync (`reconciliarAgendadas`), o
 *     lembrete de quem respondeu é CANCELADO no próximo pull.
 *  3. AVISO DE RASCUNHOS. Um aviso por dia (16h) com "N orçamentos prontos para
 *     enviar" quando há rascunho parado há mais de 24h. Nenhum rascunho = nenhum
 *     aviso (nunca "0 orçamentos").
 *  4. AVISO DE RESPOSTA, UMA VEZ. "Cliente aprovou"/"Cliente recusou" sai uma
 *     única vez por orçamento: o conjunto de ids já avisados é persistido POR
 *     CONTA. Resposta antiga (fora da janela de 48h) entra no conjunto em
 *     silêncio — instalar a versão nova não pode despejar o histórico inteiro.
 *  5. O TEXTO LÊ O COMPORTAMENTO (termômetro, Pro). Com o sinal do link em mãos,
 *     o lembrete diz o que fazer: abriu 3x e voltou ao preço → "oferecer
 *     parcelar"; tocou em Aprovar e não concluiu → "pergunte se ficou dúvida";
 *     não abriu → "reenvie ou ligue". Sem sinal, o texto de sempre (que não
 *     afirma nada sobre abrir).
 *  6. VENCE AMANHÃ. Proposta esperando resposta ganha "Proposta vence amanhã" às
 *     09h da véspera da validade (ou "vence hoje" às 09h do dia, se a véspera já
 *     passou). Se cair no mesmo horário do D+2/D+5 do mesmo orçamento, sai só o
 *     de validade — dois avisos do mesmo orçamento no mesmo minuto é barulho.
 */
import type { Orcamento, Recibo } from '../types/index.ts';
import { orcamentosComPagamento, propostaExpirada, validaAteYmd } from './radarFollowUpRegra.ts';
import { formatCurrency } from '../utils/currency.ts';
import { formatarNumeroExibicao } from '../utils/numeroDocumento.ts';
import type { EstadoTermometro } from './termometroRegra.ts';

const MS_POR_HORA = 3_600_000;
const MS_POR_DIA = 86_400_000;

/** Dias depois do último movimento para lembrar de proposta sem sinal de abertura. */
export const DIAS_FOLLOWUP_NAO_ABRIU = 2;
/** Dias depois do último movimento para lembrar de proposta vista e não respondida. */
export const DIAS_FOLLOWUP_VIU_SEM_RESPOSTA = 5;
/** Hora local do lembrete de follow-up (começo do expediente, depois do "Bom dia" das 7h). */
export const HORA_FOLLOWUP = 9;
/** Hora local do aviso diário de rascunhos (dá tempo de enviar antes do "Fechar o dia" das 18h). */
export const HORA_AVISO_RASCUNHOS = 16;
/** Rascunho parado há pelo menos isto entra no aviso diário. */
export const HORAS_RASCUNHO_PARADO = 24;
/** Resposta do cliente mais antiga que isto não vira notificação (entra no conjunto em silêncio). */
export const HORAS_JANELA_AVISO_RESPOSTA = 48;
/** Quantos nomes de cliente aparecem no lembrete agrupado antes do "e mais N". */
const MAX_NOMES_AGRUPADO = 2;

/** Marca no `content.data` de toda notificação deste módulo (para reconciliar/cancelar). */
export const ORIGEM_FOLLOWUP = 'followUp' as const;

/** Payload do toque (App.tsx → `abrirDestinoDaNotificacao`). */
export interface DadosNotificacaoFollowUp {
  origem: typeof ORIGEM_FOLLOWUP;
  /** Assinatura do conteúdo agendado — muda quando alvo/texto/destino mudam. */
  chave: string;
  /** Abre este orçamento (VisualizarOrcamento). */
  orcamentoId?: string;
  /** Abre a lista de orçamentos (lembrete agrupado ou aviso de rascunhos). */
  listaOrcamentos?: 'followUp' | 'rascunhos';
}

export interface NotificacaoPlanejada {
  /** Data/hora LOCAL do disparo (sempre no futuro). */
  alvo: Date;
  titulo: string;
  corpo: string;
  data: DadosNotificacaoFollowUp;
}

export type TipoFollowUp = 'nao_abriu' | 'viu_sem_resposta';

export interface ItemFollowUpPlanejado {
  orcamentoId: string;
  tipo: TipoFollowUp;
  alvo: Date;
  /** Dias de calendário entre o último movimento e o disparo (o "há N dias" do texto). */
  diasSemMovimento: number;
}

export interface PreferenciasSilencio {
  /** Toggle "notificar também aos domingos" do Ritual diário (padrão: desligado). */
  domingoAtivo: boolean;
}

// ─── Datas ────────────────────────────────────────────────────────────────────

/** ISO legível → Date; ilegível/ausente → null (não inventamos data). */
function lerIso(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Âncora do follow-up: último movimento (`atualizadoEm`, cai para `criadoEm`). */
export function ancoraFollowUp(o: Pick<Orcamento, 'atualizadoEm' | 'criadoEm'>): Date | null {
  return lerIso(o.atualizadoEm || o.criadoEm);
}

/** Dia LOCAL de `base` + `dias`, às `hora`:00. */
export function diaMaisHora(base: Date, dias: number, hora: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias, hora, 0, 0, 0);
}

/** Domingo mudo (padrão do Ritual diário): empurra para segunda, mesma hora. */
export function pularDomingoMudo(d: Date, prefs: PreferenciasSilencio): Date {
  if (prefs.domingoAtivo || d.getDay() !== 0) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, d.getHours(), d.getMinutes(), 0, 0);
}

/** Dias de calendário LOCAL entre `de` e `ate` (ignora a hora). */
function diasDeCalendario(de: Date, ate: Date): number {
  const a = Date.UTC(de.getFullYear(), de.getMonth(), de.getDate());
  const b = Date.UTC(ate.getFullYear(), ate.getMonth(), ate.getDate());
  return Math.round((b - a) / MS_POR_DIA);
}

/** Próxima ocorrência de `hora`:00 estritamente depois de `agora`, fora do domingo mudo. */
export function proximaOcorrencia(agora: Date, hora: number, prefs: PreferenciasSilencio): Date {
  let alvo = diaMaisHora(agora, 0, hora);
  if (alvo.getTime() <= agora.getTime()) alvo = diaMaisHora(agora, 1, hora);
  return pularDomingoMudo(alvo, prefs);
}

// ─── Textos ───────────────────────────────────────────────────────────────────

function primeiroNome(o: Pick<Orcamento, 'clienteNome'>): string {
  return (o.clienteNome ?? '').trim().split(/\s+/)[0] || 'Cliente';
}

function valorTexto(o: Pick<Orcamento, 'valorTotal'>): string {
  return formatCurrency(typeof o.valorTotal === 'number' ? o.valorTotal : 0);
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e mais 2". */
function listaDeNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? '';
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  const visiveis = nomes.slice(0, MAX_NOMES_AGRUPADO);
  return `${visiveis.join(', ')} e mais ${nomes.length - visiveis.length}`;
}

function textoFollowUpUnico(
  o: Orcamento,
  item: ItemFollowUpPlanejado,
  sinal?: EstadoTermometro | null,
): { titulo: string; corpo: string } {
  const nome = primeiroNome(o);
  const n = item.diasSemMovimento;
  const dias = `${n} ${plural(n, 'dia', 'dias')}`;
  const titulo = `Orçamento nº ${o.numero} sem resposta`;
  // Termômetro (Pro): o texto acompanha o que o cliente FEZ no link.
  if (sinal?.tipo === 'medido') {
    const r = sinal.resumo;
    switch (sinal.acao.tipo) {
      case 'oferecer_parcelar':
        return {
          titulo,
          corpo: `${nome} abriu o orçamento ${r.aberturas} ${plural(r.aberturas, 'vez', 'vezes')} e voltou ao preço (${valorTexto(o)}). Que tal oferecer parcelar? Toque para ver.`,
        };
      case 'ajudar_fechar':
        return {
          titulo,
          corpo: `${nome} tocou em Aprovar e não concluiu (${valorTexto(o)}). Pergunte se ficou alguma dúvida. Toque para ver.`,
        };
      case 'reenviar':
        return {
          titulo,
          corpo: `${nome} ainda não abriu o link do orçamento (${valorTexto(o)}) — ${dias}. Reenvie ou ligue. Toque para ver o orçamento.`,
        };
      default:
        break;
    }
  }
  // Honestidade: o app só sabe que NÃO HÁ SINAL de abertura do link — quem mandou
  // só o PDF pelo WhatsApp também cai aqui. Nunca afirmamos "o cliente não abriu".
  const corpo =
    item.tipo === 'nao_abriu'
      ? `${nome} (${valorTexto(o)}): ${dias} sem sinal de que o link foi aberto. Toque para ver o orçamento.`
      : `${nome} abriu o orçamento (${valorTexto(o)}) e ainda não respondeu — ${dias} sem movimento. Toque para ver o orçamento.`;
  return { titulo, corpo };
}

/** Assinatura do agendamento: alvo + texto + destino. Mudou qualquer um → reagenda. */
export function chaveDaNotificacao(
  alvo: Date,
  titulo: string,
  corpo: string,
  destino: Pick<DadosNotificacaoFollowUp, 'orcamentoId' | 'listaOrcamentos'>,
): string {
  return [alvo.getTime(), titulo, corpo, destino.orcamentoId ?? '', destino.listaOrcamentos ?? ''].join('|');
}

function planejada(
  alvo: Date,
  titulo: string,
  corpo: string,
  destino: Pick<DadosNotificacaoFollowUp, 'orcamentoId' | 'listaOrcamentos'>,
): NotificacaoPlanejada {
  return {
    alvo,
    titulo,
    corpo,
    data: { origem: ORIGEM_FOLLOWUP, chave: chaveDaNotificacao(alvo, titulo, corpo, destino), ...destino },
  };
}

// ─── 1+2) Follow-up D+2 / D+5 ─────────────────────────────────────────────────

/**
 * Quem ganha lembrete, de que tipo e quando. Fica de fora (e, se já tinha
 * lembrete, ele é cancelado na reconciliação):
 *  - status fora de 'enviado'/'visualizado' (respondeu, negociando, rascunho...);
 *  - pagamento registrado (recibo ativo não estornado — mesma regra do radar);
 *  - proposta vencida no dia do disparo (o radar já pede "renovar", não "cobrar");
 *  - excluído (lixeira) ou com data ilegível (nunca inventamos "há 0 dias");
 *  - disparo que já passou (sem recuperar atrasado: nada de lembrete velho em rajada).
 */
export function selecionarFollowUps(
  orcamentos: readonly Orcamento[],
  recibos: readonly Pick<Recibo, 'orcamentoId' | 'estornadoEm' | 'excluidoEm'>[],
  agora: Date,
  prefs: PreferenciasSilencio,
): ItemFollowUpPlanejado[] {
  const pagos = orcamentosComPagamento(recibos);
  const itens: ItemFollowUpPlanejado[] = [];
  for (const o of orcamentos) {
    if (o.excluidoEm || pagos.has(o.id)) continue;
    const tipo: TipoFollowUp | null =
      o.status === 'enviado' ? 'nao_abriu' : o.status === 'visualizado' ? 'viu_sem_resposta' : null;
    if (!tipo) continue;
    const ancora = ancoraFollowUp(o);
    if (!ancora) continue;
    const dias = tipo === 'nao_abriu' ? DIAS_FOLLOWUP_NAO_ABRIU : DIAS_FOLLOWUP_VIU_SEM_RESPOSTA;
    const alvo = pularDomingoMudo(diaMaisHora(ancora, dias, HORA_FOLLOWUP), prefs);
    if (alvo.getTime() <= agora.getTime()) continue;
    if (propostaExpirada(validaAteYmd(o), alvo)) continue;
    itens.push({ orcamentoId: o.id, tipo, alvo, diasSemMovimento: diasDeCalendario(ancora, alvo) });
  }
  itens.sort((a, b) => a.alvo.getTime() - b.alvo.getTime() || a.orcamentoId.localeCompare(b.orcamentoId));
  return itens;
}

/**
 * Notificações do follow-up. Lembretes que caem no MESMO horário viram UMA
 * notificação agrupada ("3 orçamentos esperando resposta") — mandar 3 alertas às
 * 09h pelo mesmo assunto é barulho. Um só = abre o orçamento; agrupado = abre a lista.
 */
export interface OpcoesFollowUp {
  /** Termômetro por orçamento (só quando o plano libera e a leitura funcionou). */
  sinais?: ReadonlyMap<string, EstadoTermometro> | null;
  /** Inclui o "Proposta vence amanhã" (item 6). */
  avisoValidade?: boolean;
}

export function planejarFollowUps(
  orcamentos: readonly Orcamento[],
  recibos: readonly Pick<Recibo, 'orcamentoId' | 'estornadoEm' | 'excluidoEm'>[],
  agora: Date,
  prefs: PreferenciasSilencio,
  opcoes: OpcoesFollowUp = {},
): NotificacaoPlanejada[] {
  const porId = new Map(orcamentos.map((o) => [o.id, o] as const));
  const porHorario = new Map<number, ItemFollowUpPlanejado[]>();
  const validade = opcoes.avisoValidade ? selecionarAvisosValidade(orcamentos, recibos, agora, prefs) : [];
  const chaveValidade = new Set(validade.map((v) => `${v.orcamentoId}|${v.alvo.getTime()}`));
  for (const item of selecionarFollowUps(orcamentos, recibos, agora, prefs)) {
    if (chaveValidade.has(`${item.orcamentoId}|${item.alvo.getTime()}`)) continue;
    const grupo = porHorario.get(item.alvo.getTime()) ?? [];
    grupo.push(item);
    porHorario.set(item.alvo.getTime(), grupo);
  }
  const resultado: NotificacaoPlanejada[] = [];
  for (const grupo of porHorario.values()) {
    const alvo = grupo[0].alvo;
    if (grupo.length === 1) {
      const o = porId.get(grupo[0].orcamentoId) as Orcamento;
      const { titulo, corpo } = textoFollowUpUnico(o, grupo[0], opcoes.sinais?.get(o.id));
      resultado.push(planejada(alvo, titulo, corpo, { orcamentoId: o.id }));
      continue;
    }
    const nomes = grupo.map((i) => primeiroNome(porId.get(i.orcamentoId) as Orcamento));
    resultado.push(
      planejada(
        alvo,
        `${grupo.length} orçamentos esperando resposta`,
        `${listaDeNomes(nomes)} ainda não responderam. Toque para ver a lista.`,
        { listaOrcamentos: 'followUp' },
      ),
    );
  }
  for (const v of validade) {
    const o = porId.get(v.orcamentoId) as Orcamento;
    const quando = v.venceHoje ? 'hoje' : 'amanhã';
    resultado.push(
      planejada(
        v.alvo,
        `Proposta vence ${quando}`,
        `Orçamento nº ${formatarNumeroExibicao(o.numero)} de ${primeiroNome(o)} (${valorTexto(o)}) vale até ${quando}. Avise o cliente antes que vença. Toque para ver.`,
        { orcamentoId: o.id },
      ),
    );
  }
  return resultado;
}

// ─── 6) Proposta vence amanhã ─────────────────────────────────────────────────

/** Status em que a proposta está com o cliente (vale avisar que vai vencer). */
const ESPERANDO_RESPOSTA: ReadonlySet<string> = new Set(['enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura']);

export interface AvisoValidadePlanejado {
  orcamentoId: string;
  alvo: Date;
  /** `true` = o aviso cai no próprio último dia ("vence hoje"). */
  venceHoje: boolean;
}

/**
 * "Proposta vence amanhã": 09h da véspera do último dia válido; se a véspera já
 * passou (ou o domingo mudo a empurrou para o próprio dia), 09h do último dia, com
 * o texto "vence hoje". Sem validade legível, pagamento registrado, lixeira ou
 * status fora de "esperando resposta" = sem aviso. Nunca no passado.
 */
export function selecionarAvisosValidade(
  orcamentos: readonly Orcamento[],
  recibos: readonly Pick<Recibo, 'orcamentoId' | 'estornadoEm' | 'excluidoEm'>[],
  agora: Date,
  prefs: PreferenciasSilencio,
): AvisoValidadePlanejado[] {
  const pagos = orcamentosComPagamento(recibos);
  const avisos: AvisoValidadePlanejado[] = [];
  for (const o of orcamentos) {
    if (o.excluidoEm || pagos.has(o.id) || !ESPERANDO_RESPOSTA.has(o.status)) continue;
    const ymd = validaAteYmd(o);
    if (!ymd) continue;
    const [y, m, d] = ymd.split('-').map(Number);
    const ultimoDia = new Date(y, m - 1, d, HORA_FOLLOWUP, 0, 0, 0);
    const vespera = pularDomingoMudo(diaMaisHora(ultimoDia, -1, HORA_FOLLOWUP), prefs);
    const doDia = ultimoDia.getDay() === 0 && !prefs.domingoAtivo ? null : ultimoDia;
    let alvo: Date | null = null;
    if (vespera.getTime() > agora.getTime() && !propostaExpirada(ymd, vespera)) alvo = vespera;
    else if (doDia && doDia.getTime() > agora.getTime()) alvo = doDia;
    if (!alvo) continue;
    avisos.push({ orcamentoId: o.id, alvo, venceHoje: diasDeCalendario(alvo, ultimoDia) === 0 });
  }
  avisos.sort((a, b) => a.alvo.getTime() - b.alvo.getTime() || a.orcamentoId.localeCompare(b.orcamentoId));
  return avisos;
}

/**
 * FOLLOW-UP AUTOMÁTICO é recurso do Pro (`followup_automatico`, decisão do dono
 * em 01/10/2026 — o Grátis ficou com orçamentos ilimitados e o Pro vende o que
 * trabalha sozinho). Três estados, como todo gate da casa:
 *  - `liberado`      → os lembretes D+2/D+5 planejados;
 *  - `bloqueado`     → nenhum (a reconciliação cancela os que existirem);
 *  - `indeterminado` → `null`: NÃO SEI se pode, então quem chama não mexe em nada
 *    (não cancela lembrete válido de quem paga, não cria lembrete para quem não paga).
 * O aviso diário de rascunhos e o "Cliente aprovou/recusou" continuam em todos os
 * planos: são aviso do que já aconteceu, não automação de cobrança.
 */
export function followUpsDoPlano(
  acesso: 'liberado' | 'bloqueado' | 'indeterminado',
  planejados: NotificacaoPlanejada[],
): NotificacaoPlanejada[] | null {
  if (acesso === 'liberado') return planejados;
  if (acesso === 'bloqueado') return [];
  return null;
}

// ─── 3) Aviso diário de rascunhos ─────────────────────────────────────────────

/** Rascunhos ativos parados há >= 24h em `momento` (data ilegível fica de fora). */
export function rascunhosParados(orcamentos: readonly Orcamento[], momento: Date): Orcamento[] {
  const limite = momento.getTime() - HORAS_RASCUNHO_PARADO * MS_POR_HORA;
  return orcamentos.filter((o) => {
    if (o.status !== 'rascunho' || o.excluidoEm) return false;
    const ultimo = lerIso(o.editadoEm || o.atualizadoEm || o.criadoEm);
    return ultimo !== null && ultimo.getTime() <= limite;
  });
}

/**
 * O aviso "N orçamentos prontos para enviar" do PRÓXIMO 16h (fora do domingo
 * mudo), contando os rascunhos que estarão parados há 24h+ naquela hora. Zero
 * rascunhos = `null` (sinal real ou silêncio). Um por dia por construção: o
 * service reconcilia a cada sync e o alvo é sempre o próximo 16h.
 */
export function planejarAvisoRascunhos(
  orcamentos: readonly Orcamento[],
  agora: Date,
  prefs: PreferenciasSilencio,
): NotificacaoPlanejada | null {
  const alvo = proximaOcorrencia(agora, HORA_AVISO_RASCUNHOS, prefs);
  const n = rascunhosParados(orcamentos, alvo).length;
  if (n === 0) return null;
  return planejada(
    alvo,
    `${n} ${plural(n, 'orçamento pronto', 'orçamentos prontos')} para enviar`,
    `${plural(n, 'Rascunho parado', 'Rascunhos parados')} há mais de 24 horas e ainda não ${plural(n, 'enviado', 'enviados')}. Toque para revisar e enviar.`,
    { listaOrcamentos: 'rascunhos' },
  );
}

// ─── Reconciliação (cancela o que saiu, cria o que entrou, mantém o resto) ────

export interface AgendadaExistente {
  /** Identificador devolvido por `scheduleNotificationAsync`. */
  id: string;
  /** `data.chave` gravado no agendamento (ausente/ilegível = cancela). */
  chave: string | null;
}

/**
 * Compara o que está agendado com o plano novo. Mesma chave = mantém (não
 * recria à toa a cada sync); chave sumiu do plano = CANCELA (cliente respondeu,
 * pagou, venceu, foi excluído, mudou de texto); chave nova = cria. Duplicata da
 * mesma chave também é cancelada.
 */
export function reconciliarAgendadas(
  existentes: readonly AgendadaExistente[],
  plano: readonly NotificacaoPlanejada[],
): { cancelar: string[]; criar: NotificacaoPlanejada[] } {
  const chavesPlano = new Set(plano.map((p) => p.data.chave));
  const mantidas = new Set<string>();
  const cancelar: string[] = [];
  for (const e of existentes) {
    if (e.chave && chavesPlano.has(e.chave) && !mantidas.has(e.chave)) mantidas.add(e.chave);
    else cancelar.push(e.id);
  }
  return { cancelar, criar: plano.filter((p) => !mantidas.has(p.data.chave)) };
}

// ─── 4) Aviso de resposta do cliente, uma vez por orçamento ───────────────────

/** Uma linha do link público já cruzada com o orçamento local (se ainda existe). */
export interface RespostaDoLink {
  orcamentoId: string;
  /** Status do link na nuvem (enviado/visualizado/aprovado/recusado). */
  status: string;
  respondidoEm?: string;
  orcamento: Pick<Orcamento, 'numero' | 'clienteNome' | 'valorTotal'> | null;
}

/** Ids já avisados, POR CONTA (outra conta no mesmo aparelho começa do zero). */
export interface EstadoRespostasAvisadas {
  userId: string;
  ids: string[];
}

export interface AvisoDeResposta {
  orcamentoId: string;
  titulo: string;
  corpo: string;
}

/** Lê o JSON persistido; formato inesperado = `null` (tratado como conta nova). */
export function lerEstadoRespostas(raw: unknown): EstadoRespostasAvisadas | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { userId?: unknown; ids?: unknown };
  if (typeof r.userId !== 'string' || !Array.isArray(r.ids)) return null;
  return { userId: r.userId, ids: r.ids.filter((x): x is string => typeof x === 'string') };
}

function respondeu(status: string): status is 'aprovado' | 'recusado' {
  return status === 'aprovado' || status === 'recusado';
}

/**
 * Decide quais respostas viram notificação AGORA e qual é o estado novo a gravar.
 *  - já avisado (mesma conta) → nada;
 *  - resposta nova dentro de 48h e orçamento ainda no aparelho → avisa;
 *  - resposta velha, orçamento excluído, ou primeira leitura desta conta sem data
 *    de resposta → entra no conjunto EM SILÊNCIO (não despeja o histórico).
 * O conjunto guarda só ids que ainda têm link (não cresce para sempre) — e todo
 * id com link continua lá, então reenviar o link não faz avisar duas vezes.
 * Quem chama GRAVA `novoEstado` ANTES de notificar: se a gravação falhar, não
 * notifica (sem estado não há como garantir "uma vez").
 */
export function decidirAvisosDeResposta(
  respostas: readonly RespostaDoLink[],
  idsComLink: readonly string[],
  estado: EstadoRespostasAvisadas | null,
  userId: string,
  agora: Date,
): { avisar: AvisoDeResposta[]; novoEstado: EstadoRespostasAvisadas } {
  const contaNova = !estado || estado.userId !== userId;
  const jaAvisados = new Set(contaNova ? [] : estado.ids);
  const avisar: AvisoDeResposta[] = [];
  for (const r of respostas) {
    if (!r.orcamentoId || !respondeu(r.status) || jaAvisados.has(r.orcamentoId)) continue;
    jaAvisados.add(r.orcamentoId);
    if (!r.orcamento) continue;
    const quando = lerIso(r.respondidoEm);
    const recente = quando
      ? agora.getTime() - quando.getTime() <= HORAS_JANELA_AVISO_RESPOSTA * MS_POR_HORA
      : !contaNova;
    if (!recente) continue;
    const nome = primeiroNome(r.orcamento);
    avisar.push(
      r.status === 'aprovado'
        ? {
            orcamentoId: r.orcamentoId,
            titulo: 'Cliente aprovou',
            corpo: `${nome} aprovou o orçamento nº ${r.orcamento.numero} (${valorTexto(r.orcamento)}). Toque para ver.`,
          }
        : {
            orcamentoId: r.orcamentoId,
            titulo: 'Cliente recusou',
            corpo: `${nome} recusou o orçamento nº ${r.orcamento.numero} (${valorTexto(r.orcamento)}). Toque para ver.`,
          },
    );
  }
  const comLink = new Set(idsComLink);
  const ids = [...jaAvisados].filter((id) => comLink.has(id)).sort();
  return { avisar, novoEstado: { userId, ids } };
}
