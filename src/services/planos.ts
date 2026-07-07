import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCurrentUser } from './supabase';

/** Chave de cache do último plano conhecido (com carimbo de quando foi lido). */
const CACHE_KEY = 'olli.plano.cache';

/** Janela de graça offline: usa o cache mesmo sem conseguir consultar a nuvem. */
const GRACA_MS = 7 * 24 * 60 * 60 * 1000;

export type PlanoId = 'gratis' | 'pro' | 'empresa';

export interface PlanoAtual {
  plano: PlanoId;
  status?: string;
  validoAte?: string;
}

interface PlanoCache extends PlanoAtual {
  /** epoch ms de quando este resultado foi obtido com sucesso da nuvem. */
  lidoEm: number;
}

/** Status que a assinatura no Stripe considera "pago" mesmo com alguma pendência. */
const STATUS_PAGOS = new Set(['active', 'trialing', 'past_due']);

async function lerCache(): Promise<PlanoCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.lidoEm !== 'number' || Number.isNaN(parsed.lidoEm)) return null;
    if (parsed.plano !== 'gratis' && parsed.plano !== 'pro' && parsed.plano !== 'empresa') return null;
    return parsed as PlanoCache;
  } catch {
    return null;
  }
}

async function salvarCache(resultado: PlanoAtual): Promise<void> {
  try {
    const cache: PlanoCache = { ...resultado, lidoEm: Date.now() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort: falha ao gravar cache não deve quebrar o fluxo
  }
}

/** Cache ainda dentro da janela de graça (robusto a relógio/valor inválido). */
function cacheValido(cache: PlanoCache | null): cache is PlanoCache {
  if (!cache) return false;
  const idade = Date.now() - cache.lidoEm;
  if (Number.isNaN(idade)) return false;
  return idade >= 0 && idade <= GRACA_MS;
}

/**
 * Deriva o plano efetivo a partir da linha de `assinaturas`: status
 * active/trialing/past_due contam como pago; canceled (ou qualquer outro
 * status desconhecido) não. Também verifica se `current_period_end` já
 * passou — assinatura vencida sem status atualizado ainda não conta como paga.
 */
function derivarPlano(row: { plano: string; status: string | null; current_period_end: string | null }): PlanoAtual {
  const status = row.status ?? undefined;
  const pago = !!status && STATUS_PAGOS.has(status);
  if (!pago) return { plano: 'gratis', status, validoAte: row.current_period_end ?? undefined };

  if (row.current_period_end) {
    const fim = Date.parse(row.current_period_end);
    if (!Number.isNaN(fim) && fim < Date.now()) {
      return { plano: 'gratis', status, validoAte: row.current_period_end };
    }
  }

  const plano: PlanoId = row.plano === 'empresa' ? 'empresa' : row.plano === 'pro' ? 'pro' : 'gratis';
  return { plano, status, validoAte: row.current_period_end ?? undefined };
}

/**
 * Retorna o plano atual do usuário logado.
 *
 * Fonte de verdade: tabela `public.assinaturas` no Supabase (RLS já limita a
 * leitura à própria linha do usuário). Em caso de falha de rede/consulta, cai
 * no último resultado bom salvo em cache local por até 7 dias de graça — para
 * não bloquear quem pagou e ficou offline. Deslogado ou sem Supabase
 * configurado sempre retorna 'gratis'. Nunca lança.
 */
export async function getPlanoAtual(): Promise<PlanoAtual> {
  try {
    if (!supabase) return { plano: 'gratis' };

    const user = await getCurrentUser();
    if (!user) return { plano: 'gratis' };

    const { data, error } = await supabase
      .from('assinaturas')
      .select('plano, status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    // Sem linha na tabela = nunca assinou = grátis (resultado válido, não erro).
    const resultado = data ? derivarPlano(data) : { plano: 'gratis' as PlanoId };
    await salvarCache(resultado);
    return resultado;
  } catch {
    // Falha de rede/consulta: usa o cache por até 7 dias de graça.
    const cache = await lerCache();
    if (cacheValido(cache)) {
      return { plano: cache.plano, status: cache.status, validoAte: cache.validoAte };
    }
    return { plano: 'gratis' };
  }
}

/** Invalida o cache local de plano (ex.: após voltar do checkout/portal Stripe). */
export function invalidarCachePlano(): void {
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}
