/**
 * Assinatura pela Google Play — Android, via RevenueCat (`react-native-purchases`).
 *
 * ÚNICO arquivo do app que importa o SDK de compra da Play (o gate
 * `scripts/teste-roteamento-pagamento.ts` reprova qualquer outro). A tela de Planos
 * só conversa com as quatro funções abaixo.
 *
 * QUEM LIBERA O PLANO É O SERVIDOR. Uma compra concluída aqui NÃO muda o plano no
 * app: o RevenueCat valida o recibo com o Google e avisa o worker
 * (`POST /revenuecat/webhook`), que grava `public.assinaturas`. A tela então relê o
 * plano do servidor, como faz depois do Pix. Nada de "liberar otimista" com o
 * `customerInfo` do SDK — o client não é fonte de verdade de dinheiro.
 *
 * VÍNCULO COM A CONTA: o SDK é configurado com `appUserID` = id do usuário no
 * Supabase, e nunca de forma anônima. É esse id que chega no webhook como
 * `app_user_id` e diz de quem é a assinatura. Sem login, não há venda.
 *
 * DESLIGADO por padrão (NUNCA MODO DEMO): sem `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY`
 * válida, ou rodando no Expo Go (onde o SDK simula compras em JavaScript), nenhuma
 * função chega a tocar o SDK — ver `estadoPlayBilling`.
 */
import { isRunningInExpoGo } from 'expo';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { REVENUECAT_GOOGLE_KEY } from '../config';
import { supabase } from './supabase';
import {
  comoComprarNaPlay,
  estadoPlayBilling,
  ofertasDoCatalogo,
  traduzirFalhaPlay,
  type EstadoPlayBilling,
  type OfertaPlay,
} from './playBillingRegras';
import type { ResultadoCompraPlay, ResultadoOfertasPlay, ResultadoRestauracaoPlay } from './playBilling';

export type { ResultadoCompraPlay, ResultadoOfertasPlay, ResultadoRestauracaoPlay } from './playBilling';

/** Decidido uma vez: a chave vem embutida no build e o Expo Go não muda em runtime. */
export const ESTADO_PLAY_BILLING: EstadoPlayBilling = estadoPlayBilling({
  plataforma: 'android',
  chave: REVENUECAT_GOOGLE_KEY,
  emExpoGo: (() => {
    try {
      return isRunningInExpoGo();
    } catch {
      // Não deu para saber se é Expo Go → trata como se fosse (desliga). Na dúvida,
      // não arriscar o modo de compras simuladas.
      return true;
    }
  })(),
});

export function playBillingLigado(): boolean {
  return ESTADO_PLAY_BILLING === 'ligado';
}

/** Para qual usuário do Supabase o SDK está configurado agora (null = ainda não). */
let configuradoPara: string | null = null;

/**
 * Garante o SDK configurado PARA O USUÁRIO LOGADO e devolve o id dele. Troca de
 * conta no mesmo aparelho vira `logIn` (o RevenueCat passa a atribuir as compras
 * ao novo id). `null` = sem sessão: quem chama responde 'sem_login'.
 * Lança só em falha do SDK — quem chama traduz para 'erro'.
 */
async function garantirSdk(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id ?? null;
  if (!userId) return null;
  if (configuradoPara === null) {
    Purchases.configure({ apiKey: REVENUECAT_GOOGLE_KEY, appUserID: userId });
    configuradoPara = userId;
  } else if (configuradoPara !== userId) {
    await Purchases.logIn(userId);
    configuradoPara = userId;
  }
  return userId;
}

/** Pacotes da oferta atual, guardados para comprar pelo objeto que o SDK exige. */
let pacotesPorProduto = new Map<string, PurchasesPackage>();

/**
 * Lê a oferta atual do RevenueCat, com o PREÇO QUE A LOJA DEVOLVE. 3 estados de
 * verdade: 'ok' (com a lista — pode vir vazia se a oferta não tiver os produtos do
 * catálogo), 'erro' (não deu para saber) e 'sem_login'. "Não carregou" nunca vira
 * "não há planos".
 */
