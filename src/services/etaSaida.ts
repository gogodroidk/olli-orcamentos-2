/**
 * "A que horas eu preciso SAIR" — a CASCA (rede + cache) da Fase 1.
 *
 * Toda a decisão mora em `saidaCalculo.ts` (puro, testado de verdade por
 * `scripts/teste-eta-saida-app.ts`). Aqui só tem o que precisa de mundo
 * externo: `fetch`, sessão do Supabase e AsyncStorage.
 *
 * CONTRATO (worker/src/etaSaida.js, seção 12.2 de docs/ENXAME/IDEIA_ETA_TRANSITO.md):
 *
 *   POST {DIAGNOSTICO_URL}/eta/saida       Authorization: Bearer <jwt do Supabase>
 *   { origem: "Rua X, 123, São Paulo/SP",     // texto OU {lat,lng}
 *     destino: "Rua Y, 456, Santo André/SP",
 *     chegarEm: "2026-07-18T18:00:00.000Z",   // ISO 8601 COM fuso — obrigatório
 *     modo: "planejamento" | "confirmacao" }  // obrigatório: decide o SKU
 *
 * Duas exigências do contrato que o app precisa respeitar ao pé da letra:
 *  1. `chegarEm` PRECISA de designador de fuso. `Date#toISOString()` termina em
 *     `Z`, então serve — mas montar a string à mão ("2026-07-18T15:00:00") faz
 *     o worker recusar com `chegar_em_sem_fuso`, e ele está certo: "15h" sem
 *     fuso pode ser 15h em qualquer lugar do planeta, e chegada ambígua erra a
 *     hora de sair por horas.
 *  2. `modo` não tem default. É de propósito: a escolha custa dinheiro
 *     (Essentials × Pro = metade do preço e o dobro da franquia grátis) e fica
 *     visível em quem chama, não escondida aqui.
 *
 * ─── CUSTO (é o que decide o desenho, não a elegância) ─────────────────────
 * A Routes API é o único terceiro caro por uso no OLLI. Duas travas AQUI:
 *  (a) cache local persistente de duração (AsyncStorage), com o MESMO TTL do
 *      worker — 30 dias para 'planejamento', 10 min para 'confirmacao';
 *  (b) o app nunca dispara isto em `useEffect` de tela. Quem chama é o ritual
 *      diário (1× por reagendamento, para a PRÓXIMA parada) e um toque
 *      explícito do prestador em "Atualizar". A alavanca de custo do lado caro
 *      não é cache — é CHAMAR MENOS (seção 12.4b do doc).
 *
 * NÃO PEDE LOCALIZAÇÃO. A origem vem do cadastro (visita anterior ou empresa).
 * `expo-location` não está instalado e permissão nova é passo de loja
 * (manifest + texto de propósito + Data safety + review). Esta feature não
 * precisa: onde o celular está às 7h não prevê de onde ele sai às 14h20.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DIAGNOSTICO_URL } from '../config';
import { accessTokenAtual } from './eta';
import { SAIDA_CACHE_KEY } from './storageKeys';
import {
  cacheValido,
  chaveTrajeto,
  interpretarResposta,
  MAX_HORIZONTE_MS,
  MIN_ENDERECO,
  montarSaida,
  type DuracaoCacheada,
  type ModoSaida,
  type ResultadoSaida,
} from './saidaCalculo';

export * from './saidaCalculo';

/** Mesmo timeout do `/eta`: rota leve (uma chamada à Routes API), não é o diagnóstico por IA. */
const TIMEOUT_MS = 15_000;

/** Teto de entradas no cache local. Prestador roda dezenas de trajetos, não milhares. */
const MAX_ENTRADAS_CACHE = 40;

type MapaCache = Record<string, DuracaoCacheada>;

