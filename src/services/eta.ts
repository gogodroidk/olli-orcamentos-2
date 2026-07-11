/**
 * ETA com trânsito — app-side.
 *
 * Contrato do endpoint (worker `olli-diagnostico`, rota `POST /eta` — ver
 * `worker/src/index.js` → `handleEta`): mesmo padrão de auth de
 * `services/olliIA.ts` (token do Supabase no header `Authorization`, URL
 * base em `DIAGNOSTICO_URL`).
 *
 *   POST {DIAGNOSTICO_URL}/eta
 *   Authorization: Bearer <token supabase>
 *   body: { origem: {lat,lng}, destino: {lat,lng} }
 *   resposta ok:  { ok: true, minutos, distanciaKm: number|null, comTransito: true }
 *   resposta erro: { ok: false, motivo?: 'nao_autorizado'|'eta_nao_configurado', erro?: string }
 *
 * 3 ESTADOS EXPLÍCITOS — regra dura do repo: nunca colapsar erro em vazio
 * (ver a lição "erro vira vazio" no histórico do projeto). `getEta` nunca
 * lança; sempre resolve um destes três:
 *
 *   'ok'              — minutos/distanciaKm vieram do worker; `chegada` é
 *                       calculada AQUI (agora + minutos, fuso do aparelho).
 *   'sem_localizacao' — permissão de localização negada ou GPS indisponível.
 *                       Não é falha de rede — o usuário pode resolver ativando
 *                       a localização, e a UI deve oferecer isso.
 *   'indisponivel'    — qualquer outra causa (offline, worker fora, sem rota,
 *                       endpoint não configurado, sessão expirada). Sutil,
 *                       sem alarme — nunca deveria travar o fluxo do técnico.
 *
 * ORIGEM (posição atual): expo-location foreground, no MESMO padrão
 * defensivo de `services/localizacaoEquipe.ts`. O pacote `expo-location`
 * AINDA NÃO é dependência do projeto (só entra no prebuild único da Onda 8 —
 * ver `LOCALIZACAO_DISPONIVEL` em localizacaoEquipe.ts) — por isso o import é
 * DINÂMICO e só é tentado quando `LOCALIZACAO_DISPONIVEL` for `true`. NUNCA
 * `import 'expo-location'` em module-scope: quebra o bundle Hermes mesmo sem
 * uso (lição do release v6 — ver AGENTS.md). Web usa `navigator.geolocation`
 * (funciona hoje, sem módulo nativo).
 */
import { Platform } from 'react-native';
import { DIAGNOSTICO_URL } from '../config';
import { supabase } from './supabase';
import { LOCALIZACAO_DISPONIVEL } from './localizacaoEquipe';

export interface Coordenada {
  lat: number;
  lng: number;
}

export type ResultadoEta =
  | { estado: 'ok'; minutos: number; distanciaKm: number | null; chegada: Date }
  | { estado: 'sem_localizacao' }
  | { estado: 'indisponivel' };

/**
 * Mensagem de WhatsApp "estou a caminho" (item 1.3) — usa os minutos do ETA
 * quando disponível (`resultado.estado === 'ok'`). Nos demais estados (ainda
 * carregando, sem localização, indisponível) a mensagem sai SEM prometer um
 * horário que não temos — nunca inventa um número. O chip do ETA (EtaChip),
 * visível junto do botão, já explica ao prestador POR QUE a estimativa não
 * veio; esta função só garante que a mensagem enviada nunca minta sobre isso.
 */
export function mensagemEstouACaminho(nomeCliente: string, resultado: ResultadoEta | null): string {
  const primeiro = (nomeCliente ?? '').trim().split(/\s+/)[0] || 'tudo bem';
  if (resultado?.estado === 'ok') {
    return `Olá ${primeiro}, estou a caminho, chego em ~${resultado.minutos} min.`;
  }
  return `Olá ${primeiro}, estou a caminho!`;
}

/** Timeout da chamada ao worker: rota leve (Routes API), não precisa dos 30s do diagnóstico por IA. */
const TIMEOUT_ETA_MS = 15_000;

/** TTL do cache em memória por destino — "segurar custo" (menos chamadas ao Routes API via worker). */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface EtaCacheEntry {
  minutos: number;
  distanciaKm: number | null;
  expiraEm: number;
}

