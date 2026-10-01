/**
 * clima.ts — clima do dia, app-side (item 2.5 da Onda 2).
 *
 * Contrato: worker `olli-diagnostico`, `GET /clima?lat=&lon=` (público, sem
 * login — ver `worker/src/clima.js`). Fonte: MET Norway (CC BY 4.0, exige
 * crédito). A lógica pura (validação da resposta, texto curto, símbolo do MET
 * → pt-BR, atribuição) mora em `climaTexto.ts`, testável por `node`.
 *
 * ─── TRÊS ESTADOS (regra da casa `olli-gate-erro-vira-vazio`) ──────────────
 *   'carregando'          → ainda buscando
 *   { ok:false, motivo }  → a tela mostra "Clima indisponível" (NUNCA some calada)
 *   DadosClima            → { ok:true, temperatura, max, min, chuvaPorHora, resumo, atribuicao… }
 *
 * ─── DE ONDE VEM A COORDENADA ──────────────────────────────────────────────
 * Só da localização JÁ CONCEDIDA — este recurso nunca abre prompt de
 * permissão (clima não vale um "Permitir localização?" na cara do prestador):
 *  - web: `navigator.geolocation` só se `permissions.query` disser 'granted';
 *  - nativo: `expo-location` ainda NÃO é dependência (entra no prebuild da
 *    Onda 8 — ver `LOCALIZACAO_DISPONIVEL` em localizacaoEquipe.ts). Enquanto
 *    for `false`, nada de import; quando virar `true`, import DINÂMICO e só
 *    `getForegroundPermissionsAsync` (consulta, não pede).
 *  - fallback: a coordenada que a tela passar (próximo agendamento/empresa).
 * Sem nenhuma das três → `{ ok:false, motivo:'sem_localizacao' }`, que também
 * aparece como "Clima indisponível".
 *
 * Uso típico (a Home liga isto em outro item):
 *   const clima = useClimaDoDia(coordDoProximoAgendamento);
 *   <Text>{textoClima(clima)}</Text>   // "Chuva prevista às 15h — leve capa"
 *   {atribuicaoClima(clima) && <Text>{atribuicaoClima(clima)}</Text>}  // "Previsão: MET Norway" (CC BY 4.0)
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { DIAGNOSTICO_URL } from '../config';
import { LOCALIZACAO_DISPONIVEL } from './localizacaoEquipe';
import {
  coordenadaValida,
  motivoDeFalha,
  normalizarRespostaClima,
  type DadosClima,
  type EstadoClima,
  type FalhaClima,
} from './climaTexto';

export type { DadosClima, EstadoClima, FalhaClima, HoraChuva, MotivoFalhaClima } from './climaTexto';
export {
  textoClima,
  atribuicaoClima,
  ATRIBUICAO_CLIMA,
  FONTE_CLIMA,
  FONTE_CLIMA_URL,
  LICENCA_CLIMA_URL,
  descricaoTempo,
  horaCurta,
  mmCurto,
  resumoClima,
  simboloEhChuva,
} from './climaTexto';

export interface CoordenadaClima {
  lat: number;
  lon: number;
}

const TIMEOUT_MS = 8000;

/**
 * Cache de processo: a Home remonta a cada foco. 15 min por coordenada
 * arredondada (~1 km) — o worker já cacheia 30 min por célula de ~5 km, isto
 * só evita a ida e volta de rede ao trocar de aba. Só SUCESSO é guardado.
 */
const CACHE_MS = 15 * 60 * 1000;
const memoria = new Map<string, { exp: number; dados: DadosClima }>();

/** Só para teste. */
export function limparCacheClima(): void {
  memoria.clear();
}

function chave(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * Clima para uma coordenada. NUNCA lança: resolve `DadosClima` ou
 * `{ ok:false, motivo }`. ('carregando' é o estado do hook enquanto isto corre.)
 */
export async function buscarClima(lat: number, lon: number): Promise<DadosClima | FalhaClima> {
  if (!coordenadaValida(lat, lon)) return { ok: false, motivo: 'coordenadas_invalidas' };
  if (!DIAGNOSTICO_URL) return { ok: false, motivo: 'nao_configurado' };

  const k = chave(lat, lon);
  const guardado = memoria.get(k);
  if (guardado && guardado.exp > Date.now()) return guardado.dados;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // 4 casas (~11 m) bastam: o worker arredonda para a célula de ~5 km.
    const qs = `lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    const r = await fetch(`${DIAGNOSTICO_URL}/clima?${qs}`, { method: 'GET', signal: controller.signal });
    const data: any = await r.json().catch(() => null);
    if (!r.ok || !data || data.ok !== true) {
      return { ok: false, motivo: motivoDeFalha(data?.motivo) };
    }
    const dados = normalizarRespostaClima(data);
    if (!dados) return { ok: false, motivo: 'clima_indisponivel' };
    if (memoria.size > 50) memoria.clear();
    memoria.set(k, { exp: Date.now() + CACHE_MS, dados });
    return dados;
  } catch {
    return { ok: false, motivo: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Web: só lê a posição se a permissão JÁ estiver concedida (sem prompt). */
async function posicaoWebConcedida(): Promise<CoordenadaClima | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions) return null;
    const st = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (st.state !== 'granted') return null;
    const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 10 * 60 * 1000,
      });
    });
    return { lat: coords.latitude, lon: coords.longitude };
  } catch {
    return null;
  }
}

/** Nativo: só com expo-location instalado E permissão já concedida (consulta, não pede). */
async function posicaoNativaConcedida(): Promise<CoordenadaClima | null> {
  if (!LOCALIZACAO_DISPONIVEL) return null;
  try {
    // Import dinâmico de propósito — NUNCA em module-scope (ver eta.ts/localizacaoEquipe.ts).
    const Location = await import('expo-location' as any);
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** Localização já concedida do aparelho, ou `null`. Nunca pede permissão. */
export async function localizacaoJaConcedida(): Promise<CoordenadaClima | null> {
  const c = Platform.OS === 'web' ? await posicaoWebConcedida() : await posicaoNativaConcedida();
  return c && coordenadaValida(c.lat, c.lon) ? c : null;
}

/**
 * Clima do dia para a Home. Usa a localização já concedida; sem ela, cai na
 * coordenada `reserva` (próximo agendamento ou endereço da empresa, quando a
 * tela tiver). Sem nenhuma → `{ ok:false, motivo:'sem_localizacao' }`.
 *
 * Mostre com `textoClima(estado)`: nunca devolve "nada" para a tela.
 */
export function useClimaDoDia(reserva?: CoordenadaClima | null): EstadoClima {
  const [estado, setEstado] = useState<EstadoClima>('carregando');
  const rLat = reserva?.lat;
  const rLon = reserva?.lon;

  useEffect(() => {
    let vivo = true;
    setEstado('carregando');
    (async (): Promise<DadosClima | FalhaClima> => {
      const aqui = await localizacaoJaConcedida();
      const alvo =
        aqui ?? (coordenadaValida(rLat, rLon) ? { lat: rLat as number, lon: rLon as number } : null);
      if (!alvo) return { ok: false, motivo: 'sem_localizacao' };
      return buscarClima(alvo.lat, alvo.lon);
    })()
      .then((r) => {
        if (vivo) setEstado(r);
      })
      // Nada acima lança, mas se lançar é "não sei" e precisa CHEGAR na tela —
      // não pode ficar em 'carregando' para sempre.
      .catch(() => {
        if (vivo) setEstado({ ok: false, motivo: 'clima_indisponivel' });
      });
    return () => {
      vivo = false;
    };
  }, [rLat, rLon]);

  return estado;
}
