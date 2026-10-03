/**
 * MAPA DO DIA — as regras PURAS do Mapa (Onda I2): quem vira pin, em que ordem,
 * com que cor, a linha da rota, o enquadramento e o resumo "4 visitas · 38 km ·
 * termina ~17h30". Sem React Native, sem rede: `scripts/teste-mapa-dia.ts` roda
 * em Node e a tela só desenha.
 *
 * ─── GRÁTIS DE PONTA A PONTA ───────────────────────────────────────────────
 * Mapa: MapLibre + tiles OpenFreeMap (sem chave, sem cota, uso comercial
 * permitido). Atribuição OBRIGATÓRIA e visível: `ATRIBUICAO_MAPA`.
 * Pontos: as coordenadas que o app já salva dos clientes (BrasilAPI/Nominatim).
 * Tempos: a estimativa sem trânsito de `etaEstimado.ts`.
 *
 * ─── ERRO NÃO VIRA VAZIO ───────────────────────────────────────────────────
 * Visita sem local no mapa NÃO some: vai para `semLocal`, e a tela lista e
 * oferece "Completar endereço". Um mapa com 2 pins quando o dia tem 4 visitas,
 * sem dizer nada, seria mentir por omissão.
 */
import type { Agendamento, Cliente } from '../types';
import type { EstadoParadaDia, ParadaDoDia } from './agendaDia.ts';
import { pontoDoAgendamento, type PontoVisita } from '../services/saidaCalculo.ts';
import { textoKm } from '../services/etaEstimado.ts';

/** Estilos do OpenFreeMap: claro minimalista e escuro. Sem chave. */
export const ESTILO_MAPA = {
  claro: 'https://tiles.openfreemap.org/styles/positron',
  escuro: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/** A atribuição exigida pelas licenças (OpenMapTiles + ODbL do OpenStreetMap). Sempre visível. */
export const ATRIBUICAO_MAPA = '© OpenMapTiles © OpenStreetMap';
export const URL_ATRIBUICAO_MAPA = 'https://www.openstreetmap.org/copyright';

/** Duração da visita quando a agenda não tem `fim` (mesma régua de `agendaDia.ts`). */
const DURACAO_PADRAO_MIN = 60;

export interface ParadaMapa<T extends Agendamento = Agendamento> {
  id: string;
  /** Posição na ordem do dia (1, 2, 3…), contando só as que vão para o mapa. */
  numero: number;
  nome: string;
  inicioMs: number;
  duracaoMin: number;
  estado: EstadoParadaDia;
  ponto: PontoVisita | null;
  /** Ponto pelo CEP/bairro: o pin ganha halo e a legenda "local aproximado". */
  aproximado: boolean;
  visita: T;
}

/** Parada que vai para o mapa: o ponto é garantido. */
export type ParadaComLocal<T extends Agendamento = Agendamento> = ParadaMapa<T> & { ponto: PontoVisita };

export interface DiaNoMapa<T extends Agendamento = Agendamento> {
  /** Visitas com ponto, na ordem dos horários, numeradas 1..n. */
  comLocal: ParadaComLocal<T>[];
  /** Visitas sem ponto: a tela mostra e oferece completar o endereço. */
  semLocal: ParadaMapa<T>[];
}

function duracaoDe(a: Agendamento): number {
  const ini = Date.parse(a.inicio);
  const fim = a.fim ? Date.parse(a.fim) : NaN;
  if (Number.isFinite(ini) && Number.isFinite(fim) && fim > ini) return Math.round((fim - ini) / 60_000);
  return DURACAO_PADRAO_MIN;
}

/** Separa o dia em "vai para o mapa" e "falta local", já numerado. */
export function diaNoMapa<T extends Agendamento>(paradas: readonly ParadaDoDia<T>[], clientes: readonly Cliente[]): DiaNoMapa<T> {
  const comLocal: ParadaComLocal<T>[] = [];
  const semLocal: ParadaMapa<T>[] = [];
  for (const p of paradas) {
    const v = p.visita;
    const inicioMs = Date.parse(v.inicio);
    if (!Number.isFinite(inicioMs)) continue;
    const ponto = pontoDoAgendamento(v, clientes);
    const item: ParadaMapa<T> = {
      id: v.id,
      numero: 0,
      nome: (v.clienteNome || v.titulo || 'Visita').trim(),
      inicioMs,
      duracaoMin: duracaoDe(v),
      estado: p.estado,
      ponto,
      aproximado: !!ponto && (ponto.precisao === 'cep' || ponto.precisao === 'bairro'),
      visita: v,
    };
    if (ponto) comLocal.push({ ...item, ponto });
    else semLocal.push(item);
  }
  comLocal.sort((a, b) => a.inicioMs - b.inicioMs);
  comLocal.forEach((p, i) => { p.numero = i + 1; });
  return { comLocal, semLocal };
}

/** Cor semântica do pin. A legenda da tela usa os mesmos rótulos. */
export const ROTULO_ESTADO_PIN: Record<EstadoParadaDia, string> = {
  feita: 'Feita',
  agora: 'Agora',
  sem_baixa: 'Sem baixa',
  proxima: 'Próxima',
  depois: 'Pendente',
};

/** [oeste, sul, leste, norte] dos pontos, com folga mínima (1 ponto vira uma área de ~1 km). */
export function limitesDosPontos(pontos: readonly { lat: number; lon: number }[]): [number, number, number, number] | null {
  if (pontos.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of pontos) {
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  const MIN = 0.006; // ~650 m: dois pins no mesmo prédio não viram um zoom de quarteirão
  if (e - w < MIN) { const c = (e + w) / 2; w = c - MIN / 2; e = c + MIN / 2; }
  if (n - s < MIN) { const c = (n + s) / 2; s = c - MIN / 2; n = c + MIN / 2; }
  return [w, s, e, n];
}

/** A linha da rota como [lon, lat] (formato GeoJSON), na ordem dada. */
export function linhaDaRota(pontos: readonly { lat: number; lon: number }[]): [number, number][] {
  return pontos.map((p) => [p.lon, p.lat]);
}

/**
 * A linha "se desenhando": só o pedaço até `progresso` (0..1) do comprimento,
 * interpolando o último segmento. 0 → só o 1º ponto; 1 → a linha inteira.
 */
export function linhaParcial(coords: readonly [number, number][], progresso: number): [number, number][] {
  if (coords.length < 2) return coords.slice();
  const p = Math.max(0, Math.min(1, Number.isFinite(progresso) ? progresso : 1));
  if (p >= 1) return coords.slice();
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    seg.push(d);
    total += d;
  }
  if (total === 0) return coords.slice();
  let alvo = total * p;
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const d = seg[i - 1];
    if (alvo >= d) {
      out.push(coords[i]);
      alvo -= d;
      continue;
    }
    const f = d === 0 ? 0 : alvo / d;
    out.push([
      coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
      coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f,
    ]);
    break;
  }
  // Uma LineString precisa de 2 posições: no começo, o 1º ponto duplicado.
  return out.length === 1 ? [coords[0], coords[0]] : out;
}

function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "4 visitas · 38 km · termina ~17h30" — km e fim são estimativa (a tela diz). */
export function resumoDoDia(qtdVisitas: number, km: number | null, fimMs: number | null): string {
  const partes = [`${qtdVisitas} ${qtdVisitas === 1 ? 'visita' : 'visitas'}`];
  if (km !== null && Number.isFinite(km) && km > 0) partes.push(textoKm(km));
  if (fimMs !== null && Number.isFinite(fimMs)) partes.push(`termina ~${hhmm(fimMs)}`);
  return partes.join(' · ');
}