export async function carregarOfertasPlay(): Promise<ResultadoOfertasPlay> {
  if (!playBillingLigado()) return { estado: 'desligado' };
  try {
    const userId = await garantirSdk();
    if (!userId) return { estado: 'sem_login' };
    const ofertas = await Purchases.getOfferings();
    const pacotes = ofertas.current?.availablePackages ?? [];
    pacotesPorProduto = new Map(pacotes.map((p) => [p.product.identifier, p]));
    return {
      estado: 'ok',
      ofertas: ofertasDoCatalogo(
        pacotes.map((p) => ({ produtoId: p.product.identifier, precoTexto: p.product.priceString })),
      ),
    };
  } catch {
    return { estado: 'erro' };
  }
}

/**
 * Abre a folha de pagamento da Google Play para a oferta escolhida. 'confirmada'
 * quer dizer "a Play concluiu a compra" — o plano ainda depende do webhook; a tela
 * relê o servidor e avisa que está liberando.
 */
export async function comprarNaPlay(oferta: OfertaPlay): Promise<ResultadoCompraPlay> {
  if (!playBillingLigado()) return { estado: 'desligado' };
  try {
    const userId = await garantirSdk();
    if (!userId) return { estado: 'sem_login' };
    const pacote = pacotesPorProduto.get(oferta.produtoId);
    // Sem o pacote da oferta carregada não há o que comprar — nunca montar produto
    // à mão: o preço e o produto têm de ser os que a loja devolveu.
    if (!pacote) return { estado: 'erro', mensagem: 'Os planos da Google Play ainda não carregaram. Tente de novo em instantes.' };
    // Já assina outro plano pela Play? Então é TROCA (substituição), nunca uma
    // segunda assinatura paralela — ver `comoComprarNaPlay`. Sem conseguir ler o
    // que está ativo, cai no catch (erro) em vez de arriscar cobrança dupla.
    const info = await Purchases.getCustomerInfo();
    const compra = comoComprarNaPlay(info.activeSubscriptions, oferta);
    if (compra.tipo === 'ja_tem') return traduzirFalhaPlay('6');
    if (compra.tipo === 'troca') {
      await Purchases.purchasePackage(pacote, null, { oldProductIdentifier: compra.oldProductIdentifier });
    } else {
      await Purchases.purchasePackage(pacote);
    }
    return { estado: 'confirmada' };
  } catch (e: unknown) {
    const erro = e as { code?: unknown; userCancelled?: unknown } | null;
    return traduzirFalhaPlay(erro?.code, erro?.userCancelled);
  }
}

/**
 * "Restaurar compras": reenvia ao RevenueCat as assinaturas que a conta Google
 * deste aparelho tem. Se houver uma ativa DESTE usuário, o RevenueCat dispara o
 * webhook e o servidor religa o plano. `temAssinaturaAtiva` é só a leitura do SDK
 * para o texto da tela; o plano continua vindo do servidor.
 */
export async function restaurarComprasPlay(): Promise<ResultadoRestauracaoPlay> {
  if (!playBillingLigado()) return { estado: 'desligado' };
  try {
    const userId = await garantirSdk();
    if (!userId) return { estado: 'sem_login' };
    const info = await Purchases.restorePurchases();
    return { estado: 'ok', temAssinaturaAtiva: Object.keys(info.entitlements.active ?? {}).length > 0 };
  } catch (e: unknown) {
    const erro = e as { code?: unknown; userCancelled?: unknown } | null;
    return traduzirFalhaPlay(erro?.code, erro?.userCancelled);
  }
}

// Contrato: esta versão cumpre a MESMA interface da versão de iOS/web
// (`playBilling.ts`). Se uma das duas mudar sozinha, o `tsc` do app reprova aqui.
({ ESTADO_PLAY_BILLING, playBillingLigado, carregarOfertasPlay, comprarNaPlay, restaurarComprasPlay }) satisfies typeof import('./playBilling');
