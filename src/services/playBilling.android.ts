/**
 * Assinatura pela Google Play — Android, Play Billing DIRETO via `expo-iap`
 * (Play Billing Library 9). Sem RevenueCat, sem serviço de terceiro.
 *
 * ÚNICO arquivo do app que importa o módulo de compra da Play (os gates
 * `scripts/teste-play-billing.ts` e `scripts/teste-roteamento-pagamento.ts`
 * reprovam qualquer outro). As telas só conversam com as funções exportadas.
 *
 * QUEM LIBERA O PLANO É O SERVIDOR. Uma compra concluída na folha da Play NÃO
 * muda o plano no app: o listener de compras manda o token ao worker
 * (`POST /play/verificar`, ver `playBillingWorker.ts`), que confere na Google Play
 * Developer API, grava `public.assinaturas` e reconhece a compra. Só DEPOIS do "ok"
 * do servidor o app chama `finishTransaction`. Se o servidor não confirmar, a
 * compra fica sem reconhecimento e a própria Play estorna em 3 dias — melhor do
 * que cobrar sem entregar.
 *
 * VÍNCULO COM A CONTA: toda compra leva `obfuscatedAccountId` = SHA-256 (hex) do
 * `user.id` do Supabase. O worker exige a igualdade com o dono do JWT; token de
 * outra conta volta 409. Sem login, não há venda.
 *
 * DESLIGADO por padrão (NUNCA MODO DEMO): fora do Android, no Expo Go, sem o
 * módulo nativo no binário ou com o servidor dizendo `ligado: false` em
 * `GET /play/config`, nenhuma função abre a folha de pagamento — a tela diz que a
 * assinatura pelo app está indisponível.
 *
 * COMPRAS QUE FICARAM PELO CAMINHO (app morto entre pagar e verificar, rede caiu,
 * pagamento pendente que compensou depois): `getAvailablePurchases` roda ao abrir
 * o app (sessão inicial / login) e toda vez que ele volta ao primeiro plano, e
 * reenvia ao worker o que ainda não foi reconhecido.
 */
import { AppState, Linking } from 'react-native';
import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  type Purchase,
  type PurchaseAndroid,
} from 'expo-iap';
import { ANDROID_PACKAGE } from '../config';
import { supabase, usuarioDaSessaoLocal } from './supabase';
import { consultarConfigPlay, verificarCompraPlay } from './playBillingWorker';
import {
  ASSINATURA_PLAY_POR_PLANO,
  MENSAGEM_OUTRA_CONTA_PLAY,
  SKUS_PLAY,
  comoComprarNaPlay,
  donoDaCompraPlay,
  estadoPlayBilling,
  ofertasDoCatalogo,
  pacotesDaLoja,
  produtoPlay,
  traduzirFalhaPlay,
  urlGerenciarNaPlay,
  type ConfigPlay,
  type EstadoPlayBilling,
  type OfertaPlay,
  type PacoteLoja,
  type ResultadoVerificacaoPlay,
} from './playBillingRegras';
import type { ResultadoCompraPlay, ResultadoOfertasPlay, ResultadoRestauracaoPlay } from './playBilling';

export type { ResultadoCompraPlay, ResultadoOfertasPlay, ResultadoRestauracaoPlay } from './playBilling';

/** Decidido uma vez: o binário e o Expo Go não mudam em runtime. */
export const ESTADO_PLAY_BILLING: EstadoPlayBilling = estadoPlayBilling({
  plataforma: 'android',
  emExpoGo: (() => {
    try {
      return isRunningInExpoGo();
    } catch {
      // Não deu para saber se é Expo Go → trata como se fosse (desliga).
      return true;
    }
  })(),
  moduloNativo: (() => {
    try {
      return requireOptionalNativeModule('ExpoIap') != null;
    } catch {
      return false;
    }
  })(),
});

export function playBillingLigado(): boolean {
  return ESTADO_PLAY_BILLING === 'ligado';
}

