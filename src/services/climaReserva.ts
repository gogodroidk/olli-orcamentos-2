/**
 * COORDENADA DE RESERVA DO CLIMA — a cidade do cadastro (Meu negócio).
 *
 * Por que existe: no APK o clima não tem localização (expo-location ainda não
 * entrou, ver `LOCALIZACAO_DISPONIVEL`), e o `Agendamento` guarda só o endereço
 * em texto. Sem uma coordenada, `useClimaDoDia` só sabe dizer "Clima
 * indisponível". A cidade da empresa resolve: o clima é por célula de ~5 km.
 *
 * CUSTO ZERO (regra P0 do dono — só serviço gratuito). NÃO usa o
 * `/geocodificar` do worker: aquele é o Google Geocoding, pago. A cadeia é:
 *   1. coordenada já guardada neste aparelho para esta cidade;
 *   2. CEP escrito no endereço do cadastro → `/cep` do worker (BrasilAPI v2,
 *      grátis), quando ele trouxer a coordenada;
 *   3. Nominatim/OpenStreetMap (grátis): User-Agent próprio, fila serial de no
 *      máximo 1 requisição por segundo e recuo depois de falha. Dado ODbL → a
 *      tela mostra `ATRIBUICAO_OSM` junto do clima.
 * Uma busca por cidade por aparelho — o resultado fica no AsyncStorage. Buscas
 * simultâneas da mesma cidade viram uma só; falha não é gravada.
 *
 * Nunca pede permissão de nada e nunca lança.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  ATRIBUICAO_OSM,
  NOMINATIM_INTERVALO_MS,
  NOMINATIM_USER_AGENT,
  cepDoEndereco,
  chaveCidadeClima,
  consultaCidadeClima,
  lerNominatimCidade,
  urlNominatimCidade,
} from '../utils/cidadeClima';
import { coordenadaValida } from './climaTexto';
import { consultarCep } from './cep';
import { CLIMA_COORD_CIDADE_KEY } from './storageKeys';
import type { CoordenadaClima } from './clima';

/** De onde veio o ponto: o OSM exige crédito na tela; a BrasilAPI não. */
export type FonteReserva = 'cep' | 'osm';

export interface PontoReserva {
  coord: CoordenadaClima;
  fonte: FonteReserva;
}

/** 3 estados + "o cadastro não tem cidade" (que a tela explica, com atalho). */
export type ReservaClima =
  | { estado: 'carregando' }
  | { estado: 'sem_cidade' }
  | { estado: 'falhou' }
  | { estado: 'ok'; coord: CoordenadaClima; fonte: FonteReserva; atribuicao: string | null };

/** Crédito que a tela mostra junto do clima quando o ponto veio do OpenStreetMap. */
export function atribuicaoReserva(fonte: FonteReserva): string | null {
  return fonte === 'osm' ? ATRIBUICAO_OSM : null;
}

const TIMEOUT_NOMINATIM_MS = 6000;
/** Depois de recusa/limite do Nominatim, não insiste por 10 min (política de uso). */
const RECUO_RECUSA_MS = 10 * 60 * 1000;
/** Depois de falha de rede, espera 1 min antes da próxima tentativa. */
const RECUO_REDE_MS = 60 * 1000;

/** Uma busca por cidade por processo: remontar a Home não busca de novo. */
const emVoo = new Map<string, Promise<PontoReserva | null>>();

