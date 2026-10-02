/**
 * ETA ESTIMADO NO APARELHO — o substituto GRÁTIS da Routes API do Google.
 *
 * Decisão do dono (01/10/2026): o billing do Google Cloud está desligado e não
 * volta. Mapa, rota e hora de sair passam a ser 100% grátis: coordenadas que já
 * temos dos clientes (BrasilAPI/Nominatim, colunas `clientes.lat/lon`) e uma
 * conta feita no próprio celular:
 *
 *     minutos ≈ (linha reta × FATOR_RUA) ÷ velocidade urbana do horário + acréscimo
 *
 * Arquivo PURO (nenhum import): o `node` roda direto em
 * `scripts/teste-rota-otimizar.ts` e `scripts/teste-eta-saida-app.ts`, e o
 * worker importa este mesmo arquivo (uma régua só para app e servidor).
 *
 * ─── HONESTIDADE (P0) ──────────────────────────────────────────────────────
 * Isto é ESTIMATIVA e não sabe nada de trânsito. Toda tela que mostrar um número
 * daqui diz isso com `ROTULO_ESTIMATIVA` ("estimativa, sem trânsito"). Nunca
 * "trânsito ok", nunca "com trânsito": não temos esse dado. Para compensar a
 * incerteza, a folga de saída (`folgaEstimativaMin`) é maior do que a que usávamos
 * com a Routes API, e a janela de chegada ao cliente é mais larga.
 *
 * ─── O QUE NÃO VIRA NÚMERO ─────────────────────────────────────────────────
 *  - ponto inválido (meia coordenada, 0,0, fora do planeta) → `null`;
 *  - distância implausível (> `MAX_DISTANCIA_KM` em linha reta entre duas
 *    visitas) → `null`: é coordenada errada, não viagem.
 * Quem chama transforma `null` em "não sei", nunca em "pertinho".
 *
 * ─── FUSO ──────────────────────────────────────────────────────────────────
 * A velocidade depende da hora de BRASÍLIA (UTC−3 fixo, sem horário de verão
 * desde 2019), não da hora do aparelho: o pico das 18h é o de São Paulo mesmo
 * com o relógio do celular torto, e o teste não depende do fuso da máquina.
 */

export interface Ponto {
  lat: number;
  lon: number;
}

/** Rua não é linha reta: em cidade brasileira o caminho real fica perto de 1,4× a reta. */
export const FATOR_RUA = 1.4;

/** Estacionar, achar o número, tocar o interfone. Viagem nenhuma sai por menos. */
export const ACRESCIMO_FIXO_MIN = 3;

/** Piso da estimativa: "1 min" seria uma promessa que ninguém cumpre. */
export const MINUTOS_MINIMOS = 5;

/** Acima disto, entre duas visitas do mesmo dia, a coordenada está errada. */
export const MAX_DISTANCIA_KM = 600;

/** Os primeiros km são de cidade; o resto anda mais (avenida, marginal, rodovia). */
export const TRECHO_URBANO_KM = 10;

/** Velocidade média do trecho além de `TRECHO_URBANO_KM` (km/h). */
export const VELOCIDADE_ESTRADA_KMH = 50;

/** O rótulo que acompanha TODO número daqui. Mudar isto muda todas as telas de uma vez. */
export const ROTULO_ESTIMATIVA = 'estimativa, sem trânsito';

const RAIO_TERRA_KM = 6371;
const MS_MIN = 60_000;
const MS_HORA = 3_600_000;
const OFFSET_BRASILIA_MS = -3 * MS_HORA;

/** Coordenada utilizável? Mesmo critério de `utils/geoCliente.ts` (0,0 é ausência de dado). */
export function pontoValido(p: unknown): p is Ponto {
  if (!p || typeof p !== 'object') return false;
  const { lat, lon } = p as { lat?: unknown; lon?: unknown };
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
  return !(lat === 0 && lon === 0);
}

