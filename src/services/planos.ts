import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, getCurrentUser } from './supabase';
import { derivarPlanoEfetivo, type LinhaAssinaturaEfetiva } from './planoEfetivo';
import { obterEstadoOfertaComercial } from './cotaEnvios';
import { PLANO_CACHE_KEY } from './storageKeys';
import {
  criarPlanoCache,
  interpretarPlanoCache,
  planoCacheValido,
  type DadosPlanoCache,
} from './planoCachePolicy';

export type { PlanoId, Recurso, EstadoAcessoRecurso, LeituraPlano, AcessoServico, FontePlano } from './entitlements';
export {
  acessoDeServico,
  planoConfirmado,
  RECURSOS_POR_PLANO,
  RECURSO_REMOVE_MARCA,
  RECURSOS_EM_BREVE,
  RECURSOS_EM_ORDEM,
  disponibilidadeRecurso,
  estadoAcessoRecurso,
  planoMinimoDoRecurso,
  temAcessoRecurso,
  IA_USOS_GRATIS_MES,
  TRIAL_PRO_DIAS,
} from './entitlements';
import type { AcessoServico, PlanoId, Recurso } from './entitlements';
import { acessoDeServico, temAcessoRecurso, IA_USOS_GRATIS_MES } from './entitlements';

export interface PlanoAtual {
  plano: PlanoId;
  status?: string;
  validoAte?: string;
  origem?: 'gratis' | 'pagamento' | 'admin' | 'trial';
  /** Distingue estado confirmado, graça offline da mesma conta e incerteza. */
  fonte: 'servidor' | 'cache_mesmo_usuario' | 'sessao_ausente' | 'indisponivel';
  /**
   * Plano da empresa (tenant) lido do servidor — só aparece quando é MAIOR que o
   * da conta (membro de equipe de uma empresa paga). Vale apenas para os
   * recursos de `RECURSOS_DO_TENANT`; o `plano` acima continua sendo o da conta.
   */
  planoTenant?: PlanoId;
}

async function lerCache() {
  try {
    return interpretarPlanoCache(await AsyncStorage.getItem(PLANO_CACHE_KEY));
  } catch {
    return null;
  }
}

async function salvarCache(resultado: DadosPlanoCache, ownerUserId: string): Promise<void> {
  try {
    const cache = criarPlanoCache(ownerUserId, resultado);
    await AsyncStorage.setItem(PLANO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort: falha ao gravar cache não deve quebrar o fluxo
  }
}

/**
 * Deriva o plano efetivo a partir da linha de `assinaturas`: status
 * Somente active/trialing com `current_period_end` futuro contam como pagos.
 * `past_due`, vigência ausente, cancelada ou vencida falham fechados enquanto
 * não existir uma política de carência autoritativa e auditável.
 */
function derivarPlano(row: LinhaAssinaturaEfetiva): DadosPlanoCache {
  const efetivo = derivarPlanoEfetivo(row);
  return {
    plano: efetivo.planoEfetivo,
    status: row.status ?? undefined,
    validoAte: efetivo.validoAte,
    origem: efetivo.origem,
  };
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
  let ownerUserId: string | null = null;
  try {
    if (!supabase) return { plano: 'gratis', origem: 'gratis', fonte: 'indisponivel' };

    const user = await getCurrentUser();
    if (!user) return { plano: 'gratis', origem: 'gratis', fonte: 'sessao_ausente' };
    ownerUserId = user.id;

    const { data, error } = await supabase
      .from('assinaturas')
      .select('plano, status, current_period_end, admin_plano_override, admin_override_ativo, admin_override_ate')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    // Sem linha na tabela = nunca assinou = grátis (resultado válido, não erro).
    let resultado: DadosPlanoCache = data ? derivarPlano(data) : { plano: 'gratis' as PlanoId, origem: 'gratis' };
    if (resultado.plano === 'gratis') {
      const oferta = await obterEstadoOfertaComercial();
      // A oferta é quem diz se há TESTE do Pro ativo ou se a EMPRESA (tenant) paga.
      // Se a leitura dela falhou, "grátis" seria um palpite: com ele os serviços em
      // segundo plano CANCELARIAM o follow-up de quem está no teste e o técnico de
      // uma empresa paga perderia a hora de sair. Falha aqui = falha da leitura
      // (cai no cache da mesma conta ou em `indisponivel`), nunca "grátis confirmado".
      if (oferta === null) throw new Error('oferta_comercial_indisponivel');
      if (oferta.trialEstado === 'active' && oferta.planoEfetivo === 'pro' && oferta.trialTerminaEm) {
        resultado = {
          plano: 'pro',
          status: 'trialing',
          validoAte: oferta.trialTerminaEm,
          origem: 'trial',
        };
      } else if (oferta && oferta.planoEfetivo !== 'gratis') {
        // Conta sem assinatura própria, mas a EMPRESA dela (tenant) é paga: é o
        // técnico/gestor de uma equipe. O servidor resolveu o tenant; guardamos à
        // parte — só os recursos de campo (RECURSOS_DO_TENANT) usam isto.
        resultado = { ...resultado, planoTenant: oferta.planoEfetivo };
      }
    }
    await salvarCache(resultado, ownerUserId);
    return { ...resultado, fonte: 'servidor' };
  } catch {
    // Falha de rede/consulta: usa somente o cache da MESMA conta, ainda vigente.
    const cache = await lerCache();
    if (ownerUserId && planoCacheValido(cache, ownerUserId)) {
      return {
        plano: cache.plano,
        status: cache.status,
        validoAte: cache.validoAte,
        origem: cache.origem,
        fonte: 'cache_mesmo_usuario',
        ...(cache.planoTenant ? { planoTenant: cache.planoTenant } : {}),
      };
    }
    return { plano: 'gratis', origem: 'gratis', fonte: 'indisponivel' };
  }
}

/**
 * Pode um SERVIÇO em segundo plano usar este recurso agora? Lê o plano (servidor,
 * com a graça do cache da mesma conta) e devolve os 3 estados de
 * `acessoDeServico`. Nunca lança: falha vira `indeterminado` — e quem chama não
 * mexe em nada nesse caso. Usado pelos agendadores (follow-up, hora de sair) e
 * pelas chamadas de API paga (ETA).
 */
export async function acessoRecursoAgora(recurso: Recurso): Promise<AcessoServico> {
  try {
    const { plano, fonte, planoTenant } = await getPlanoAtual();
    return acessoDeServico(plano, fonte, recurso, planoTenant);
  } catch {
    return 'indeterminado';
  }
}

/** Invalida o cache local de plano (ex.: após voltar do checkout/portal Stripe). */
/**
 * Lê apenas o PLANO do cache local, sem tocar na rede. Usado para semear a UI
 * instantaneamente no cold start (evita piscar o muro Pro para quem paga
 * enquanto a leitura de rede não chega). Retorna null se não há cache válido.
 */
export async function getPlanoCacheado(): Promise<PlanoId | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const cache = await lerCache();
  return planoCacheValido(cache, user.id) ? cache.plano : null;
}

