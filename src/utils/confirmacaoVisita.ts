/**
 * confirmacaoVisita.ts — "Confirmação de véspera com 1 toque" (Onda I3, jogada 5).
 *
 * Regras PURAS (sem banco/rede/React Native), testadas em
 * `scripts/teste-vespera-garantia.ts`. A leitura/gravação na nuvem mora em
 * `services/confirmacaoVisita.ts`; a página pública, em `worker/src/confirmacaoVisita.js`.
 *
 * COMO FUNCIONA
 *  - Às 18h o OLLI lembra: "Amanhã você tem N visitas". A fila lista as visitas de
 *    amanhã; cada uma tem [WhatsApp] que pede o link (RPC) e abre o wa.me com a
 *    mensagem pronta — o prestador revisa e envia (nada sai sozinho).
 *  - O cliente toca em [Confirmo] ou [Preciso remarcar] na página com a marca do
 *    prestador. O status volta no sync e vira selo na Agenda e no Hoje.
 *  - Quem pediu para remarcar abre uma VAGA: o OLLI sugere oferecê-la a clientes
 *    com manutenção vencida perto daquele endereço (radar + distância).
 *
 * CHAVE DA VISITA: (id da linha da agenda, dia da ocorrência). Para série
 * recorrente, o id é o da BASE e o dia é o dia ORIGINAL da ocorrência — o mesmo
 * formato das exceções da série. O selo só vale se o horário da resposta é o
 * horário ATUAL da visita: remarcou → a resposta antiga não aparece.
 */
import { clientesPerto, type ClienteComLocal } from '../services/encaixe.ts';
import { diaNoBrasil } from './contratoRecorrente.ts';
import type { Agendamento, Cliente } from '../types/index.ts';

export type StatusConfirmacao = 'pendente' | 'confirmada' | 'remarcar';

export interface ConfirmacaoVisita {
  agendamentoId: string;
  /** Dia da ocorrência (YYYY-MM-DD). */
  dia: string;
  /** Horário da visita QUANDO o link foi pedido (ISO). */
  inicio: string;
  status: StatusConfirmacao;
  respondidoEm?: string;
  expiraEm?: string;
}

/** Visita como a agenda expande (ocorrência de série tem id `<base>@<dia>`). */
export type VisitaConfirmavel = Pick<Agendamento, 'id' | 'inicio' | 'status' | 'clienteId' | 'clienteNome' | 'titulo'> & {
  excluidoEm?: string;
  ocorrenciaDe?: string;
  dataOcorrencia?: string;
};

/** Id da LINHA da agenda (a base, em ocorrência de série). */
export function idBaseDaVisita(v: Pick<VisitaConfirmavel, 'id' | 'ocorrenciaDe'>): string {
  if (v.ocorrenciaDe) return v.ocorrenciaDe;
  const i = v.id.indexOf('@');
  return i > 0 ? v.id.slice(0, i) : v.id;
}

/** Dia da ocorrência: o original da série, ou o dia (Brasília) do início. */
export function diaDaVisita(v: Pick<VisitaConfirmavel, 'inicio' | 'dataOcorrencia'>): string {
  return v.dataOcorrencia || diaNoBrasil(v.inicio);
}

export function chaveConfirmacao(agendamentoId: string, dia: string): string {
  return `${agendamentoId}|${dia}`;
}

function mesmoInstante(a?: string, b?: string): boolean {
  const ta = Date.parse(a ?? '');
  const tb = Date.parse(b ?? '');
  return Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) < 60_000;
}

/** A confirmação que vale para ESTA visita (mesma chave e mesmo horário), ou null. */
export function confirmacaoDaVisita(
  v: VisitaConfirmavel,
  mapa: ReadonlyMap<string, ConfirmacaoVisita>,
): ConfirmacaoVisita | null {
  const c = mapa.get(chaveConfirmacao(idBaseDaVisita(v), diaDaVisita(v)));
  if (!c) return null;
  return mesmoInstante(c.inicio, v.inicio) ? c : null;
}

