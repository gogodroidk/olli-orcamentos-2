/**
 * climaNaAgenda.ts — as regras PURAS do encaixe de "Chuva na Visita" e do
 * Encaixe Inteligente nas telas (Agenda, Hoje e Agenda desktop).
 *
 * Arquivo sem React e sem rede: só importa, em runtime, módulos que também são
 * puros (`climaVisitaRegra.ts`, `climaTexto.ts`). `scripts/teste-clima-agenda.ts`
 * roda tudo isto em `node`.
 *
 * O que decide:
 *  1. QUEM GANHA CHIP. O prestador está na rua: a visita só ganha a linha de
 *     clima quando há o que dizer AGORA — previsão, carregando, clima que falhou
 *     ("Clima indisponível", nunca "sem chuva") ou alerta oficial. Visita da
 *     semana que vem ("a previsão sai 12h antes") e visita já passada não ocupam
 *     espaço. "Cliente sem localização" só aparece na visita marcada como
 *     EXTERNA, que é onde a chuva muda o dia; nas outras, a tela conta quantas
 *     ficaram sem previsão (nunca some calado).
 *  2. O CARTÃO DO DIA (visão Dia da Agenda): as visitas agendadas que caem nas
 *     próximas 12h (a janela do MET), separando as que têm coordenada das que
 *     não têm.
 *  3. REMARCAR POR CHUVA. Visita de SÉRIE muda só ESTA ocorrência (exceção da
 *     série via `editarRecorrente`, alcance "só esta"); visita avulsa muda a
 *     própria linha. A duração é mantida.
 */
import { DURACAO_VISITA_PADRAO_MIN, JANELA_PREVISAO_HORAS } from '../services/climaVisitaRegra.ts';
import type { ResultadoClimaVisita, VisitaParaClima } from '../services/climaVisitaRegra';
import type { ResultadoEncaixe } from '../services/encaixe';

const MS_MIN = 60_000;
const MS_HORA = 3_600_000;

/** O pedaço do cadastro do cliente que o clima e o encaixe usam. */
export interface ClienteGeo {
  lat?: number | null;
  lon?: number | null;
}

/** O pedaço da visita que estas regras leem. */
export interface VisitaClimaAgenda {
  id: string;
  inicio: string;
  fim?: string | null;
  status?: string | null;
  clienteId?: string | null;
  externa?: boolean;
  recorrencia?: string | null;
  /** Ocorrência projetada de uma série (id da base). */
  ocorrenciaDe?: string;
}