export function invalidarCachePlano(): void {
  AsyncStorage.removeItem(PLANO_CACHE_KEY).catch(() => {});
}

// ─── Contrato de recursos por plano (Onda 1) ────────────────────────────────
// Mapa ÚNICO de quais recursos cada plano libera. Fonte de verdade para o hook
// usePlano().temAcesso(recurso) e para o componente <GatePro>. NUNCA gatear o
// fluxo de criar orçamento/recibo/cliente/agenda — é a alma do plano Grátis
// (que tem até 5 envios por mês desde 07/11/2026: ver limitesComerciais.ts).

/**
 * Identificadores dos recursos gateáveis. String union para dar autocomplete e
 * pegar typo em tempo de compilação; o mapa abaixo cobre todos.
 *
 * Recursos "de IA" (voz na nuvem, chat, diagnóstico IA) NÃO entram aqui como
 * `false` no grátis: no grátis eles têm 3 usos/mês (contador local), então o
 * gate deles é por COTA, não por plano — ver usosIaRestantes/consumirUsoIa.
 */
// (entitlements movidos para ./entitlements — re-exportados no topo deste arquivo)

// ─── Cota de IA do plano Grátis (3 usos/mês) ────────────────────────────────
// Fonte de verdade: `public.ia_uso_gratis`, escrita atomicamente pelo Worker só
// depois de uma resposta válida. O AsyncStorage abaixo é apenas cache/fallback
// offline e atualização otimista da UI — jamais autoridade de cobrança.

/** Chave NOVA (o roadmap pede chave nova): guarda { mes: 'YYYY-MM', usos: n }. */
const IA_USOS_KEY = 'olli.ia.usos.mes';

// IA_USOS_GRATIS_MES mudou de casa para `./entitlements` (módulo puro) e é
// re-exportado no topo deste arquivo — a tela de planos precisa EXIBIR essa cota
// e não pode importar um módulo que puxa AsyncStorage/Supabase junto.

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

  // A mesma competência UTC e a mesma ação usadas por `consumir_cota_ia` no
  // servidor. RLS permite somente as linhas do usuário logado. Se a leitura
  // falhar, não inventamos "esgotou": caímos no contador local best-effort.
  try {
    if (supabase) {
      const user = await getCurrentUser();
      if (user) {
        const periodo = new Date().toISOString().slice(0, 7);
        const { count, error } = await supabase
          .from('ia_uso_gratis')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('periodo', periodo)
          .eq('acao', 'voz_ia');
        if (!error && typeof count === 'number' && Number.isFinite(count)) {
          return Math.max(0, IA_USOS_GRATIS_MES - Math.max(0, Math.floor(count)));
        }
      }
    }
  } catch {
    // offline/RLS/servidor indisponível → fallback local abaixo
  }

  const { usos } = await lerContadorIa();
  return Math.max(0, IA_USOS_GRATIS_MES - usos);
}

/**
 * Registra localmente 1 uso de IA no mês corrente (só faz sentido no Grátis).
 *
 * Idempotência de competência: se o mês virou, zera antes de somar. Best-effort
 * — se o AsyncStorage falhar, a UX segue (não travamos a IA por não conseguir
 * gravar o contador). A autoridade continua no servidor; isto só deixa a UI
 * responsiva enquanto a próxima revalidação chega. Retorna o total local.
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
