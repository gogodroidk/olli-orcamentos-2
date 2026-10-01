/**
 * PÁGINA DO CLIENTE (item 2.15) — a parte que não é tela: KPIs e linha do tempo.
 *
 * TypeScript PURO, sem React Native: a `ClienteDetalheScreen` lê o SQLite e passa
 * as listas para cá; o teste (`scripts/teste-cliente-detalhe.ts`) chama as mesmas
 * funções em Node. Nada aqui lê banco, relógio implícito ou rede — `agora` entra
 * por parâmetro.
 *
 * DE QUEM É o documento: casamento por `clienteId`, nunca por nome. Dois "João"
 * diferentes não podem somar o gasto um do outro. A única exceção é a OS avulsa
 * antiga sem `clienteId` que nasceu de um orçamento DESTE cliente (`orcamentoId`):
 * aí o vínculo é pelo documento, não pelo nome.
 *
 * KPIs (sem chute — ausência vira `null`, e a tela diz "sem registro"):
 *  - gasto total pago: soma dos RECIBOS não estornados (é o dinheiro que entrou;
 *    orçamento aprovado é promessa, não pagamento);
 *  - último serviço: a MESMA regra do pós-venda (`utils/posVenda.ts`): recibo,
 *    agendamento concluído, orçamento aprovado/convertido. Assim o "próximo
 *    lembrete" desta tela bate com a lista "Clientes para lembrar";
 *  - próxima visita: a primeira ocorrência AGENDADA (com as séries recorrentes já
 *    projetadas por quem chama) que ainda não começou;
 *  - próximo lembrete: último serviço + o intervalo do ofício (`retorno.meses`).
 */
import {
  STATUS_AGENDAMENTO_LABELS,
  STATUS_LABELS,
  STATUS_OS_LABELS,
  TIPO_AGENDAMENTO_LABELS,
} from '../types/index.ts';
import type {
  Agendamento,
  Cliente,
  Orcamento,
  OrdemServico,
  Recibo,
} from '../types/index.ts';
import { msDe, msDoRecibo, somarMeses } from './posVenda.ts';

// ─── KPIs ────────────────────────────────────────────────────────────────────

/** Ocorrência de agenda (linha real ou repetição projetada de uma série). */
export type OcorrenciaVisita = Agendamento & { ocorrenciaDe?: string };

export interface EntradaCliente {
  clienteId: string;
  orcamentos: readonly Orcamento[];
  ordens: readonly OrdemServico[];
  recibos: readonly Recibo[];
  /** Linhas reais da agenda (timeline e "último serviço"). */
  agendamentos: readonly Agendamento[];
  /**
   * Ocorrências FUTURAS já expandidas (`getAgendamentosExpandidos`) — só para a
   * próxima visita. Sem isto, uma manutenção mensal recorrente nunca apareceria
   * como "próxima" depois do 1º mês. Ausente = usa `agendamentos`.
   */
  ocorrenciasFuturas?: readonly OcorrenciaVisita[];
  /** Intervalo do ofício em meses (`retornoDoOficio(...).meses`). */
  mesesIntervalo: number;
  agora?: Date;
}

export interface ProximaVisita {
  /** ISO do início. */
  inicio: string;
  titulo: string;
  /** Id da LINHA real (a base da série, quando é repetição) — é ela que a Agenda abre. */
  agendamentoId: string;
}

export interface ProximoLembrete {
  /** ISO do dia em que o retorno vence (último serviço + intervalo do ofício). */
  quando: string;
  /** true = a data já passou: o cliente já está na hora de ser lembrado. */
  vencido: boolean;
}

export interface KpisCliente {
  gastoTotalPago: number;
  /** Quantos recibos (não estornados) compõem o gasto. */
  pagamentos: number;
  /** ISO do último serviço concluído, ou null se nunca houve. */
  ultimoServico: string | null;
  proximaVisita: ProximaVisita | null;
  proximoLembrete: ProximoLembrete | null;
}

function doCliente<T extends { clienteId?: string | null }>(lista: readonly T[], clienteId: string): T[] {
  const id = clienteId.trim();
  if (!id) return [];
  return lista.filter((x) => (x.clienteId ?? '').trim() === id);
}

function ativo(x: { excluidoEm?: string | null }): boolean {
  return !x.excluidoEm;
}