async function lerGuardada(chave: string): Promise<PontoReserva | null> {
  try {
    const raw = await AsyncStorage.getItem(CLIMA_COORD_CIDADE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (g?.chave !== chave || !coordenadaValida(g?.lat, g?.lon)) return null;
    if (g?.fonte !== 'cep' && g?.fonte !== 'osm') return null;
    return { coord: { lat: g.lat, lon: g.lon }, fonte: g.fonte };
  } catch {
    return null;
  }
}

// ─── Nominatim: fila serial, 1 req/s, recuo depois de falha ────────────────
let fila: Promise<unknown> = Promise.resolve();
let livreEm = 0;
let recuoAte = 0;

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function buscarNoNominatim(url: string): Promise<CoordenadaClima | null> {
  if (Date.now() < recuoAte) return null;
  const espera = livreEm - Date.now();
  if (espera > 0) await esperar(espera);
  livreEm = Date.now() + NOMINATIM_INTERVALO_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_NOMINATIM_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'pt-BR' };
    // O navegador não deixa trocar o User-Agent; lá a identificação vai no `email` da URL.
    if (Platform.OS !== 'web') headers['User-Agent'] = NOMINATIM_USER_AGENT;
    const r = await fetch(url, { headers, signal: controller.signal });
    if (!r.ok) {
      recuoAte = Date.now() + (r.status === 403 || r.status === 429 ? RECUO_RECUSA_MS : RECUO_REDE_MS);
      return null;
    }
    const lido = lerNominatimCidade(await r.json().catch(() => undefined));
    if (lido === undefined) {
      recuoAte = Date.now() + RECUO_REDE_MS;
      return null;
    }
    return lido;
  } catch {
    recuoAte = Date.now() + RECUO_REDE_MS;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Entra na fila: uma consulta ao Nominatim por vez, com 1,1 s entre elas. */
function nominatimNaFila(url: string): Promise<CoordenadaClima | null> {
  const vez = fila.then(() => buscarNoNominatim(url));
  fila = vez.catch(() => null);
  return vez.catch(() => null);
}

async function pontoDoCep(endereco: string | null | undefined): Promise<PontoReserva | null> {
  const cep = cepDoEndereco(endereco);
  if (!cep) return null;
  try {
    const r = await consultarCep(cep);
    if (r.estado !== 'ok' || !coordenadaValida(r.endereco.lat, r.endereco.lng)) return null;
    return { coord: { lat: r.endereco.lat as number, lon: r.endereco.lng as number }, fonte: 'cep' };
  } catch {
    return null;
  }
}

async function resolver(
  chave: string,
  cidade: string | null | undefined,
  estado: string | null | undefined,
  endereco: string | null | undefined,
): Promise<PontoReserva | null> {
  const guardada = await lerGuardada(chave);
  if (guardada) return guardada;

  let ponto = await pontoDoCep(endereco);
  if (!ponto) {
    const url = urlNominatimCidade(cidade, estado);
    const coord = url ? await nominatimNaFila(url) : null;
    if (coord) ponto = { coord, fonte: 'osm' };
  }
  if (!ponto) return null;
  try {
    await AsyncStorage.setItem(CLIMA_COORD_CIDADE_KEY, JSON.stringify({ chave, ...ponto.coord, fonte: ponto.fonte }));
  } catch {
    /* sem disco: vale para esta sessão */
  }
  return ponto;
}

/** Em que pé está a leitura do cadastro da empresa na tela que pede o clima. */
export type LeituraCadastro = 'carregando' | 'erro' | 'ok';

/**
 * Coordenada da cidade do cadastro para o clima. Os 3 estados da leitura do
 * cadastro chegam inteiros: "ainda não li a empresa" fica em 'carregando' e
 * "não consegui ler" vira 'falhou' — nenhum dos dois pode virar "o cadastro não
 * tem cidade".
 */
export function useReservaClima(
  cidade: string | null | undefined,
  estado: string | null | undefined,
  endereco: string | null | undefined,
  cadastro: LeituraCadastro,
): ReservaClima {
  const [r, setR] = useState<ReservaClima>({ estado: 'carregando' });
  const consulta = consultaCidadeClima(cidade, estado);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `consulta` já resume cidade+estado; o CEP do endereço só é tentativa extra.
  useEffect(() => {
    if (cadastro === 'carregando') {
      setR({ estado: 'carregando' });
      return;
    }
    if (cadastro === 'erro') {
      setR({ estado: 'falhou' });
      return;
    }
    if (!consulta) {
      setR({ estado: 'sem_cidade' });
      return;
    }
    let vivo = true;
    setR({ estado: 'carregando' });
    const chave = chaveCidadeClima(consulta);
    let p = emVoo.get(chave);
    if (!p) {
      p = resolver(chave, cidade, estado, endereco).catch(() => null);
      emVoo.set(chave, p);
    }
    p.then((ponto) => {
      // Falha não fica guardada: a próxima montagem da Home tenta de novo
      // (e o recuo do Nominatim segura a insistência).
      if (!ponto) emVoo.delete(chave);
      if (!vivo) return;
      setR(ponto
        ? { estado: 'ok', coord: ponto.coord, fonte: ponto.fonte, atribuicao: atribuicaoReserva(ponto.fonte) }
        : { estado: 'falhou' });
    });
    return () => {
      vivo = false;
    };
  }, [consulta, cadastro]);

  return r;
}
