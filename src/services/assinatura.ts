import { Linking } from 'react-native';
import { supabase } from './supabase';
import { PAGAMENTOS_URL } from '../config';
import type { PlanoId } from './planos';
import { derivarPlanoEfetivo } from './planoEfetivo';

/**
 * Serviço de ASSINATURA (Frente 2) — tudo que a AssinaturaScreen precisa para
 * mostrar o estado real da assinatura do usuário logado.
 *
 * Fontes de verdade:
 *  - `public.assinaturas` no Supabase (RLS já limita à própria linha) → plano,
 *    status e vigência. Lemos SÓ as colunas que o app tem grant de SELECT
 *    (plano, status, current_period_end), as mesmas de services/planos.ts.
 *  - Worker Cloudflare (mesmo de pagamentos) para dados que só existem na Stripe
 *    e NUNCA podem passar pelo client com a chave secreta:
 *      GET  /stripe/faturas → histórico de faturas do customer do usuário
 *      GET  /stripe/metodo  → método de pagamento (bandeira + 4 dígitos)
 *      POST /stripe/portal  → abre o Customer Portal (gerenciar/cancelar)
 *
 * A chave secreta da Stripe vive só no worker. O app fala com o worker usando o
 * JWT do Supabase; o worker resolve o customer a partir do id do JWT validado,
 * então um usuário nunca vê dados de outro.
 *
 * Nada aqui lança para a UI: em falha, cada função devolve um default seguro
 * (lista vazia / null / { ok:false }).
 */

/** Uma fatura do histórico da Stripe (valores em centavos). */
export interface Fatura {
  id: string;
  /** epoch em milissegundos, ou null se a Stripe não informou. */
  dataMs: number | null;
  /** valor pago (ou devido) em centavos da moeda `moeda`. */
  valorCentavos: number;
  /** código ISO da moeda em minúsculas (ex.: 'brl'). */
  moeda: string;
  /** status bruto da Stripe: 'paid' | 'open' | 'void' | 'uncollectible' | 'draft' | null. */
  status: string | null;
  /** true quando a fatura foi efetivamente paga. */
  pago: boolean;
  /** link do recibo/fatura hospedado na Stripe (ou null). */
  recibo: string | null;
  /** intervalo de cobrança da fatura, quando recorrente. */
  intervalo: 'month' | 'year' | null;
}

/** Método de pagamento padrão do customer (cartão). */
export interface MetodoPagamento {
  brand: string | null;
  last4: string | null;
}

/** Resumo do estado da assinatura, derivado da linha em public.assinaturas. */
export interface ResumoAssinatura {
  /** Plano em vigor AGORA (considera status e vencimento). */
  planoEfetivo: PlanoId;
  /** Plano que a linha registra (pode ser pago mesmo já vencido/cancelado). */
  planoContratado: PlanoId;
  /** Status bruto da Stripe (active/trialing/past_due/canceled/...). */
  status?: string;
  /** Próxima cobrança / fim do período atual (ISO), quando houver. */
  proximaCobranca?: string;
  /** true se a assinatura está paga e vigente agora. */
  ativo: boolean;
  /** Origem do acesso efetivo, sem misturar concessão manual com pagamento. */
  origem?: 'gratis' | 'pagamento' | 'admin';
  /** true = assinatura recorrente que cobra sozinha: no cartão (Stripe) ou pela
   *  Google Play. Pix (e o 12x avulso) NÃO renovam: quem pagou assim precisa pagar
   *  de novo no vencimento. `undefined` = não deu para saber — NÃO é "Pix". */
  renovaSozinho?: boolean;
  /** true = a assinatura é da Google Play (gerencia-se na Play Store, não na Stripe). */
  renovaPelaPlay?: boolean;
  /** Já comprou no cartão alguma vez (há cliente na Stripe → portal com recibos). */
  temClienteStripe?: boolean;
}

function mapearPlano(v: unknown): PlanoId {
  return v === 'empresa' ? 'empresa' : v === 'pro' ? 'pro' : 'gratis';
}

/** Token de acesso da sessão atual (ou null se deslogado / sem client). */
async function getToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

// Último resumo BOM lido (por usuário) — rede de segurança contra "erro vira vazio":
// uma FALHA de rede não pode rebaixar um pagante para "grátis" (só uma resposta que
// AFIRMA não haver assinatura faz isso). Chaveado por userId para não vazar entre contas.
let cacheResumo: { userId: string; resumo: ResumoAssinatura } | null = null;