/**
 * Cache em memória, chave = destino arredondado a 4 casas (~11 m — de sobra
 * para não estourar cache em micro-variações de geocoding, mas ainda
 * distinguir endereços diferentes). Só guarda estado 'ok': cachear
 * 'sem_localizacao'/'indisponivel' prenderia o técnico numa mensagem de erro
 * por até 5 min mesmo depois de ativar o GPS ou a conexão voltar — o próprio
 * `getEta` já é best-effort e barato de tentar de novo nesses casos.
 */
const cache = new Map<string, EtaCacheEntry>();

function chaveCache(destino: Coordenada): string {
  return `${destino.lat.toFixed(4)},${destino.lng.toFixed(4)}`;
}

/** Token de acesso da sessão atual (ou null). Nunca lança. Mesmo padrão de `olliIA.ts`. */
async function accessTokenAtual(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Posição atual do aparelho (best-effort). `null` quando sem permissão, GPS
 * desligado ou módulo indisponível — nunca lança.
 *
 * Nativo: só tenta importar `expo-location` quando `LOCALIZACAO_DISPONIVEL`
 * for `true` (hoje é sempre `false` — o pacote não está instalado). Web: usa
 * a Geolocation API do navegador, que funciona hoje sem módulo nenhum.
 */
async function origemAtual(): Promise<Coordenada | null> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    try {
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve(p.coords),
          (e) => reject(e),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      });
      return { lat: coords.latitude, lng: coords.longitude };
    } catch (erro) {
      console.log('[eta] geolocalização web indisponível/negada:', erro);
      return null;
    }
  }

  if (!LOCALIZACAO_DISPONIVEL) return null;

  try {
    // Import dinâmico de propósito — ver header do arquivo e localizacaoEquipe.ts.
    const Location = await import('expo-location' as any);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (erro) {
    console.log('[eta] não foi possível capturar localização nativa:', erro);
    return null;
  }
}

/**
 * ETA com trânsito até `destino`. Best-effort — nunca lança, sempre resolve
 * um dos 3 estados (`ResultadoEta`). Confere primeiro o cache (5 min por
 * destino); se não configurado/logado, nem chega a pedir localização (feature
 * não pode funcionar mesmo, então não vale incomodar com o prompt).
 */