/** Linha da nuvem → objeto; null se torta (nunca vira "confirmada" por engano). */
export function linhaParaConfirmacao(r: Record<string, unknown>): ConfirmacaoVisita | null {
  if (typeof r.agendamento_id !== 'string' || typeof r.ocorrencia_dia !== 'string' || typeof r.inicio !== 'string') return null;
  if (r.status !== 'pendente' && r.status !== 'confirmada' && r.status !== 'remarcar') return null;
  if (r.revogado_em) return null;
  return {
    agendamentoId: r.agendamento_id,
    dia: r.ocorrencia_dia.slice(0, 10),
    inicio: r.inicio,
    status: r.status,
    respondidoEm: typeof r.respondido_em === 'string' ? r.respondido_em : undefined,
    expiraEm: typeof r.expira_em === 'string' ? r.expira_em : undefined,
  };
}

export function mapaDeConfirmacoes(lista: readonly ConfirmacaoVisita[]): Map<string, ConfirmacaoVisita> {
  return new Map(lista.map((c) => [chaveConfirmacao(c.agendamentoId, c.dia), c] as const));
}

export interface SeloConfirmacaoInfo {
  tipo: StatusConfirmacao;
  rotulo: string;
  icone: 'check-circle' | 'calendar-alert' | 'clock-outline';
}

/** O selo da Agenda/Hoje. null = sem pedido de confirmação (nada a mostrar). */
export function seloDaConfirmacao(c: ConfirmacaoVisita | null): SeloConfirmacaoInfo | null {
  if (!c) return null;
  if (c.status === 'confirmada') return { tipo: 'confirmada', rotulo: 'Confirmada pelo cliente', icone: 'check-circle' };
  if (c.status === 'remarcar') return { tipo: 'remarcar', rotulo: 'Pediu para remarcar', icone: 'calendar-alert' };
  return { tipo: 'pendente', rotulo: 'Aguardando o cliente', icone: 'clock-outline' };
}

// ─── Fila "Confirmar visitas de amanhã" ─────────────────────────────────────

export type SituacaoFila = 'sem_telefone' | 'a_pedir' | StatusConfirmacao;

export interface ItemFilaVespera<V extends VisitaConfirmavel = VisitaConfirmavel> {
  visita: V;
  cliente: Cliente | null;
  telefone: string | null;
  confirmacao: ConfirmacaoVisita | null;
  situacao: SituacaoFila;
}

