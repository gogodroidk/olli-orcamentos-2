/**
 * COORDENADA DE RESERVA DO CLIMA — a cidade do cadastro (Meu negócio).
 *
 * Por que existe: no APK o clima não tem localização (expo-location ainda não
 * entrou, ver `LOCALIZACAO_DISPONIVEL`), e o `Agendamento` guarda só o endereço
 * em texto. Sem uma coordenada, `useClimaDoDia` só sabe dizer "Clima
 * indisponível". A cidade da empresa resolve: o clima é por célula de ~5 km.
 *
 * CUSTO: a coordenada sai do `POST /geocodificar` do worker (o MESMO já usado
 * pelo ETA e pelo aviso "saia às"; nada de serviço novo) UMA vez por cidade por
 * aparelho — o resultado fica no AsyncStorage. Buscas simultâneas da mesma
 * cidade viram uma só; falha não é gravada (a próxima montagem tenta de novo).
 *
 * Nunca pede permissão de nada e nunca lança.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { chaveCidadeClima, consultaCidadeClima } from '../utils/cidadeClima';
import { coordenadaValida } from './climaTexto';
import { geocodificarEndereco } from './eta';
import { CLIMA_COORD_CIDADE_KEY } from './storageKeys';
import type { CoordenadaClima } from './clima';

/** 3 estados + "o cadastro não tem cidade" (que a tela explica, com atalho). */
export type ReservaClima =
  | { estado: 'carregando' }
  | { estado: 'sem_cidade' }
  | { estado: 'falhou' }
  | { estado: 'ok'; coord: CoordenadaClima };

/** Uma busca por cidade por processo: remontar a Home não geocodifica de novo. */
const emVoo = new Map<string, Promise<CoordenadaClima | null>>();

async function lerGuardada(chave: string): Promise<CoordenadaClima | null> {
  try {
    const raw = await AsyncStorage.getItem(CLIMA_COORD_CIDADE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (g?.chave !== chave || !coordenadaValida(g?.lat, g?.lon)) return null;
    return { lat: g.lat, lon: g.lon };
  } catch {
    return null;
  }
}

async function resolver(consulta: string): Promise<CoordenadaClima | null> {
  const chave = chaveCidadeClima(consulta);
  const guardada = await lerGuardada(chave);
  if (guardada) return guardada;
  const c = await geocodificarEndereco(consulta);
  if (!c || !coordenadaValida(c.lat, c.lng)) return null;
  const coord = { lat: c.lat, lon: c.lng };
  try {
    await AsyncStorage.setItem(CLIMA_COORD_CIDADE_KEY, JSON.stringify({ chave, ...coord }));
  } catch {
    /* sem disco: vale para esta sessão */
  }
  return coord;
}

/** Em que pé está a leitura do cadastro da empresa na tela que pede o clima. */
export type LeituraCadastro = 'carregando' | 'erro' | 'ok';

/**
 * Coordenada da cidade do cadastro para o clima. Os 3 estados da leitura do
 * cadastro chegam inteiros: "ainda não li a empresa" fica em 'carregando' e
 * "não consegui ler" vira 'falhou' — nenhum dos dois pode virar "o cadastro não
 * tem cidade".
 */
export function useReservaClima(cidade: string | null | undefined, estado: string | null | undefined, cadastro: LeituraCadastro): ReservaClima {
  const [r, setR] = useState<ReservaClima>({ estado: 'carregando' });
  const consulta = consultaCidadeClima(cidade, estado);

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
      p = resolver(consulta).catch(() => null);
      emVoo.set(chave, p);
    }
    p.then((coord) => {
      // Falha não fica guardada: a próxima montagem da Home tenta de novo.
      if (!coord) emVoo.delete(chave);
      if (!vivo) return;
      setR(coord ? { estado: 'ok', coord } : { estado: 'falhou' });
    });
    return () => {
      vivo = false;
    };
  }, [consulta, cadastro]);

  return r;
}