export async function getEta(destino: Coordenada): Promise<ResultadoEta> {
  try {
    const chave = chaveCache(destino);
    const cached = cache.get(chave);
    if (cached && cached.expiraEm > Date.now()) {
      return {
        estado: 'ok',
        minutos: cached.minutos,
        distanciaKm: cached.distanciaKm,
        // "chegada" sempre recalculada a partir de AGORA, mesmo em cache hit.
        chegada: new Date(Date.now() + cached.minutos * 60000),
      };
    }

    if (!DIAGNOSTICO_URL) return { estado: 'indisponivel' };
    const token = await accessTokenAtual();
    if (!token) return { estado: 'indisponivel' };

    const origem = await origemAtual();
    if (!origem) return { estado: 'sem_localizacao' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_ETA_MS);
    try {
      const r = await fetch(`${DIAGNOSTICO_URL}/eta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origem, destino }),
        signal: controller.signal,
      });
      if (!r.ok) return { estado: 'indisponivel' };

      const data: any = await r.json().catch(() => null);
      if (!data?.ok || typeof data.minutos !== 'number' || !Number.isFinite(data.minutos)) {
        return { estado: 'indisponivel' };
      }

      const minutos = data.minutos;
      const distanciaKm = typeof data.distanciaKm === 'number' && Number.isFinite(data.distanciaKm)
        ? data.distanciaKm
        : null;
      cache.set(chave, { minutos, distanciaKm, expiraEm: Date.now() + CACHE_TTL_MS });
      return { estado: 'ok', minutos, distanciaKm, chegada: new Date(Date.now() + minutos * 60000) };
    } finally {
      clearTimeout(timer);
    }
  } catch (erro) {
    console.log('[eta] falha ao calcular ETA:', erro);
    return { estado: 'indisponivel' };
  }
}

/** Cache de geocoding por endereço normalizado — evita repetir a chamada (e gastar cota). */
const cacheGeocode = new Map<string, Coordenada>();

function chaveEndereco(endereco: string): string {
  return endereco.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Endereço (texto) → coordenada, via worker `POST /geocodificar` (a chave de
 * geocoding vive no worker, NUNCA no app). Best-effort: `null` quando não
 * configurado, não logado, sem rede, ou endereço não encontrado. Cacheia só
 * sucesso, em memória, por endereço normalizado.
 */
export async function geocodificarEndereco(endereco: string): Promise<Coordenada | null> {
  const alvo = (endereco ?? '').trim();
  if (alvo.length < 3) return null;
  const chave = chaveEndereco(alvo);
  const cacheado = cacheGeocode.get(chave);
  if (cacheado) return cacheado;

  if (!DIAGNOSTICO_URL) return null;
  const token = await accessTokenAtual();
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_ETA_MS);
  try {
    const r = await fetch(`${DIAGNOSTICO_URL}/geocodificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endereco: alvo }),
      signal: controller.signal,
    });
    if (!r.ok) return null;
    const data: any = await r.json().catch(() => null);
    if (!data?.ok || !Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return null;
    const coord: Coordenada = { lat: data.lat, lng: data.lng };
    cacheGeocode.set(chave, coord);
    return coord;
  } catch (erro) {
    console.log('[eta] geocoding falhou:', erro);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Destino de ETA a partir de um agendamento: coordenada salva (futuro) ou endereço a geocodificar. */
export interface DestinoAgendamento {
  lat?: number;
  lng?: number;
  endereco?: string;
}

/**
 * Há como calcular ETA para este destino? Decisão SÍNCRONA — é o que a UI usa
 * para decidir se mostra o chip (com shimmer) antes de qualquer rede. Verdadeiro
 * quando já há coordenada OU um endereço geocodificável.
 *
 * PLATAFORMA-CONSCIENTE (achado P2-1 da auditoria): no nativo, `origemAtual()`
 * só funciona quando `LOCALIZACAO_DISPONIVEL` for `true` (expo-location entra
 * só na Onda 8 — hoje o módulo nem está instalado). Até lá, todo ETA nativo
 * resolveria sempre em 'sem_localizacao', e o chip mostraria "Ative a
 * localização" como se fosse acionável — um beco sem saída, já que não há
 * módulo de localização pra ativar. Por isso aqui devolve `false` no nativo
 * enquanto `LOCALIZACAO_DISPONIVEL` for `false`: a Home some o chip (e o
 * botão "Estou a caminho" que o acompanha) e mostra só endereço/"ver no
 * mapa". Na web (`navigator.geolocation`, funciona hoje) o comportamento não
 * muda. Quando a Onda 8 ligar `LOCALIZACAO_DISPONIVEL`, a feature volta
 * sozinha no nativo, sem mexer nesta função de novo.
 */
export function temDestinoEta(a: DestinoAgendamento | null | undefined): boolean {
  if (Platform.OS !== 'web' && !LOCALIZACAO_DISPONIVEL) return false;
  if (!a) return false;
  if (Number.isFinite(a.lat) && Number.isFinite(a.lng)) return true;
  return typeof a.endereco === 'string' && a.endereco.trim().length >= 3;
}

/**
 * ETA de um agendamento: usa a coordenada salva se houver; senão geocodifica o
 * `endereco` (via worker, cacheado) e então calcula. Best-effort — os mesmos 3
 * estados de `getEta`. 'indisponivel' também cobre "endereço não geocodificável".
 * Ordem importa: geocoding (precisa só de login) vem antes de `getEta` (precisa
 * de localização) — assim, com endereço válido mas GPS negado, o resultado é
 * 'sem_localizacao' (acionável), não um 'indisponivel' genérico.
 */
export async function getEtaAgendamento(a: DestinoAgendamento | null | undefined): Promise<ResultadoEta> {
  if (!a) return { estado: 'indisponivel' };
  let destino: Coordenada | null = null;
  if (Number.isFinite(a.lat) && Number.isFinite(a.lng)) {
    destino = { lat: a.lat as number, lng: a.lng as number };
  } else if (typeof a.endereco === 'string' && a.endereco.trim().length >= 3) {
    destino = await geocodificarEndereco(a.endereco);
  }
  if (!destino) return { estado: 'indisponivel' };
  return getEta(destino);
}