/** Visitas ATIVAS do dia-alvo (Brasília), mais cedo primeiro. */
export function visitasDoDia<V extends VisitaConfirmavel>(visitas: readonly V[], dia: string): V[] {
  return visitas
    .filter((v) => !v.excluidoEm && v.status === 'agendado' && diaNoBrasil(v.inicio) === dia)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export function montarFilaVespera<V extends VisitaConfirmavel>(entrada: {
  visitas: readonly V[];
  clientes: readonly Cliente[];
  confirmacoes: ReadonlyMap<string, ConfirmacaoVisita>;
  dia: string;
}): ItemFilaVespera<V>[] {
  const porId = new Map(entrada.clientes.map((c) => [c.id, c] as const));
  return visitasDoDia(entrada.visitas, entrada.dia).map((visita) => {
    const cliente = visita.clienteId ? porId.get(visita.clienteId) ?? null : null;
    const telefone = cliente?.telefone?.replace(/\D/g, '') ? cliente.telefone : null;
    const confirmacao = confirmacaoDaVisita(visita, entrada.confirmacoes);
    const situacao: SituacaoFila = confirmacao ? confirmacao.status : telefone ? 'a_pedir' : 'sem_telefone';
    return { visita, cliente, telefone, confirmacao, situacao };
  });
}

export interface ResumoFila {
  total: number;
  confirmadas: number;
  remarcar: number;
  aguardando: number;
  aPedir: number;
  semTelefone: number;
}

export function resumoFila(itens: readonly ItemFilaVespera[]): ResumoFila {
  const r: ResumoFila = { total: itens.length, confirmadas: 0, remarcar: 0, aguardando: 0, aPedir: 0, semTelefone: 0 };
  for (const i of itens) {
    if (i.situacao === 'confirmada') r.confirmadas++;
    else if (i.situacao === 'remarcar') r.remarcar++;
    else if (i.situacao === 'pendente') r.aguardando++;
    else if (i.situacao === 'a_pedir') r.aPedir++;
    else r.semTelefone++;
  }
  return r;
}

/** Frase do cartão/notificação. Fala só do que existe. */
export function fraseResumoFila(r: ResumoFila): string {
  if (r.total === 0) return 'Nenhuma visita marcada para amanhã.';
  const visitas = r.total === 1 ? '1 visita' : `${r.total} visitas`;
  const partes: string[] = [];
  if (r.confirmadas) partes.push(`${r.confirmadas} confirmada${r.confirmadas === 1 ? '' : 's'}`);
  if (r.remarcar) partes.push(`${r.remarcar} pediu${r.remarcar === 1 ? '' : 'ram'} para remarcar`);
  if (r.aguardando) partes.push(`${r.aguardando} aguardando resposta`);
  const pedir = r.aPedir + r.semTelefone;
  if (pedir) partes.push(`${pedir} sem pedido de confirmação`);
  return partes.length ? `Amanhã: ${visitas} · ${partes.join(' · ')}` : `Amanhã: ${visitas}`;
}

// ─── Textos ─────────────────────────────────────────────────────────────────

const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "14:00" no fuso de Brasília (o mesmo da página pública). */
export function horaBrasilia(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t - 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "amanhã (sex, 02/10)" / "hoje (qui, 01/10)" / "sex, 02/10". */
export function diaAmigavel(iso: string, agora: Date = new Date()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t - 3 * 3_600_000);
  const curto = `${SEMANA_CURTA[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const dia = diaNoBrasil(iso);
  const hoje = diaNoBrasil(agora.toISOString());
  const amanha = diaNoBrasil(new Date(agora.getTime() + 86_400_000).toISOString());
  if (dia === hoje) return `hoje (${curto})`;
  if (dia === amanha) return `amanhã (${curto})`;
  return curto;
}

function primeiroNome(nome?: string | null): string {
  return (nome ?? '').trim().split(/\s+/)[0] || '';
}

/** Link público da confirmação. */
export function linkConfirmacao(token: string, base = 'https://link.olliorcamentos.online'): string {
  return `${base.replace(/\/+$/, '')}/v/${token}`;
}

/**
 * Mensagem do WhatsApp (o prestador revisa e envia). Com `link`, o cliente
 * confirma com 1 toque; sem link (recurso indisponível agora), pede a resposta por
 * escrito — nunca promete um link que não existe.
 */
export function mensagemConfirmacao(entrada: {
  clienteNome?: string | null;
  nomePrestador?: string | null;
  inicio: string;
  servico?: string | null;
  link?: string | null;
  agora?: Date;
}): string {
  const nome = primeiroNome(entrada.clienteNome);
  const quem = entrada.nomePrestador?.trim() ? ` Aqui é ${entrada.nomePrestador.trim()}.` : '';
  const servico = entrada.servico?.trim() ? ` (${entrada.servico.trim()})` : '';
  const quando = `${diaAmigavel(entrada.inicio, entrada.agora)} às ${horaBrasilia(entrada.inicio)}`;
  const pedido = entrada.link
    ? ` Pode confirmar com 1 toque aqui: ${entrada.link}`
    : ' Pode me confirmar por aqui se está tudo certo?';
  return `Olá${nome ? `, ${nome}` : ''}!${quem} Sua visita está marcada para ${quando}${servico}.${pedido}`;
}

// ─── Vaga aberta → clientes com manutenção vencida por perto ────────────────

export interface CandidatoVaga<C extends ClienteComLocal = ClienteComLocal> {
  cliente: C & { distanciaKm: number };
  mesesSemContato: number;
}

/**
 * Até 3 clientes do radar (manutenção vencida) num raio de 10 km do cliente que
 * abriu a vaga. Erro nunca vira vazio: sem coordenada da origem →
 * `origem_sem_localizacao` (a tela diz "cadastre o CEP"), e os do radar sem
 * coordenada são contados.
 */
export function candidatosParaVaga<C extends ClienteComLocal>(entrada: {
  origem: { lat?: number | null; lon?: number | null } | null;
  radar: ReadonlyArray<{ cliente: C; mesesSemContato: number }>;
  ignorarIds?: string[];
  raioKm?: number;
  limite?: number;
}):
  | { ok: false; motivo: 'origem_sem_localizacao' }
  | { ok: true; candidatos: CandidatoVaga<C>[]; semLocalizacao: number } {
  const meses = new Map(entrada.radar.map((r) => [r.cliente.id, r.mesesSemContato] as const));
  const origem = entrada.origem ? { lat: entrada.origem.lat ?? undefined, lon: entrada.origem.lon ?? undefined } : null;
  const perto = clientesPerto(origem, entrada.radar.map((r) => r.cliente), {
    raioKm: entrada.raioKm ?? 10,
    limite: entrada.limite ?? 3,
    ignorarIds: entrada.ignorarIds,
  });
  if (!perto.ok) return perto;
  return {
    ok: true,
    candidatos: perto.clientes.map((c) => ({ cliente: c, mesesSemContato: meses.get(c.id) ?? 0 })),
    semLocalizacao: perto.semLocalizacao,
  };
}

/** Oferta da vaga (primeiro contato é do prestador: ele revisa e envia). */
export function mensagemOfertaVaga(entrada: {
  clienteNome?: string | null;
  nomePrestador?: string | null;
  inicio: string;
  agora?: Date;
}): string {
  const nome = primeiroNome(entrada.clienteNome);
  const quem = entrada.nomePrestador?.trim() ? ` Aqui é ${entrada.nomePrestador.trim()}.` : '';
  return `Olá${nome ? `, ${nome}` : ''}!${quem} Abriu um horário ${diaAmigavel(entrada.inicio, entrada.agora)} às ${horaBrasilia(entrada.inicio)} aqui perto de você. Quer aproveitar para fazer a manutenção?`;
}

// ─── Aviso das 18h ──────────────────────────────────────────────────────────

/** 18h de hoje se ainda não passou; entre 18h e 20h, em instantes; depois, nada. */
export function horarioAvisoVespera(agora: Date): Date | null {
  const alvo = new Date(agora);
  alvo.setHours(18, 0, 0, 0);
  if (agora.getTime() < alvo.getTime()) return alvo;
  const fim = new Date(agora);
  fim.setHours(20, 0, 0, 0);
  if (agora.getTime() < fim.getTime()) return new Date(agora.getTime() + 5_000);
  return null;
}

/** Conteúdo do aviso. null = nada a pedir (sinal real ou silêncio). */
export function conteudoAvisoVespera(r: ResumoFila): { titulo: string; corpo: string } | null {
  const aPedir = r.aPedir + r.semTelefone;
  if (r.total === 0 || aPedir === 0) return null;
  const visitas = r.total === 1 ? '1 visita' : `${r.total} visitas`;
  const falta = aPedir === r.total
    ? 'Peça a confirmação com 1 toque.'
    : `${aPedir} ainda sem pedido de confirmação.`;
  return { titulo: 'Confirmar visitas de amanhã', corpo: `Amanhã você tem ${visitas}. ${falta}` };
}