// ─── Kill switch do SERVIDOR (`GET /play/config`) ─────────────────────────────

let configServidor: ConfigPlay | null = null;

async function lerConfigServidor(): Promise<ConfigPlay> {
  const valor = await consultarConfigPlay();
  configServidor = valor;
  return valor;
}

export async function consultarVendaPlay(): Promise<ConfigPlay> {
  if (!playBillingLigado()) return 'desligada';
  return lerConfigServidor();
}

/**
 * Leitura SÍNCRONA e conservadora para peças que só decidem se mostram um atalho
 * para Planos (RecursoPlano): true só se a última consulta ao servidor disse
 * `ligado: true`. Antes da primeira consulta, ou depois de um erro, é false.
 */
export function vendaPlayConfirmada(): boolean {
  return playBillingLigado() && configServidor === 'ligada';
}

const MENSAGEM_CONFIG_INCERTA =
  'Não deu para confirmar a assinatura pela Google Play agora. Verifique sua internet e tente novamente.';

const MENSAGEM_SESSAO_INCERTA =
  'Não deu para confirmar sua conta OLLI agora. Verifique sua internet e tente novamente em instantes.';

const MENSAGEM_SUSPENSA =
  'Sua assinatura da Google Play está suspensa por falha no pagamento. Resolva em “Gerenciar na Google Play”; o plano volta assim que a Play confirmar.';

// ─── Conta OLLI → id ofuscado da Play ────────────────────────────────────────

let hashCache: { userId: string; hash: string } | null = null;

type Conta = { userId: string; hash: string };

/**
 * Usuário logado e o `obfuscatedAccountId` dele (SHA-256 hex do id). 3 estados:
 *  - a conta;
 *  - 'sem_login' — não há sessão GUARDADA no aparelho (deslogado de verdade);
 *  - 'incerto'   — há sessão guardada, mas sem token válido AGORA (renovação em
 *    espera depois de um 429/5xx, relógio errado): "não sei", nunca "sem login"
 *    (ver services/refreshResiliente.ts, "LIMITE CONHECIDO").
 */
async function contaAtual(): Promise<Conta | 'sem_login' | 'incerto'> {
  if (!supabase) return 'sem_login';
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return (await usuarioDaSessaoLocal().catch(() => null)) ? 'incerto' : 'sem_login';
  if (hashCache?.userId !== userId) {
    const hash = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId)).toLowerCase();
    hashCache = { userId, hash };
  }
  return hashCache;
}

// ─── Conexão com a Play e os listeners (uma vez por processo) ────────────────

let conexao: Promise<void> | null = null;

/** Conecta ao BillingClient e liga os listeners. Lança com `code` do expo-iap. */
function conectar(): Promise<void> {
  if (!conexao) {
    conexao = (async () => {
      const ok = await initConnection();
      if (ok === false) throw Object.assign(new Error('initConnection=false'), { code: 'billing-unavailable' });
      registrarOuvintes();
    })().catch((e: unknown) => {
      conexao = null; // a próxima tentativa reconecta
      throw e;
    });
  }
  return conexao;
}