function msDe(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Coordenada aceitável (mesma régua do worker: recusa 0,0 de GPS sem fix). */
export function temCoordenada(c: ClienteGeo | null | undefined): boolean {
  const lat = c?.lat;
  const lon = c?.lon;
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

/** Entrada do clima: horário da visita + ponto do cliente + "externa?". */
export function visitaParaClima(v: Pick<VisitaClimaAgenda, 'inicio' | 'fim' | 'externa'>, cliente?: ClienteGeo | null): VisitaParaClima {
  return {
    inicio: v.inicio,
    fim: v.fim ?? null,
    lat: typeof cliente?.lat === 'number' ? cliente.lat : null,
    lon: typeof cliente?.lon === 'number' ? cliente.lon : null,
    externa: v.externa ?? null,
  };
}

/**
 * A visita ganha a linha de clima? `diaTodo` (sem hora marcada) nunca: a
 * meia-noite dela não é horário de visita, e cruzá-la com a chuva das 0h seria
 * inventar.
 */
export function climaMereceEspaco(a: ResultadoClimaVisita, ctx: { externa?: boolean; diaTodo?: boolean } = {}): boolean {
  if (ctx.diaTodo) return false;
  if (a.estado === 'passada') return false;
  if (a.alerta) return true;
  switch (a.estado) {
    case 'carregando':
    case 'indisponivel':
    case 'previsao':
      return true;
    case 'sem_local':
      return ctx.externa === true;
    default:
      // 'fora_da_janela': ainda não há o que prever — não é erro, não ocupa espaço.
      return false;
  }
}

/** A visita ainda não acabou e começa dentro da série de 12h do MET? */
export function visitaNaJanelaDoClima(v: Pick<VisitaClimaAgenda, 'inicio' | 'fim'>, agora: Date = new Date()): boolean {
  const ini = msDe(v.inicio);
  if (ini === null) return false;
  const fimInformado = msDe(v.fim);
  const fim = fimInformado !== null && fimInformado > ini ? fimInformado : ini + DURACAO_VISITA_PADRAO_MIN * MS_MIN;
  const agoraMs = agora.getTime();
  const fimJanela = Math.floor(agoraMs / MS_HORA) * MS_HORA + JANELA_PREVISAO_HORAS * MS_HORA;
  return fim > agoraMs && ini < fimJanela;
}

/**
 * As visitas do cartão "Chuva nas próximas visitas": agendadas, com hora
 * marcada, dentro das próximas 12h. As sem coordenada do cliente não somem:
 * viram a contagem `semLocal` (a tela diz quantas ficaram sem previsão).
 */
export function visitasDoClimaNoDia<T extends VisitaClimaAgenda>(
  itens: readonly T[],
  clientePorId: (id: string) => ClienteGeo | null | undefined,
  ehDiaTodo: (v: T) => boolean,
  agora: Date = new Date(),
): { comLocal: T[]; semLocal: number } {
  const comLocal: T[] = [];
  let semLocal = 0;
  for (const v of itens) {
    if ((v.status ?? 'agendado') !== 'agendado' || ehDiaTodo(v) || !visitaNaJanelaDoClima(v, agora)) continue;
    const c = v.clienteId ? clientePorId(v.clienteId) : null;
    if (temCoordenada(c)) comLocal.push(v);
    else semLocal++;
  }
  comLocal.sort((a, b) => (msDe(a.inicio) ?? 0) - (msDe(b.inicio) ?? 0));
  return { comLocal, semLocal };
}

/** "1 visita sem localização do cliente ficou sem previsão." */
export function textoSemLocal(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? '1 visita sem localização do cliente ficou sem previsão. Cadastre o CEP no cliente.'
    : `${n} visitas sem localização do cliente ficaram sem previsão. Cadastre o CEP nos clientes.`;
}

// ─── Remarcar por chuva ────────────────────────────────────────────────────

export interface PlanoRemarcar {
  /** Série: só esta ocorrência muda (exceção). Avulsa: a própria linha. */
  modo: 'so_esta_da_serie' | 'visita_avulsa';
  inicio: string;
  /** Mantém a duração; sem `fim` antes, continua sem. */
  fim?: string;
}

/** Plano de remarcar a visita para `novoInicio`, mantendo a duração. `null` = início inválido. */
export function planoRemarcarVisita(v: Pick<VisitaClimaAgenda, 'inicio' | 'fim' | 'recorrencia' | 'ocorrenciaDe'>, novoInicio: Date): PlanoRemarcar | null {
  const novo = novoInicio.getTime();
  if (!Number.isFinite(novo)) return null;
  const ini = msDe(v.inicio);
  const fim = msDe(v.fim);
  const duracao = ini !== null && fim !== null && fim > ini ? fim - ini : null;
  return {
    modo: v.ocorrenciaDe || v.recorrencia ? 'so_esta_da_serie' : 'visita_avulsa',
    inicio: new Date(novo).toISOString(),
    ...(duracao !== null ? { fim: new Date(novo + duracao).toISOString() } : {}),
  };
}

/**
 * Horários do Encaixe para a mensagem ao cliente ("Tenho estes horários: …").
 * Só quando o Encaixe respondeu de verdade; erro/carregando = nenhum (a
 * mensagem pede "qual dia fica bom", não inventa horário).
 */
export function alternativasDoEncaixe(r: ResultadoEncaixe | 'carregando' | 'erro', max = 2): string[] {
  if (r === 'carregando' || r === 'erro' || !r.ok) return [];
  return r.sugestoes.slice(0, Math.max(0, max)).map((s) => s.quando);
}