function valorPositivo(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Arredonda para centavos (soma de float não pode virar R$ 0,30000000004). */
function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Documentos do cliente (lixeira fora). OS legada sem cliente entra pelo orçamento de origem. */
export function documentosDoCliente(entrada: Pick<EntradaCliente, 'clienteId' | 'orcamentos' | 'ordens' | 'recibos' | 'agendamentos'>): {
  orcamentos: Orcamento[];
  ordens: OrdemServico[];
  recibos: Recibo[];
  agendamentos: Agendamento[];
} {
  const orcamentos = doCliente(entrada.orcamentos, entrada.clienteId).filter(ativo);
  const idsOrcamento = new Set(orcamentos.map((o) => o.id));
  const ordens = entrada.ordens.filter((os) => {
    if (!ativo(os)) return false;
    const dono = (os.clienteId ?? '').trim();
    if (dono) return dono === entrada.clienteId.trim();
    return !!os.orcamentoId && idsOrcamento.has(os.orcamentoId);
  });
  return {
    orcamentos,
    ordens,
    recibos: doCliente(entrada.recibos, entrada.clienteId).filter(ativo),
    agendamentos: doCliente(entrada.agendamentos, entrada.clienteId).filter(ativo),
  };
}

/** KPIs do topo da página. Nunca lança. */
export function calcularKpisCliente(entrada: EntradaCliente): KpisCliente {
  const agora = (entrada.agora ?? new Date()).getTime();
  const docs = documentosDoCliente(entrada);

  let gasto = 0;
  let pagamentos = 0;
  let ultimo: number | null = null;
  const marcar = (t: number | null) => {
    if (t === null || !Number.isFinite(t) || t > agora) return; // "no futuro" não é serviço feito
    if (ultimo === null || t > ultimo) ultimo = t;
  };

  for (const r of docs.recibos) {
    if (r.estornadoEm) continue; // estorno devolveu o dinheiro: não é gasto nem prova de serviço
    gasto += valorPositivo(r.valorRecebido);
    pagamentos++;
    marcar(msDoRecibo(r.dataRecebimento, r.criadoEm));
  }
  for (const o of docs.orcamentos) {
    if (o.status !== 'aprovado' && o.status !== 'convertido') continue;
    marcar(msDe(o.atualizadoEm || o.criadoEm));
  }
  for (const a of docs.agendamentos) {
    if (a.status !== 'concluido') continue;
    marcar(msDe(a.fim || a.inicio));
  }

  const futuras: readonly OcorrenciaVisita[] = entrada.ocorrenciasFuturas
    ? doCliente(entrada.ocorrenciasFuturas, entrada.clienteId).filter(ativo)
    : docs.agendamentos;
  let proxima: ProximaVisita | null = null;
  let proximaMs = Infinity;
  for (const a of futuras) {
    if (a.status !== 'agendado') continue;
    const t = msDe(a.inicio);
    if (t === null || t < agora || t >= proximaMs) continue;
    proximaMs = t;
    proxima = {
      inicio: new Date(t).toISOString(),
      titulo: (a.titulo ?? '').trim() || TIPO_AGENDAMENTO_LABELS[a.tipo] || 'Visita',
      agendamentoId: a.ocorrenciaDe || a.id,
    };
  }

  let lembrete: ProximoLembrete | null = null;
  if (ultimo !== null) {
    const meses = Math.max(1, Math.floor(entrada.mesesIntervalo || 0));
    const vence = somarMeses(ultimo, meses);
    lembrete = { quando: new Date(vence).toISOString(), vencido: vence <= agora };
  }

  return {
    gastoTotalPago: centavos(gasto),
    pagamentos,
    ultimoServico: ultimo !== null ? new Date(ultimo).toISOString() : null,
    proximaVisita: proxima,
    proximoLembrete: lembrete,
  };
}

// ─── LINHA DO TEMPO ──────────────────────────────────────────────────────────

export type TipoItemTimeline = 'orcamento' | 'os' | 'recibo' | 'visita';

export interface ItemTimeline {
  /** Chave única na lista (tipo + id). */
  chave: string;
  tipo: TipoItemTimeline;
  /** Id do documento a abrir (orçamento, OS, recibo ou a LINHA da agenda). */
  id: string;
  /** ISO usado na ordenação; null = data ilegível (vai para o fim, nunca vira "hoje"). */
  quando: string | null;
  titulo: string;
  /** Rótulo do status, já em pt-BR. */
  status: string;
  valor: number | null;
  /** Recibo estornado / visita cancelada / orçamento recusado: a tela pode apagar o tom. */
  inativo: boolean;
}

function iso(t: number | null): string | null {
  return t === null ? null : new Date(t).toISOString();
}

/**
 * Orçamentos, OS, recibos e visitas do cliente numa lista só, do MAIS RECENTE
 * para o mais antigo (visita marcada para a semana que vem fica no topo — é o
 * próximo acontecimento). Itens sem data legível vão para o fim. Nunca lança.
 */
export function montarTimelineCliente(
  entrada: Pick<EntradaCliente, 'clienteId' | 'orcamentos' | 'ordens' | 'recibos' | 'agendamentos'>,
): ItemTimeline[] {
  const docs = documentosDoCliente(entrada);
  const itens: ItemTimeline[] = [];

  for (const o of docs.orcamentos) {
    itens.push({
      chave: `orcamento:${o.id}`,
      tipo: 'orcamento',
      id: o.id,
      quando: iso(msDe(o.criadoEm)),
      titulo: o.numero ? `Orçamento nº ${o.numero}` : 'Orçamento',
      status: STATUS_LABELS[o.status] ?? String(o.status ?? ''),
      valor: Number.isFinite(o.valorTotal) ? o.valorTotal : null,
      inativo: o.status === 'recusado' || o.status === 'cancelado' || o.status === 'expirado',
    });
  }
  for (const os of docs.ordens) {
    const titulo = (os.titulo ?? '').trim();
    itens.push({
      chave: `os:${os.id}`,
      tipo: 'os',
      id: os.id,
      quando: iso(msDe(os.concluidoEm) ?? msDe(os.dataAgendada) ?? msDe(os.criadoEm)),
      titulo: [os.numero ? `OS nº ${os.numero}` : 'Ordem de serviço', titulo].filter(Boolean).join(' · '),
      status: STATUS_OS_LABELS[os.status] ?? String(os.status ?? ''),
      valor: typeof os.valor === 'number' && Number.isFinite(os.valor) ? os.valor : null,
      inativo: os.status === 'cancelada',
    });
  }
  for (const r of docs.recibos) {
    itens.push({
      chave: `recibo:${r.id}`,
      tipo: 'recibo',
      id: r.id,
      quando: iso(msDoRecibo(r.dataRecebimento, r.criadoEm)),
      titulo: r.numero ? `Recibo nº ${r.numero}` : 'Recibo',
      status: r.estornadoEm ? 'Estornado' : 'Pago',
      valor: Number.isFinite(r.valorRecebido) ? r.valorRecebido : null,
      inativo: !!r.estornadoEm,
    });
  }
  for (const a of docs.agendamentos) {
    const titulo = (a.titulo ?? '').trim() || TIPO_AGENDAMENTO_LABELS[a.tipo] || 'Visita';
    itens.push({
      chave: `visita:${a.id}`,
      tipo: 'visita',
      id: a.id,
      quando: iso(msDe(a.inicio)),
      titulo,
      status: STATUS_AGENDAMENTO_LABELS[a.status] ?? String(a.status ?? ''),
      valor: null,
      inativo: a.status === 'cancelado',
    });
  }

  return itens.sort((a, b) => {
    if (a.quando === b.quando) return a.chave.localeCompare(b.chave);
    if (a.quando === null) return 1;
    if (b.quando === null) return -1;
    return a.quando < b.quando ? 1 : -1;
  });
}

// ─── ENDEREÇO E MAPA ─────────────────────────────────────────────────────────

/** Endereço numa linha só, para o Maps e para exibir. Vazio = sem endereço. */
export function enderecoCompletoCliente(c: Pick<Cliente, 'endereco' | 'complemento' | 'cidade' | 'estado' | 'cep'>): string {
  return [c.endereco, c.complemento, c.cidade, c.estado, c.cep]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

export interface Coordenada {
  lat: number;
  lng: number;
}

function numeroCoordenada(v: unknown, limite: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limite ? n : null;
}

/**
 * Coordenada JÁ GRAVADA no cadastro (`lat`/`lng` ou `latitude`/`longitude` no blob
 * do cliente). O app não geocodifica nada aqui: sem coordenada salva → `null`, e a
 * tela mostra só "Traçar rota" (deep link do Maps). (0,0) é tratado como ausente —
 * é o valor de campo zerado, não um endereço no Golfo da Guiné.
 */
export function coordenadasDoCliente(c: unknown): Coordenada | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  const lat = numeroCoordenada(o.lat ?? o.latitude, 90);
  const lng = numeroCoordenada(o.lng ?? o.longitude, 180);
  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * URL do mapa estático (Google Static Maps) com a chave de mapa QUE JÁ EXISTE no app
 * (`EXPO_PUBLIC_MAPS_KEY`). Sem chave ou sem coordenada → `null` (a tela não desenha
 * mapa nenhum; nunca um mapa "de exemplo").
 */
export function urlMapaEstatico(coord: Coordenada | null, chave: string | null | undefined, largura = 640, altura = 280): string | null {
  const k = (chave ?? '').trim();
  if (!coord || !k) return null;
  const centro = `${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}`;
  const w = Math.max(100, Math.min(640, Math.round(largura)));
  const h = Math.max(100, Math.min(640, Math.round(altura)));
  return `https://maps.googleapis.com/maps/api/staticmap?center=${centro}&zoom=16&size=${w}x${h}&scale=2&markers=${encodeURIComponent(`color:red|${centro}`)}&key=${encodeURIComponent(k)}`;
}