/** A compra aberta pela tela, esperando o desfecho que chega pelos listeners. */
let pendente: {
  sku: string;
  planoBasico: string;
  resolver: (r: ResultadoCompraPlay) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

function resolverPendente(r: ResultadoCompraPlay, sku?: string): void {
  const p = pendente;
  if (!p || (sku !== undefined && p.sku !== sku)) return;
  pendente = null;
  clearTimeout(p.timer);
  p.resolver(r);
}

let ouvintesLigados = false;

function registrarOuvintes(): void {
  if (ouvintesLigados) return;
  ouvintesLigados = true;
  purchaseUpdatedListener((compra: Purchase) => {
    void tratarCompraRecebida(compra as PurchaseAndroid);
  });
  purchaseErrorListener((erro) => {
    // Erro de OUTRO produto (ex.: compra em segundo plano de outra assinatura)
    // não encerra a compra aberta pela tela. Sem produto no erro, vale para ela.
    const sku = typeof erro?.productId === 'string' && erro.productId ? erro.productId : undefined;
    resolverPendente(traduzirFalhaPlay(erro?.code), sku);
  });
}

const doCatalogo = (c: PurchaseAndroid | null | undefined): c is PurchaseAndroid =>
  !!c && typeof c.productId === 'string' && SKUS_PLAY.includes(c.productId);

/** Uma verificação por token por vez (listener e sincronização podem coincidir). */
const verificando = new Map<string, Promise<ResultadoVerificacaoPlay>>();

/**
 * Manda a compra ao worker e, só com o "ok" dele, finaliza na Play. Nada aqui
 * libera plano: o plano é o que o servidor gravou.
 */
async function verificarEFinalizar(compra: PurchaseAndroid, planoBasico: string | null): Promise<ResultadoVerificacaoPlay> {
  const token = typeof compra.purchaseToken === 'string' ? compra.purchaseToken : '';
  if (!token) return { estado: 'recusada', erro: 'sem_token' };
  const emCurso = verificando.get(token);
  if (emCurso) return emCurso;
  const tarefa = (async () => {
    const base = typeof compra.currentPlanId === 'string' && compra.currentPlanId ? compra.currentPlanId : planoBasico;
    const r = await verificarCompraPlay({ purchaseToken: token, productId: compra.productId, basePlanId: base ?? null });
    if (r.estado === 'ok' && compra.isAcknowledgedAndroid !== true) {
      // O worker já reconheceu pela API; isto fecha a transação no aparelho. Falhar
      // aqui não desfaz nada: a próxima sincronização tenta de novo.
      await finishTransaction({ purchase: compra, isConsumable: false }).catch(() => {});
    }
    return r;
  })().finally(() => {
    verificando.delete(token);
  });
  verificando.set(token, tarefa);
  return tarefa;
}

const MENSAGEM_SEM_LIBERACAO =
  'A Google Play não informou uma assinatura ativa para esta compra, então o plano não foi liberado. Confira a assinatura em “Gerenciar na Google Play”.';

const MENSAGEM_RECUSADA_RESTAURAR =
  'Encontramos uma assinatura na Google Play, mas ela não pôde ser ligada a esta conta OLLI. Se a compra foi feita com outra conta OLLI, entre com ela.';

function resultadoDaVerificacao(r: ResultadoVerificacaoPlay): ResultadoCompraPlay {
  switch (r.estado) {
    case 'ok':
      return { estado: 'confirmada' };
    case 'sem_liberacao':
      // O servidor conferiu e a Play diz que não há acesso agora: nada de
      // "estamos confirmando" (que mandaria esperar algo que não vem).
      return r.situacao === 'pendente' ? { estado: 'pendente' } : { estado: 'erro', mensagem: MENSAGEM_SEM_LIBERACAO };
    case 'outra_conta':
      return { estado: 'outra_conta', mensagem: MENSAGEM_OUTRA_CONTA_PLAY };
    case 'sem_login':
      return { estado: 'sem_login' };
    case 'recusada':
      return {
        estado: 'erro',
        mensagem: 'Não conseguimos confirmar esta compra para a sua conta OLLI. Se houve cobrança, a Google Play devolve o valor automaticamente em até 3 dias.',
      };
    case 'erro':
      return {
        estado: 'erro',
        mensagem: 'A Google Play recebeu o pagamento e ainda estamos confirmando. Não pague de novo: o plano é liberado assim que a confirmação chegar. Se demorar, toque em “Restaurar compras da Google Play”.',
      };
  }
}

/** Toda compra que a Play entrega pelo listener (da tela ou não) passa por aqui. */
async function tratarCompraRecebida(compra: PurchaseAndroid): Promise<void> {
  if (!doCatalogo(compra)) return; // não é do OLLI: não mexe
  try {
    const sku = compra.productId;
    if (compra.purchaseState === 'pending') {
      // Pagamento ainda não compensou: NÃO verifica nem finaliza. Quando a Play
      // confirmar, a compra volta por aqui (ou pela sincronização) como 'purchased'.
      resolverPendente({ estado: 'pendente' }, sku);
      return;
    }
    if (compra.purchaseState !== 'purchased') return;
    if (compra.isSuspendedAndroid === true) {
      resolverPendente({ estado: 'erro', mensagem: MENSAGEM_SUSPENSA }, sku);
      return;
    }
    const conta = await contaAtual();
    if (conta === 'sem_login') {
      resolverPendente({ estado: 'sem_login' }, sku);
      return;
    }
    if (conta === 'incerto') {
      // Pago na Play e a sessão momentaneamente sem token: "estamos confirmando,
      // não pague de novo". A sincronização reenvia quando a sessão voltar.
      resolverPendente(resultadoDaVerificacao({ estado: 'erro' }), sku);
      return;
    }
    if (donoDaCompraPlay(compra.obfuscatedAccountIdAndroid, conta.hash) === 'outra') {
      resolverPendente({ estado: 'outra_conta', mensagem: MENSAGEM_OUTRA_CONTA_PLAY }, sku);
      return;
    }
    const planoBasico = pendente?.sku === sku ? pendente.planoBasico : null;
    const r = await verificarEFinalizar(compra, planoBasico);
    resolverPendente(resultadoDaVerificacao(r), sku);
  } catch {
    resolverPendente(resultadoDaVerificacao({ estado: 'erro' }), compra.productId);
  }
}

/** Assinaturas que a Play diz que esta conta Google tem (inclui as suspensas). */
async function comprasNaPlay(): Promise<PurchaseAndroid[]> {
  const lista = (await getAvailablePurchases({ includeSuspendedAndroid: true })) as PurchaseAndroid[];
  return (lista ?? []).filter(doCatalogo);
}

// ─── Ofertas ──────────────────────────────────────────────────────────────────

/** Planos básicos carregados, guardados para comprar com o token que a loja exige. */
let pacotesPorProduto = new Map<string, PacoteLoja>();

/**
 * Lê as assinaturas na Play, com o PREÇO QUE A LOJA DEVOLVE. Estados de verdade:
 * 'ok' (com a lista), 'erro' (não deu para saber), 'sem_login', 'indisponivel'
 * (servidor desligou a venda) e 'desligado' (binário sem venda). "Não carregou"
 * nunca vira "não há planos".
 */
export async function carregarOfertasPlay(): Promise<ResultadoOfertasPlay> {
  if (!playBillingLigado()) return { estado: 'desligado' };
  try {
    const cfg = await lerConfigServidor();
    if (cfg === 'desligada') return { estado: 'indisponivel' };
    if (cfg === 'erro') return { estado: 'erro' };
    const conta = await contaAtual();
    if (conta === 'sem_login') return { estado: 'sem_login' };
    if (conta === 'incerto') return { estado: 'erro', mensagem: MENSAGEM_SESSAO_INCERTA };
    await conectar();
    const produtos = await fetchProducts({ skus: [...SKUS_PLAY], type: 'subs' });
    const pacotes = pacotesDaLoja(Array.isArray(produtos) ? (produtos as unknown[]) : []);
    pacotesPorProduto = new Map(pacotes.map((p) => [p.produtoId, p]));
    return { estado: 'ok', ofertas: ofertasDoCatalogo(pacotes) };
  } catch (e: unknown) {
    const falha = traduzirFalhaPlay((e as { code?: unknown } | null)?.code);
    return { estado: 'erro', mensagem: falha.estado === 'erro' ? falha.mensagem : undefined };
  }
}

// ─── Compra ───────────────────────────────────────────────────────────────────

/** Folha da Play aberta há tempo demais sem desfecho: devolve a tela ao usuário. */
const ESPERA_MAXIMA_MS = 15 * 60 * 1000;

/**
 * Abre a folha de pagamento da Google Play para a oferta escolhida e espera o
 * desfecho: 'confirmada' só quando o SERVIDOR conferiu a compra e gravou o plano.
 */
export async function comprarNaPlay(oferta: OfertaPlay): Promise<ResultadoCompraPlay> {
  if (!playBillingLigado()) return { estado: 'desligado' };
  if (pendente) return { estado: 'erro', mensagem: 'Já existe uma assinatura em andamento na Google Play. Conclua ou feche a janela da Play antes de tentar de novo.' };
  try {
    // Relê o kill switch NA HORA da compra: a tela pode ter carregado antes de o
    // servidor desligar a venda.
    const cfg = await lerConfigServidor();
    if (cfg === 'desligada') return { estado: 'indisponivel' };
    if (cfg === 'erro') return { estado: 'erro', mensagem: MENSAGEM_CONFIG_INCERTA };
    const conta = await contaAtual();
    if (conta === 'sem_login') return { estado: 'sem_login' };
    if (conta === 'incerto') return { estado: 'erro', mensagem: MENSAGEM_SESSAO_INCERTA };
    await conectar();

    const pacote = pacotesPorProduto.get(oferta.produtoId);
    const prod = produtoPlay(oferta.produtoId);
    // Sem o plano básico carregado da loja não há o que comprar — nunca montar
    // produto à mão: o preço e o token têm de ser os que a loja devolveu.
    if (!pacote?.offerToken || !prod || !prod.periodoConhecido) {
      return { estado: 'erro', mensagem: 'Os planos da Google Play ainda não carregaram. Tente de novo em instantes.' };
    }
    const sku = ASSINATURA_PLAY_POR_PLANO[prod.plano];

    // Já assina pela Play nesta conta Google? Então é TROCA (substituição), nunca
    // uma segunda assinatura paralela. Sem conseguir ler, cai no catch (erro) em
    // vez de arriscar cobrança dupla.
    // Compra PENDENTE (pagamento não compensou) não é assinatura ativa: não vira
    // "já tem" nem base de troca.
    const ativas = (await comprasNaPlay()).filter((c) => c.purchaseState === 'purchased');
    if (ativas.some((c) => donoDaCompraPlay(c.obfuscatedAccountIdAndroid, conta.hash) === 'outra')) {
      return { estado: 'outra_conta', mensagem: MENSAGEM_OUTRA_CONTA_PLAY };
    }
    if (ativas.some((c) => c.isSuspendedAndroid === true)) return { estado: 'erro', mensagem: MENSAGEM_SUSPENSA };
    const compra = comoComprarNaPlay(
      ativas.map((c) => ({ sku: c.productId, planoBasico: c.currentPlanId ?? null, purchaseToken: c.purchaseToken ?? null })),
      oferta,
    );
    if (compra.tipo === 'ja_tem') return traduzirFalhaPlay('already-owned');
    if (compra.tipo === 'indeterminado') {
      return { estado: 'erro', mensagem: 'Não conseguimos ler sua assinatura atual na Google Play. Toque em “Restaurar compras da Google Play” e tente de novo.' };
    }

    const desfecho = new Promise<ResultadoCompraPlay>((resolver) => {
      pendente = {
        sku,
        planoBasico: prod.periodo,
        resolver,
        timer: setTimeout(() => {
          resolverPendente({
            estado: 'erro',
            mensagem: 'A Google Play não respondeu a tempo. Se a cobrança foi confirmada, o plano é liberado sozinho; se não, tente novamente.',
          });
        }, ESPERA_MAXIMA_MS),
      };
    });

    try {
      await requestPurchase({
        type: 'subs',
        request: {
          google: {
            skus: [sku],
            subscriptionOffers: [{ sku, offerToken: pacote.offerToken }],
            obfuscatedAccountId: conta.hash,
            ...(compra.tipo === 'troca'
              ? {
                  purchaseToken: compra.purchaseToken,
                  subscriptionProductReplacementParams: {
                    oldProductId: compra.oldProductId,
                    replacementMode: compra.replacementMode,
                  },
                }
              : {}),
          },
        },
      });
    } catch (e: unknown) {
      // Recusa síncrona da Play (folha nem abriu): o desfecho é este erro.
      resolverPendente(traduzirFalhaPlay((e as { code?: unknown } | null)?.code));
    }
    return await desfecho;
  } catch (e: unknown) {
    return traduzirFalhaPlay((e as { code?: unknown } | null)?.code);
  }
}

// ─── Restaurar ────────────────────────────────────────────────────────────────

/**
 * "Restaurar compras": manda ao worker as assinaturas do OLLI que a conta Google
 * deste aparelho tem. O servidor confere cada uma e religa o plano; token de outra
 * conta OLLI volta 409 ('outra_conta'). `temAssinaturaAtiva` = o servidor
 * confirmou ao menos uma.
 *
 * VENDA DESLIGADA NO SERVIDOR NÃO IMPEDE RESTAURAR: o kill switch é só da vitrine
 * (o `/play/verificar` do worker atende com a venda desligada). Quem pagou e não
 * teve a compra registrada (app morto, 503 no meio) precisa conseguir registrar —
 * sem reconhecimento a Play estorna em 3 dias e o cliente fica sem o plano. Só
 * quando não havia nada a restaurar a resposta é 'indisponivel'.
 */
export async function restaurarComprasPlay(): Promise<ResultadoRestauracaoPlay> {
  if (!playBillingLigado()) return { estado: 'desligado' };
  try {
    const cfg = await lerConfigServidor();
    if (cfg === 'erro') return { estado: 'erro', mensagem: MENSAGEM_CONFIG_INCERTA };
    const conta = await contaAtual();
    if (conta === 'sem_login') return { estado: 'sem_login' };
    if (conta === 'incerto') return { estado: 'erro', mensagem: MENSAGEM_SESSAO_INCERTA };
    await conectar();
    const compras = (await comprasNaPlay()).filter((c) => c.purchaseState === 'purchased');
    let ativa = false;
    let suspensa = false;
    let deOutraConta = false;
    let semLogin = false;
    let incerto = false;
    let recusada = false;
    for (const c of compras) {
      if (c.isSuspendedAndroid === true) { suspensa = true; continue; }
      if (donoDaCompraPlay(c.obfuscatedAccountIdAndroid, conta.hash) === 'outra') { deOutraConta = true; continue; }
      const r = await verificarEFinalizar(c, null);
      if (r.estado === 'ok') ativa = true;
      else if (r.estado === 'outra_conta') deOutraConta = true;
      else if (r.estado === 'sem_login') semLogin = true;
      else if (r.estado === 'erro') incerto = true;
      // O servidor olhou e NÃO liga a compra a esta conta: isso não é "não há
      // nada" — é uma assinatura que existe e não pôde ser ligada.
      else if (r.estado === 'recusada') recusada = true;
      // 'sem_liberacao' (encerrada/sem efeito) = de fato não há assinatura ativa.
    }
    if (ativa) return { estado: 'ok', temAssinaturaAtiva: true };
    if (semLogin) return { estado: 'sem_login' };
    if (incerto) return { estado: 'erro', mensagem: MENSAGEM_CONFIG_INCERTA };
    if (deOutraConta) return { estado: 'outra_conta', mensagem: MENSAGEM_OUTRA_CONTA_PLAY };
    if (recusada) return { estado: 'erro', mensagem: MENSAGEM_RECUSADA_RESTAURAR };
    if (suspensa) return { estado: 'erro', mensagem: MENSAGEM_SUSPENSA };
    if (cfg === 'desligada' && compras.length === 0) return { estado: 'indisponivel' };
    return { estado: 'ok', temAssinaturaAtiva: false };
  } catch (e: unknown) {
    return traduzirFalhaPlay((e as { code?: unknown } | null)?.code);
  }
}

// ─── Gerenciar ────────────────────────────────────────────────────────────────

/**
 * Abre a central de assinaturas da Play Store (cancelar, trocar a forma de
 * pagamento) — exigência da política de assinaturas. Com o produto, abre na
 * assinatura certa pelo deep link da própria Play; sem ele, a lista do app.
 */
export async function gerenciarAssinaturaNaPlay(produtoId?: string | null): Promise<boolean> {
  const prod = produtoPlay(produtoId);
  if (playBillingLigado() && prod && ANDROID_PACKAGE) {
    try {
      await deepLinkToSubscriptions({ skuAndroid: ASSINATURA_PLAY_POR_PLANO[prod.plano], packageNameAndroid: ANDROID_PACKAGE });
      return true;
    } catch {
      // cai no link da Play Store abaixo
    }
  }
  try {
    await Linking.openURL(urlGerenciarNaPlay(ANDROID_PACKAGE, produtoId));
    return true;
  } catch {
    return false;
  }
}

// ─── Sincronização ao abrir e ao voltar ao app ───────────────────────────────

const INTERVALO_SYNC_MS = 60 * 1000;
let ultimaSync = 0;
let syncEmCurso = false;

/**
 * Reenvia ao worker as compras do OLLI que a Play entregou e ainda não foram
 * reconhecidas (app morto no meio, rede, pendente que compensou). Silenciosa:
 * nada de alerta — a tela relê o plano do servidor quando abrir.
 *
 * Roda também com a venda DESLIGADA no servidor (`PLAY_BILLING_MODE=off`): o kill
 * switch é só da vitrine e o worker registra compra já paga mesmo assim. Sem isto,
 * uma compra paga antes de o dono desligar a venda ficaria sem reconhecimento e a
 * Play estornaria. Só para em 'erro' ("não sei"); sem credencial no worker, o
 * `/play/verificar` responde 503 e nada muda.
 */
async function sincronizarComprasPlay(): Promise<void> {
  if (!playBillingLigado() || syncEmCurso || Date.now() - ultimaSync < INTERVALO_SYNC_MS) return;
  syncEmCurso = true;
  try {
    const conta = await contaAtual();
    if (conta === 'sem_login' || conta === 'incerto') return; // incerto: tenta na próxima volta
    ultimaSync = Date.now();
    if ((await lerConfigServidor()) === 'erro') return;
    await conectar();
    const compras = await comprasNaPlay();
    for (const c of compras) {
      if (c.purchaseState !== 'purchased' || c.isSuspendedAndroid === true || c.isAcknowledgedAndroid === true) continue;
      if (donoDaCompraPlay(c.obfuscatedAccountIdAndroid, conta.hash) === 'outra') continue;
      await verificarEFinalizar(c, null);
    }
  } catch {
    // Loja indisponível ou rede: tenta de novo na próxima volta ao app.
  } finally {
    syncEmCurso = false;
  }
}

if (playBillingLigado()) {
  try {
    AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizarComprasPlay();
    });
    supabase?.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        hashCache = null;
        return;
      }
      if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') {
        // Fora do callback: o supabase-js não deve ser chamado de dentro dele.
        setTimeout(() => { void sincronizarComprasPlay(); }, 0);
      }
    });
  } catch {
    // Sem listeners a compra ainda funciona pela tela; só a recuperação automática fica para o "Restaurar".
  }
}

// Contrato: esta versão cumpre a MESMA interface da versão de iOS/web
// (`playBilling.ts`). Se uma das duas mudar sozinha, o `tsc` do app reprova aqui.
({
  ESTADO_PLAY_BILLING,
  playBillingLigado,
  consultarVendaPlay,
  vendaPlayConfirmada,
  carregarOfertasPlay,
  comprarNaPlay,
  restaurarComprasPlay,
  gerenciarAssinaturaNaPlay,
}) satisfies typeof import('./playBilling');