/**
 * Lê a linha de assinatura do usuário e deriva o estado exibível. 3 ESTADOS: em ERRO de
 * rede/indisponibilidade, reaproveita o último resumo bom DESTE usuário (não rebaixa para
 * grátis); só uma resposta afirmando "sem assinatura" (`!data`) devolve grátis. Nunca lança.
 */
export async function getResumoAssinatura(): Promise<ResumoAssinatura> {
  const gratis: ResumoAssinatura = { planoEfetivo: 'gratis', planoContratado: 'gratis', ativo: false };
  if (!supabase) return gratis;
  let userId: string | undefined;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return gratis;
    userId = user.id;

    const { data, error } = await supabase
      .from('assinaturas')
      .select('plano, status, current_period_end, stripe_subscription_id, stripe_customer_id, admin_plano_override, admin_override_ativo, admin_override_ate')
      .eq('user_id', user.id)
      .maybeSingle();
    // ERRO (rede/RLS/5xx) ≠ "não tem assinatura": preserva o último bom deste usuário.
    if (error) return cacheResumo && cacheResumo.userId === userId ? cacheResumo.resumo : gratis;
    // Resposta afirmativa SEM linha: genuinamente grátis (e memoriza como bom).
    if (!data) { cacheResumo = { userId, resumo: gratis }; return gratis; }

    const status = typeof data.status === 'string' ? data.status : undefined;
    const proximaCobranca = typeof data.current_period_end === 'string' ? data.current_period_end : undefined;
    const efetivo = derivarPlanoEfetivo(data);
    const planoContratado = mapearPlano(data.plano);

    // Renova sozinho? Stripe responde nesta mesma linha. Sem Stripe, um plano PAGO
    // pode ser Pix (não renova) ou Google Play (renova pela loja) — e confundir os
    // dois ofereceria "Renovar com Pix" a quem já é cobrado pela Play. Na dúvida
    // (leitura falhou), `undefined`: a tela não oferece pagar de novo.
    const temStripe = typeof data.stripe_subscription_id === 'string' && data.stripe_subscription_id.length > 0;
    let renovaSozinho: boolean | undefined = temStripe;
    let renovaPelaPlay = false;
    if (!temStripe && efetivo.origem === 'pagamento' && efetivo.planoEfetivo !== 'gratis') {
      const play = await lerProdutoPlay(user.id);
      if (play.estado === 'indisponivel') renovaSozinho = undefined;
      else if (play.produto) { renovaSozinho = true; renovaPelaPlay = true; }
    }

    const resumo: ResumoAssinatura = {
      planoEfetivo: efetivo.planoEfetivo,
      planoContratado,
      status,
      proximaCobranca,
      ativo: efetivo.planoEfetivo !== 'gratis',
      origem: efetivo.origem,
      renovaSozinho,
      renovaPelaPlay,
      temClienteStripe: typeof data.stripe_customer_id === 'string' && data.stripe_customer_id.length > 0,
    };
    cacheResumo = { userId, resumo };
    return resumo;
  } catch {
    return userId && cacheResumo && cacheResumo.userId === userId ? cacheResumo.resumo : gratis;
  }
}

/** De onde vem a assinatura na Google Play, com o estado de carga explícito. */
export type AssinaturaNaPlay =
  | { estado: 'ok'; produto: string | null } // produto = 'olli_pro:mensal'…; null = não é da Play
  | { estado: 'indisponivel' };

/**
 * A assinatura deste usuário foi vendida pela Google Play? (coluna
 * `revenuecat_produto_id`, gravada pelo webhook do RevenueCat no worker.)
 *
 * Leitura SEPARADA de `getResumoAssinatura` de propósito: é uma coluna nova, e se a
 * migration 20260930120000 ainda não estiver aplicada o select dela falha — isso não
 * pode derrubar a leitura do plano. Falha aqui é 'indisponivel', nunca "não é da
 * Play" (erro não vira vazio); a tela só mostra o atalho de gerenciar com 'ok'.
 */
export async function getAssinaturaNaPlay(): Promise<AssinaturaNaPlay> {
  if (!supabase) return { estado: 'indisponivel' };
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return { estado: 'ok', produto: null };
    return await lerProdutoPlay(user.id);
  } catch {
    return { estado: 'indisponivel' };
  }
}

