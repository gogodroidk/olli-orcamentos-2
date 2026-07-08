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
/**
 * Lê apenas o PLANO do cache local, sem tocar na rede. Usado para semear a UI
 * instantaneamente no cold start (evita piscar o muro Pro para quem paga
 * enquanto a leitura de rede não chega). Retorna null se não há cache válido.
 */
export async function getPlanoCacheado(): Promise<PlanoId | null> {
  const cache = await lerCache();
  return cache?.plano ?? null;
}

export function invalidarCachePlano(): void {
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}

// ─── Contrato de recursos por plano (Onda 1) ────────────────────────────────
// Mapa ÚNICO de quais recursos cada plano libera. Fonte de verdade para o hook
// usePlano().temAcesso(recurso) e para o componente <GatePro>. NUNCA gatear o
// fluxo de criar orçamento/recibo/cliente/agenda — é a alma do plano Grátis.

/**
 * Identificadores dos recursos gateáveis. String union para dar autocomplete e
 * pegar typo em tempo de compilação; o mapa abaixo cobre todos.
 *
 * Recursos "de IA" (voz na nuvem, chat, diagnóstico IA) NÃO entram aqui como
 * `false` no grátis: no grátis eles têm 3 usos/mês (contador local), então o
 * gate deles é por COTA, não por plano — ver usosIaRestantes/consumirUsoIa.
 */
export type Recurso =
  | 'ia_ilimitada'      // IA sem cota mensal (voz nuvem + chat + diagnóstico IA)
  | 'relatorios'        // relatórios de faturamento e conversão
  | 'metas'             // metas de vendas e acompanhamento
  | 'radar_clientes'    // radar de clientes sumidos (lista completa)
  | 'relatorio_dia'     // relatório do dia falado
  | 'modelos_pdf_premium' // modelos premium de PDF (Onda 5)
  | 'equipe'            // vários técnicos e papéis
  | 'mapa_equipe'       // equipe ao vivo no mapa
  | 'dashboard_empresa'; // painel de gestão da empresa

/**
 * RECURSOS_POR_PLANO — o que cada plano libera.
 *
 * gratis: orçamentos/recibos/clientes/agenda ilimitados, diagnóstico offline e
 *   link do cliente são livres (não passam pelo mapa: nunca se gateiam). IA tem
 *   3 usos/mês (cota, não plano). Nenhum recurso Pro/Empresa.
 * pro: toda a IA sem cota, relatórios, metas, radar, relatório do dia falado e
 *   os modelos premium de PDF.
 * empresa: tudo do Pro + equipe/papéis/mapa/dashboard da empresa.
 */
export const RECURSOS_POR_PLANO: Record<PlanoId, ReadonlySet<Recurso>> = {
  gratis: new Set<Recurso>(),
  pro: new Set<Recurso>([
    'ia_ilimitada',
    'relatorios',
    'metas',
    'radar_clientes',
    'relatorio_dia',
    'modelos_pdf_premium',
  ]),
  empresa: new Set<Recurso>([
    'ia_ilimitada',
    'relatorios',
    'metas',
    'radar_clientes',
    'relatorio_dia',
    'modelos_pdf_premium',
    'equipe',
    'mapa_equipe',
    'dashboard_empresa',
  ]),
};

/**
 * `true` se o `plano` dá acesso ao `recurso`. Recurso desconhecido → false
 * (nega por padrão: mais seguro do que liberar por engano). Empresa é
 * superconjunto do Pro pelo próprio mapa, então não precisa de cascata aqui.
 */
export function temAcessoRecurso(plano: PlanoId, recurso: Recurso): boolean {
  return RECURSOS_POR_PLANO[plano]?.has(recurso) ?? false;
}

// ─── Cota de IA do plano Grátis (3 usos/mês, contador local) ────────────────
// Contamos em AsyncStorage, por mês corrente. Não é fonte de verdade fiscal —
// é um limitador amigável de custo de IA no grátis; quem paga (pro/empresa)
// tem 'ia_ilimitada' e nem consulta o contador.

/** Chave NOVA (o roadmap pede chave nova): guarda { mes: 'YYYY-MM', usos: n }. */
const IA_USOS_KEY = 'olli.ia.usos.mes';

/** Cota mensal de usos de IA no plano Grátis. */
export const IA_USOS_GRATIS_MES = 3;

interface ContadorIa {
  /** competência 'YYYY-MM' à qual os usos pertencem. */
  mes: string;
  /** usos já consumidos neste mês. */
  usos: number;
}

/** Competência do mês corrente no formato 'YYYY-MM' (hora local do aparelho). */
function mesCorrente(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
}

/** Lê o contador; se for de outro mês (ou inválido/ausente) devolve zerado no mês atual. */
async function lerContadorIa(): Promise<ContadorIa> {
  const mes = mesCorrente();
  try {
    const raw = await AsyncStorage.getItem(IA_USOS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        parsed.mes === mes &&
        typeof parsed.usos === 'number' &&
        Number.isFinite(parsed.usos) &&
        parsed.usos >= 0
      ) {
        return { mes, usos: Math.floor(parsed.usos) };
      }
    }
  } catch {
    // parse/leitura falhou: trata como mês zerado (nunca bloqueia por erro de storage)
  }
  return { mes, usos: 0 };
}

/**
 * Usos de IA ainda disponíveis no mês corrente, dado o `plano`.
 *
 * pro/empresa (ou qualquer plano com 'ia_ilimitada') → Infinity (sem cota).
 * gratis → IA_USOS_GRATIS_MES menos o que já usou este mês (nunca negativo).
 * Nunca lança: falha de storage vira "cota cheia" (não pune o usuário por erro nosso).
 */
export async function getUsosIaRestantes(plano: PlanoId): Promise<number> {
  if (temAcessoRecurso(plano, 'ia_ilimitada')) return Number.POSITIVE_INFINITY;
  const { usos } = await lerContadorIa();
  return Math.max(0, IA_USOS_GRATIS_MES - usos);
}

/**
 * Registra 1 uso de IA no mês corrente (só faz sentido no plano Grátis).
 *
 * Idempotência de competência: se o mês virou, zera antes de somar. Best-effort
 * — se o AsyncStorage falhar, a UX segue (não travamos a IA por não conseguir
 * gravar o contador). Retorna o total de usos consumidos após incrementar.
 */
export async function consumirUsoIa(): Promise<number> {
  const atual = await lerContadorIa();
  const proximo: ContadorIa = { mes: atual.mes, usos: atual.usos + 1 };
  try {
    await AsyncStorage.setItem(IA_USOS_KEY, JSON.stringify(proximo));
  } catch {
    // best-effort: gravação falhou, mas não impedimos o uso da IA
  }
  return proximo.usos;
}
