/**
 * "A que horas eu preciso SAIR" — a CASCA (base da empresa + montagem).
 *
 * Toda a decisão mora em `saidaCalculo.ts` (puro, testado por
 * `scripts/teste-eta-saida-app.ts`). Desde a Onda I2 (01/10/2026) nada aqui chama
 * Google: a hora de sair é ESTIMADA no aparelho (`etaEstimado.ts`), sem custo e
 * sem rede. A única rede que sobrou é localizar a BASE da empresa UMA vez, pelo
 * mesmo serviço grátis que localiza os clientes (worker `POST /geo` → BrasilAPI +
 * Nominatim/OpenStreetMap), e guardar o ponto no aparelho.
 *
 * NÃO PEDE LOCALIZAÇÃO. A origem vem do cadastro (visita anterior ou a base):
 * onde o celular está às 7h não diz de onde ele sai às 14h20.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Agendamento, Cliente, Empresa } from '../types';
import { SAIDA_CACHE_KEY } from './storageKeys';
import { geocodificarEndereco } from './cep';
import { coordenadaValida, lerGeoPrecisao, textoComparavel } from '../utils/geoCliente';
import {
  estimarSaida,
  origemParaVisita,
  pontoDoAgendamento,
  type PontoVisita,
  type ResultadoSaida,
} from './saidaCalculo';

export * from './saidaCalculo';

/** O que guardamos da base: o ponto e a CHAVE do endereço que o produziu. */
interface BaseGuardada {
  chave: string;
  lat: number;
  lon: number;
  precisao: string;
}

/**
 * Leitura da base, com os 3 estados da casa:
 *  - `ok`            → o ponto da base (rua ou melhor);
 *  - `sem_endereco`  → o cadastro não tem rua+cidade+UF, ou o mapa só achou a
 *                      cidade (centro do município não é de onde ele sai);
 *  - `indisponivel`  → não deu para perguntar agora (offline, worker fora).
 */
export type LeituraBase =
  | { estado: 'ok'; ponto: PontoVisita }
  | { estado: 'sem_endereco' }
  | { estado: 'indisponivel' };

function chaveDaEmpresa(e: Empresa | null | undefined): string | null {
  const rua = (e?.endereco ?? '').trim();
  const cidade = (e?.cidade ?? '').trim();
  const uf = (e?.estado ?? '').trim();
  if (rua.length < 5 || !cidade || uf.length !== 2) return null;
  return [rua, cidade, uf].map(textoComparavel).join('|');
}

async function lerBaseGuardada(): Promise<BaseGuardada | null> {
  try {
    const raw = await AsyncStorage.getItem(SAIDA_CACHE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' && typeof obj.chave === 'string' ? (obj as BaseGuardada) : null;
  } catch {
    return null;
  }
}

/**
 * O ponto de onde o prestador sai de manhã. Usa o guardado quando o endereço da
 * empresa não mudou; senão localiza de novo (rede, grátis). NUNCA lança.
 */
export async function pontoDaBase(empresa: Empresa | null | undefined): Promise<LeituraBase> {
  try {
    const chave = chaveDaEmpresa(empresa);
    if (!chave) return { estado: 'sem_endereco' };
    const guardada = await lerBaseGuardada();
    if (guardada && guardada.chave === chave) {
      const coord = coordenadaValida(guardada.lat, guardada.lon);
      const precisao = lerGeoPrecisao(guardada.precisao);
      if (coord && precisao) return { estado: 'ok', ponto: { lat: coord.lat, lon: coord.lon, precisao } };
    }
    const r = await geocodificarEndereco({
      endereco: empresa?.endereco ?? '',
      cidade: empresa?.cidade ?? '',
      estado: empresa?.estado ?? '',
    });
    if (r.estado === 'indisponivel') return { estado: 'indisponivel' };
    if (r.estado !== 'ok' || r.precisao === 'cidade') return { estado: 'sem_endereco' };
    const ponto: PontoVisita = { lat: r.lat, lon: r.lon, precisao: r.precisao };
    try {
      await AsyncStorage.setItem(SAIDA_CACHE_KEY, JSON.stringify({ chave, lat: r.lat, lon: r.lon, precisao: r.precisao }));
    } catch {
      // best-effort: sem guardar, só localiza de novo na próxima vez.
    }
    return { estado: 'ok', ponto };
  } catch {
    return { estado: 'indisponivel' };
  }
}

export interface ParametrosSaida {
  proxima: Agendamento;
  /** Agendamentos do MESMO dia (de onde sai a visita anterior). */
  doDia: readonly Agendamento[];
  base: PontoVisita | null;
  clientes: readonly Cliente[];
  agora?: Date;
}

/** Calcula a hora de sair da `proxima`. Síncrono por natureza; NUNCA lança. */
export function calcularSaida(p: ParametrosSaida): ResultadoSaida {
  const agora = p.agora ?? new Date();
  const inicio = new Date(p.proxima.inicio);
  if (isNaN(inicio.getTime())) return { estado: 'indisponivel', erro: 'horario_invalido' };
  return estimarSaida({
    origem: origemParaVisita(p.proxima, p.doDia, p.base, p.clientes),
    destino: pontoDoAgendamento(p.proxima, p.clientes),
    chegarEm: inicio,
    agora,
  });
}

/** Esquece a base guardada (troca de conta — `clearAllLocalData` já apaga a chave). */
export async function limparCacheSaida(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAIDA_CACHE_KEY);
  } catch {
    // best-effort
  }
}