/** Distância em linha reta (km), fórmula de haversine. */
export function distanciaRetaKm(a: Ponto, b: Ponto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return RAIO_TERRA_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Hora (fracionária) e dia da semana de Brasília para um instante. */
export function relogioBrasilia(ms: number): { hora: number; diaSemana: number } {
  const d = new Date(ms + OFFSET_BRASILIA_MS);
  return { hora: d.getUTCHours() + d.getUTCMinutes() / 60, diaSemana: d.getUTCDay() };
}

/**
 * Velocidade média urbana (km/h) para sair neste instante. Tabela simples e
 * conservadora, em hora de Brasília:
 *   dia útil 06h30–09h30 e 17h–19h30 → 18 (pico)
 *   dia útil 09h30–17h               → 24
 *   dia útil 19h30–22h               → 28
 *   sábado (06h30–22h)               → 26
 *   domingo e madrugada (22h–06h30)  → 32
 * Não é trânsito: é a média do horário. A tela diz "sem trânsito".
 */
export function velocidadeUrbanaKmh(partidaMs: number): number {
  const { hora, diaSemana } = relogioBrasilia(partidaMs);
  const madrugada = hora < 6.5 || hora >= 22;
  if (madrugada || diaSemana === 0) return 32;
  if (diaSemana === 6) return 26;
  if ((hora >= 6.5 && hora < 9.5) || (hora >= 17 && hora < 19.5)) return 18;
  if (hora >= 9.5 && hora < 17) return 24;
  return 28;
}

export interface Estimativa {
  /** Minutos de viagem estimados (inteiro, >= `MINUTOS_MINIMOS`). */
  minutos: number;
  /** Km de rua estimados (reta × FATOR_RUA), com 1 casa. */
  distanciaKm: number;
  /** Km em linha reta, com 1 casa. */
  retaKm: number;
  /** A velocidade urbana usada (km/h) — para a tela poder explicar a conta. */
  velocidadeKmh: number;
}

/**
 * Minutos (sem arredondar) para percorrer `ruaKm` saindo em `partidaMs`.
 * Trecho urbano na velocidade do horário; o que passa de `TRECHO_URBANO_KM`, a 50 km/h.
 */
function minutosBrutos(ruaKm: number, partidaMs: number): { min: number; vel: number } {
  const vel = velocidadeUrbanaKmh(partidaMs);
  const urbano = Math.min(ruaKm, TRECHO_URBANO_KM);
  const estrada = Math.max(0, ruaKm - TRECHO_URBANO_KM);
  return { min: (urbano / vel) * 60 + (estrada / VELOCIDADE_ESTRADA_KMH) * 60 + ACRESCIMO_FIXO_MIN, vel };
}

/**
 * Estimativa de viagem de `a` até `b` saindo em `partidaMs`. `null` quando um dos
 * pontos não presta ou a distância é implausível — "não sei", nunca "pertinho".
 */
export function estimarViagem(a: unknown, b: unknown, partidaMs: number): Estimativa | null {
  if (!pontoValido(a) || !pontoValido(b) || !Number.isFinite(partidaMs)) return null;
  const reta = distanciaRetaKm(a, b);
  if (!Number.isFinite(reta) || reta > MAX_DISTANCIA_KM) return null;
  const rua = reta * FATOR_RUA;
  const { min, vel } = minutosBrutos(rua, partidaMs);
  return {
    minutos: Math.max(MINUTOS_MINIMOS, Math.ceil(min)),
    distanciaKm: Math.round(rua * 10) / 10,
    retaKm: Math.round(reta * 10) / 10,
    velocidadeKmh: vel,
  };
}

/**
 * Estimativa para CHEGAR em `chegadaMs`: a velocidade depende da hora de saída,
 * que depende da duração. Duas passadas bastam (a tabela muda em degraus de hora).
 */
export function estimarParaChegar(a: unknown, b: unknown, chegadaMs: number): Estimativa | null {
  if (!Number.isFinite(chegadaMs)) return null;
  let e = estimarViagem(a, b, chegadaMs - 30 * MS_MIN);
  if (!e) return null;
  e = estimarViagem(a, b, chegadaMs - e.minutos * MS_MIN) ?? e;
  return e;
}

/**
 * Folga de saída para uma estimativa SEM trânsito: max(8 min, 20% da viagem),
 * no máximo 60. Maior que a da Routes API (max(5, 12%)) de propósito: o número
 * é mais incerto, então a margem cresce — chegar 8 min antes é profissional;
 * 15 min atrasado é reclamação.
 */
export function folgaEstimativaMin(minutos: number): number {
  if (!Number.isFinite(minutos) || minutos <= 0) return 8;
  return Math.min(60, Math.max(8, Math.round(minutos * 0.2)));
}

/** "2,4 km" / "850 m" — distância curta e legível, com vírgula. */
export function textoKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${(Math.round(km * 10) / 10).toFixed(1).replace('.', ',')} km`;
}

/** "45 min" / "1h20" — duração curta. */
export function textoMinutos(min: number): string {
  if (!Number.isFinite(min) || min < 0) return '';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`;
}