async function lerCache(): Promise<MapaCache> {
  try {
    const raw = await AsyncStorage.getItem(SAIDA_CACHE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? (obj as MapaCache) : {};
  } catch {
    // Cache ilegível é cache vazio — nunca um erro que derruba o cálculo.
    return {};
  }
}

/**
 * Grava a duração e poda o mapa pelo carimbo mais velho. Best-effort: falha ao
 * gravar cache só custa dinheiro na próxima chamada, nunca uma resposta errada.
 */
async function gravarCache(chave: string, dados: DuracaoCacheada): Promise<void> {
  try {
    const mapa = await lerCache();
    mapa[chave] = dados;
    const chaves = Object.keys(mapa);
    if (chaves.length > MAX_ENTRADAS_CACHE) {
      chaves
        .sort((a, b) => Date.parse(mapa[a].calculadoEm) - Date.parse(mapa[b].calculadoEm))
        .slice(0, chaves.length - MAX_ENTRADAS_CACHE)
        .forEach((k) => delete mapa[k]);
    }
    await AsyncStorage.setItem(SAIDA_CACHE_KEY, JSON.stringify(mapa));
  } catch {
    // best-effort
  }
}

export interface ParametrosSaida {
  /** Texto do endereço de origem (cadastro — nunca GPS). `null` = não temos. */
  origem: string | null;
  /** Texto do endereço de destino. `null` = não temos. */
  destino: string | null;
  /** Horário marcado da visita. */
  chegarEm: Date;
  modo: ModoSaida;
  /** `true` ignora o cache local (o prestador tocou "Atualizar" e quer o número de agora). */
  forcar?: boolean;
  agora?: Date;
}

/**
 * Calcula a hora de sair. NUNCA lança — sempre resolve um dos 3 estados.
 *
 * Ordem das checagens é intencional: tudo que dá para reprovar de graça
 * (endereço faltando, horário no passado, sem sessão, cache válido) acontece
 * ANTES do `fetch`. Chamada paga é o último recurso, não o primeiro.
 */
export async function calcularSaida(p: ParametrosSaida): Promise<ResultadoSaida> {
  const agora = p.agora ?? new Date();
  try {
    // ─── Endereço: reprovado aqui = zero chamada paga, e o estado é o
    // acionável ("corrigir endereço"), não o genérico ("tente depois").
    const origem = (p.origem ?? '').trim();
    const destino = (p.destino ?? '').trim();
    const semOrigem = origem.length < MIN_ENDERECO;
    const semDestino = destino.length < MIN_ENDERECO;
    if (semOrigem && semDestino) return { estado: 'endereco_insuficiente', qual: 'ambos' };
    if (semOrigem) return { estado: 'endereco_insuficiente', qual: 'origem' };
    if (semDestino) return { estado: 'endereco_insuficiente', qual: 'destino' };

    const chegarMs = p.chegarEm?.getTime?.();
    if (!Number.isFinite(chegarMs)) return { estado: 'indisponivel', erro: 'horario_invalido' };
    // O worker recusaria os dois casos abaixo (`chegar_em_passado` /
    // `chegar_em_distante`). Reprovar aqui evita a ida e volta e devolve o
    // mesmo nome de erro, para o app não precisar aprender dois vocabulários.
    if (chegarMs <= agora.getTime()) return { estado: 'indisponivel', erro: 'chegar_em_passado' };
    if (chegarMs - agora.getTime() > MAX_HORIZONTE_MS) {
      return { estado: 'indisponivel', erro: 'chegar_em_distante' };
    }

    const chave = chaveTrajeto({ origem, destino, chegarEm: p.chegarEm, modo: p.modo });
    if (!p.forcar) {
      const mapa = await lerCache();
      const guardado = mapa[chave];
      if (guardado && cacheValido(guardado.calculadoEm, p.modo, agora)) {
        // O carimbo continua sendo o do cálculo ORIGINAL: número de ontem com a
        // hora de hoje é a versão sofisticada de "erro vira vazio".
        return montarSaida(guardado, p.chegarEm, agora, true);
      }
    }

    if (!DIAGNOSTICO_URL) return { estado: 'indisponivel', erro: 'nao_configurado' };
    const token = await accessTokenAtual();
    if (!token) return { estado: 'indisponivel', erro: 'sem_sessao' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${DIAGNOSTICO_URL}/eta/saida`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          origem,
          destino,
          // `toISOString()` termina em Z — o designador de fuso que o worker exige.
          chegarEm: new Date(chegarMs).toISOString(),
          modo: p.modo,
        }),
        signal: controller.signal,
      });
      // O worker responde os 3 estados com corpo JSON mesmo em 400/401/429, então
      // o corpo manda; o status só decide quando não há corpo legível.
      const corpo = await r.json().catch(() => null);
      const { resultado, cachear } = interpretarResposta(corpo, r.status, p.chegarEm, agora);
      if (cachear) await gravarCache(chave, cachear);
      return resultado;
    } finally {
      clearTimeout(timer);
    }
  } catch (erro) {
    // Offline, DNS, abort do timeout: "não sei". Nunca um número.
    console.log('[etaSaida] falha ao calcular a hora de sair:', erro);
    return { estado: 'indisponivel', erro: 'rede' };
  }
}

/** Esquece o cache local de duração (troca de conta — `clearAllLocalData` já apaga a chave). */
export async function limparCacheSaida(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAIDA_CACHE_KEY);
  } catch {
    // best-effort
  }
}