/**
 * Lê o vínculo com a Play da linha do usuário: o produto SÓ conta enquanto a
 * vigência que a própria Play deu (`revenuecat_vigencia_ate`) não passou — uma
 * assinatura da Play já encerrada, numa linha hoje sustentada por Pix, não é "da
 * Play" (senão esconderia o "Renovar com Pix" de quem precisa renovar).
 * Coluna AUSENTE (Postgres 42703: migration ainda não aplicada) é resposta, não
 * falha: sem a coluna nenhuma venda pela Play pode ter acontecido. Qualquer outro
 * erro é 'indisponivel'.
 */
async function lerProdutoPlay(userId: string): Promise<AssinaturaNaPlay> {
  if (!supabase) return { estado: 'indisponivel' };
  try {
    const { data, error } = await supabase
      .from('assinaturas')
      .select('revenuecat_produto_id, revenuecat_vigencia_ate')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return error.code === '42703' ? { estado: 'ok', produto: null } : { estado: 'indisponivel' };
    const linha = data as { revenuecat_produto_id?: unknown; revenuecat_vigencia_ate?: unknown } | null;
    const produto = typeof linha?.revenuecat_produto_id === 'string' && linha.revenuecat_produto_id ? linha.revenuecat_produto_id : null;
    const ate = typeof linha?.revenuecat_vigencia_ate === 'string' ? Date.parse(linha.revenuecat_vigencia_ate) : Number.NaN;
    return { estado: 'ok', produto: produto && Number.isFinite(ate) && ate > Date.now() ? produto : null };
  } catch {
    return { estado: 'indisponivel' };
  }
}

/** GET autenticado no worker. Devolve o JSON já parseado, ou null em falha. */
async function workerGet(caminho: string): Promise<any | null> {
  if (!PAGAMENTOS_URL) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const r = await fetch(`${PAGAMENTOS_URL}${caminho}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Histórico de faturas do usuário (mais recentes primeiro). [] em qualquer falha. */
export async function getFaturas(): Promise<Fatura[]> {
  const data = await workerGet('/stripe/faturas');
  if (!data || data.ok !== true || !Array.isArray(data.faturas)) return [];
  return data.faturas
    .map((f: any): Fatura | null => {
      if (!f || typeof f.id !== 'string') return null;
      return {
        id: f.id,
        dataMs: typeof f.data === 'number' ? f.data : null,
        valorCentavos: typeof f.valorCentavos === 'number' ? f.valorCentavos : 0,
        moeda: typeof f.moeda === 'string' ? f.moeda : 'brl',
        status: typeof f.status === 'string' ? f.status : null,
        pago: f.pago === true,
        recibo: typeof f.recibo === 'string' ? f.recibo : null,
        intervalo: f.intervalo === 'month' || f.intervalo === 'year' ? f.intervalo : null,
      };
    })
    .filter((f: Fatura | null): f is Fatura => f !== null);
}

/** Método de pagamento padrão (bandeira + 4 dígitos), ou null se não houver. */
export async function getMetodoPagamento(): Promise<MetodoPagamento | null> {
  const data = await workerGet('/stripe/metodo');
  if (!data || data.ok !== true || !data.metodo) return null;
  const m = data.metodo;
  const brand = typeof m.brand === 'string' ? m.brand : null;
  const last4 = typeof m.last4 === 'string' ? m.last4 : null;
  if (!brand && !last4) return null;
  return { brand, last4 };
}

/** Resultado de abrir o portal Stripe. */
export type ResultadoPortal = { ok: true } | { ok: false; motivo: 'nao_configurado' | 'sem_login' | 'sem_assinatura' | 'falha' };

/**
 * Abre o Customer Portal da Stripe (gerenciar / cancelar / trocar plano / trocar
 * cartão). POST /stripe/portal com o JWT; o worker cria a sessão do portal e
 * devolve a URL, que abrimos no navegador do sistema.
 */
export async function abrirPortalAssinatura(): Promise<ResultadoPortal> {
  if (!PAGAMENTOS_URL) return { ok: false, motivo: 'nao_configurado' };
  const token = await getToken();
  if (!token) return { ok: false, motivo: 'sem_login' };
  try {
    const r = await fetch(`${PAGAMENTOS_URL}/stripe/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (r.status === 404) return { ok: false, motivo: 'sem_assinatura' };
    if (!r.ok) return { ok: false, motivo: 'falha' };
    const data: any = await r.json();
    if (!data?.ok || typeof data.url !== 'string') return { ok: false, motivo: 'falha' };
    await Linking.openURL(data.url);
    return { ok: true };
  } catch {
    return { ok: false, motivo: 'falha' };
  }
}
