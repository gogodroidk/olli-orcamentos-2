/**
 * Teste da ASSINATURA PELA GOOGLE PLAY (Play Billing direto, `expo-iap`) — lado
 * do APP (regras + guardas das telas).
 *
 *     node scripts/teste-play-billing.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * O lado do servidor (`/play/verificar`, RTDN) tem teste próprio no worker.
 * Aqui fica trancado o que o APP promete:
 *  1. DESLIGADO = NADA SE VENDE. Fora do Android, no Expo Go, sem o módulo
 *     nativo ou com o servidor dizendo `ligado: false`, a folha da Play não abre e
 *     a tela diz que a assinatura pelo app está indisponível. NUNCA MODO DEMO.
 *  2. PREÇO DA LOJA: o card mostra o preço que a Play devolveu; no Android nunca
 *     aparece o preço da web. Oferta com teste/preço de entrada não vira botão.
 *  3. QUEM LIBERA É O SERVIDOR: `finishTransaction` só depois do "ok" de
 *     `/play/verificar`; erro nunca vira "não pago" nem "liberado".
 *  4. A compra leva `obfuscatedAccountId` = SHA-256 hex do user.id; troca de plano
 *     é SUBSTITUIÇÃO (nunca 2ª assinatura).
 *  5. `expo-iap` só em `playBilling.android.ts`; segredos da Play nunca no cliente.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MODO_TROCA_PLAY,
  SKUS_PLAY,
  comoComprarNaPlay,
  donoDaCompraPlay,
  estadoPlayBilling,
  hashContaValido,
  idProdutoPlay,
  interpretarConfigPlay,
  interpretarVerificacaoPlay,
  corpoVerificacaoPlay,
  liberacaoPlayConfirmada,
  ofertaPara,
  ofertasDoCatalogo,
  pacotesDaLoja,
  produtoPlay,
  traduzirFalhaPlay,
  urlGerenciarNaPlay,
} from '../src/services/playBillingRegras.ts';
import * as stubPlay from '../src/services/playBilling.ts';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${b}\n        recebido: ${a}`);
  }
}

function ler(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

const RAIZ = fileURLToPath(new URL('..', import.meta.url));

function arquivosDe(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, pasta))) {
    const rel = `${pasta}/${nome}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) saida.push(...arquivosDe(rel));
    else if (/\.(ts|tsx|js|jsx)$/.test(nome)) saida.push(rel);
  }
  return saida;
}

console.log('\n1) Quando o BINÁRIO sabe vender (e quando NÃO)');
checar('Android + build nativo + módulo → ligado', estadoPlayBilling({ plataforma: 'android', emExpoGo: false, moduloNativo: true }), 'ligado');
checar('Expo Go → desligado', estadoPlayBilling({ plataforma: 'android', emExpoGo: true, moduloNativo: true }), 'desligado_expo_go');
checar('sem o módulo nativo no binário → desligado', estadoPlayBilling({ plataforma: 'android', emExpoGo: false, moduloNativo: false }), 'desligado_sem_modulo');
checar('iOS → desligado (sem StoreKit)', estadoPlayBilling({ plataforma: 'ios', emExpoGo: false, moduloNativo: true }), 'desligado_plataforma');
checar('web → desligado (vende pelo checkout dela)', estadoPlayBilling({ plataforma: 'web', emExpoGo: false, moduloNativo: true }), 'desligado_plataforma');

console.log('\n1b) Kill switch do SERVIDOR (GET /play/config) — 3 estados');
checar('200 {ligado:true} → ligada', interpretarConfigPlay(200, { ligado: true }), 'ligada');
checar('200 {ligado:false} → desligada', interpretarConfigPlay(200, { ligado: false }), 'desligada');
checar('rede caiu → erro (não "desligada", não "ligada")', interpretarConfigPlay(null, null), 'erro');
checar('503 → erro', interpretarConfigPlay(503, { ligado: true }), 'erro');
checar('corpo sem ligado → erro', interpretarConfigPlay(200, { ok: true }), 'erro');
checar('ligado "true" (string) → erro, nunca liga', interpretarConfigPlay(200, { ligado: 'true' }), 'erro');

console.log('\n2) Versão iOS/web do serviço: nunca vende');
checar('ESTADO_PLAY_BILLING = desligado_plataforma', stubPlay.ESTADO_PLAY_BILLING, 'desligado_plataforma');
checar('playBillingLigado() = false', stubPlay.playBillingLigado(), false);
checar('vendaPlayConfirmada() = false', stubPlay.vendaPlayConfirmada(), false);
checar('consultarVendaPlay → desligada', await stubPlay.consultarVendaPlay(), 'desligada');
checar('carregarOfertasPlay → desligado', await stubPlay.carregarOfertasPlay(), { estado: 'desligado' });
checar('comprarNaPlay → desligado', await stubPlay.comprarNaPlay({ plano: 'pro', periodo: 'mensal', produtoId: 'olli_pro:mensal', precoTexto: 'R$ 1' }), { estado: 'desligado' });
checar('restaurarComprasPlay → desligado', await stubPlay.restaurarComprasPlay(), { estado: 'desligado' });
checar('gerenciarAssinaturaNaPlay → false (quem chama decide)', await stubPlay.gerenciarAssinaturaNaPlay('olli_pro:mensal'), false);

console.log('\n3) Catálogo único de produtos (app e worker)');
checar('SKUs pedidos à loja', SKUS_PLAY, ['olli_pro', 'olli_empresa']);
checar('pro mensal', idProdutoPlay('pro', 'mensal'), 'olli_pro:mensal');
checar('empresa anual', idProdutoPlay('empresa', 'anual'), 'olli_empresa:anual');
checar('olli_empresa:anual → empresa/anual', produtoPlay('olli_empresa:anual'), { plano: 'empresa', periodo: 'anual', periodoConhecido: true });
checar('só a assinatura → nível conhecido, período não', produtoPlay('olli_pro')?.periodoConhecido, false);
checar('produto de outro app → null', produtoPlay('com.outro:mensal'), null);
checar('plano básico inventado → null', produtoPlay('olli_pro:vitalicio'), null);
checar('lixo → null', [produtoPlay(''), produtoPlay(null), produtoPlay('a:b:c')], [null, null, null]);
{
  // O worker (worker/src/play.js) tem de ler o MESMO catálogo do app.
  const play = ler('../worker/src/play.js');
  checar('o worker importa o MESMO produtoPlay do app', /import \{[^}]*\bprodutoPlay\b[^}]*\} from '\.\.\/\.\.\/src\/services\/playBillingRegras\.ts';/.test(play), true);
}

console.log('\n4) Ofertas: preço vem da LOJA; só a oferta-base do plano básico');
{
  const fase = (preco: string) => ({ billingCycleCount: 0, billingPeriod: 'P1M', formattedPrice: preco, priceAmountMicros: '1', priceCurrencyCode: 'BRL', recurrenceMode: 1 });
  const produtos = [
    {
      id: 'olli_pro',
      subscriptionOffers: [
        { basePlanIdAndroid: 'mensal', offerTokenAndroid: 'tok-pro-m', displayPrice: 'R$ 39,00', pricingPhasesAndroid: { pricingPhaseList: [fase('R$ 39,00')] } },
        { basePlanIdAndroid: 'anual', offerTokenAndroid: 'tok-pro-a', displayPrice: 'R$ 374,40', pricingPhasesAndroid: { pricingPhaseList: [fase('R$ 374,40')] } },
        // oferta com teste grátis (2 fases) no mesmo plano básico → fora
        { basePlanIdAndroid: 'mensal', offerTokenAndroid: 'tok-trial', displayPrice: 'R$ 0,00', pricingPhasesAndroid: { pricingPhaseList: [fase('Grátis'), fase('R$ 39,00')] } },
      ],
    },
    {
      id: 'olli_empresa',
      subscriptionOffers: [
        // sem fases conhecidas, mas única do plano básico → aceita com o displayPrice
        { basePlanIdAndroid: 'mensal', offerTokenAndroid: 'tok-emp-m', displayPrice: 'R$ 99,00' },
        // sem token → fora (não dá para comprar)
        { basePlanIdAndroid: 'anual', displayPrice: 'R$ 950,40' },
      ],
    },
    { id: 'olli_vip', subscriptionOffers: [{ basePlanIdAndroid: 'mensal', offerTokenAndroid: 'x', displayPrice: 'R$ 1' }] },
    null,
  ];
  const pacotes = pacotesDaLoja(produtos);
  checar('pacotes: só catálogo, só oferta-base, com token', pacotes.map((p) => [p.produtoId, p.precoTexto, p.offerToken]), [
    ['olli_pro:mensal', 'R$ 39,00', 'tok-pro-m'],
    ['olli_pro:anual', 'R$ 374,40', 'tok-pro-a'],
    ['olli_empresa:mensal', 'R$ 99,00', 'tok-emp-m'],
  ]);
  checar('lista ausente → nenhum pacote', pacotesDaLoja(undefined), []);
  const ofertas = ofertasDoCatalogo([
    ...pacotes,
    { produtoId: 'olli_empresa:anual', precoTexto: '' }, // loja sem preço → fora
    { produtoId: 'olli_pro', precoTexto: 'R$ 1,00' }, // sem período → fora
    { produtoId: 'olli_pro:mensal', precoTexto: 'R$ 0,01' }, // duplicata → fica a 1ª
  ]);
  checar('ofertas do catálogo com preço da loja', ofertas.map((o) => `${o.produtoId}=${o.precoTexto}`), ['olli_pro:mensal=R$ 39,00', 'olli_pro:anual=R$ 374,40', 'olli_empresa:mensal=R$ 99,00']);
  checar('empresa anual sem oferta → null (card diz "ainda não está à venda")', ofertaPara(ofertas, 'empresa', 'anual'), null);
}

console.log('\n5) Erros do expo-iap (ErrorCode string) → mensagens honestas');
checar('cancelou a folha da Play → cancelado (silêncio)', traduzirFalhaPlay('user-cancelled'), { estado: 'cancelado' });
checar('pagamento pendente → pendente (não libera nada)', traduzirFalhaPlay('pending'), { estado: 'pendente' });
checar('pagamento diferido → pendente', traduzirFalhaPlay('deferred-payment'), { estado: 'pendente' });
checar('já tem → orienta restaurar', (traduzirFalhaPlay('already-owned') as { mensagem: string }).mensagem.includes('Restaurar'), true);
checar('rede → mensagem de conexão', (traduzirFalhaPlay('network-error') as { mensagem: string }).mensagem.includes('internet'), true);
checar('BILLING_UNAVAILABLE (PBL 9) → loja indisponível, nunca "sem plano"', (traduzirFalhaPlay('billing-unavailable') as { mensagem: string }).mensagem.includes('Play Store'), true);
checar('produto sumiu da loja → plano indisponível', (traduzirFalhaPlay('sku-not-found') as { mensagem: string }).mensagem.includes('não está disponível'), true);
checar('desconhecido → erro genérico sem prometer que nada foi cobrado', (traduzirFalhaPlay('???') as { mensagem: string }).mensagem.includes('Se a Google Play chegar a confirmar'), true);
checar('código numérico antigo (RevenueCat) não vira cancelado', traduzirFalhaPlay('1').estado, 'erro');

console.log('\n6) Resposta de /play/verificar → estados (erro nunca vira "não pago")');
checar('200 ok → ok com plano e vigência', interpretarVerificacaoPlay(200, { ok: true, plano: 'empresa', vigenteAte: '2026-11-02T00:00:00Z' }), { estado: 'ok', plano: 'empresa', vigenteAte: '2026-11-02T00:00:00Z' });
checar('200 sem plano válido → erro (não sei)', interpretarVerificacaoPlay(200, { ok: true, plano: 'vip' }), { estado: 'erro' });
checar('409 → token de outra conta', interpretarVerificacaoPlay(409, { erro: 'token_de_outra_conta' }), { estado: 'outra_conta' });
checar('401 → sem login', interpretarVerificacaoPlay(401, { erro: 'nao_autorizado' }), { estado: 'sem_login' });
checar('400/403 → recusada (não repete, não finaliza)', interpretarVerificacaoPlay(403, { erro: 'produto_desconhecido' }), { estado: 'recusada', erro: 'produto_desconhecido' });
checar('429 → erro (tenta depois)', interpretarVerificacaoPlay(429, {}), { estado: 'erro' });
checar('503 → erro', interpretarVerificacaoPlay(503, { erro: 'desligado' }), { estado: 'erro' });
checar('rede → erro', interpretarVerificacaoPlay(null, null), { estado: 'erro' });
// 200 SEM plano: o servidor conferiu, mas a Play não sustenta acesso agora — nem
// "ok" nem "estamos confirmando" (que mandaria esperar algo que não vem).
checar('200 pendente sem plano → sem_liberacao/pendente', interpretarVerificacaoPlay(200, { ok: true, estado: 'pendente', plano: null, vigenteAte: null }), { estado: 'sem_liberacao', situacao: 'pendente' });
checar('200 encerrado sem plano → sem_liberacao/encerrado', interpretarVerificacaoPlay(200, { ok: true, estado: 'encerrado', plano: null, vigenteAte: null }), { estado: 'sem_liberacao', situacao: 'encerrado' });
checar('200 sem_efeito → sem_liberacao/sem_efeito', interpretarVerificacaoPlay(200, { ok: true, estado: 'sem_efeito', plano: null }), { estado: 'sem_liberacao', situacao: 'sem_efeito' });
checar('200 com estado estranho e plano → erro (não sei)', interpretarVerificacaoPlay(200, { ok: true, estado: 'pendente', plano: 'pro' }), { estado: 'erro' });
// Pedido: o formato ÚNICO (o worker o roda contra o handler real em teste-play-verificacao.js).
checar('pedido = { purchaseToken, productId, basePlanId }', corpoVerificacaoPlay({ purchaseToken: 'tok', productId: 'olli_pro', basePlanId: 'anual' }), { purchaseToken: 'tok', productId: 'olli_pro', basePlanId: 'anual' });
checar('pedido sem plano básico → basePlanId: null', corpoVerificacaoPlay({ purchaseToken: 'tok', productId: ' olli_pro ', basePlanId: '  ' }), { purchaseToken: 'tok', productId: 'olli_pro', basePlanId: null });

console.log('\n7) Conta da compra: SHA-256 hex do user.id');
{
  const userId = '3f2c8a1e-9b7d-4c3a-8e21-5d6f7a8b9c0d';
  const hash = createHash('sha256').update(userId).digest('hex');
  checar('64 caracteres hex (limite da Play, sem PII)', [hash.length, hashContaValido(hash)], [64, true]);
  checar('UUID cru não é hash válido', hashContaValido(userId), false);
  checar('compra com o meu hash → minha', donoDaCompraPlay(hash, hash), 'minha');
  checar('compra com hash em maiúsculas → minha', donoDaCompraPlay(hash.toUpperCase(), hash), 'minha');
  checar('compra de outra conta OLLI → outra', donoDaCompraPlay('a'.repeat(64), hash), 'outra');
  checar('compra sem id (reassinatura na Play Store) → desconhecida (o servidor decide)', donoDaCompraPlay(null, hash), 'desconhecida');
}

console.log('\n8) Troca de plano = SUBSTITUIÇÃO na Play (nunca 2ª assinatura)');
{
  const empresaMensal = { produtoId: 'olli_empresa:mensal' };
  checar('nada ativo → compra nova', comoComprarNaPlay([], empresaMensal), { tipo: 'nova' });
  checar('lista ausente → compra nova', comoComprarNaPlay(undefined, empresaMensal), { tipo: 'nova' });
  checar('só assinatura de outro app → compra nova', comoComprarNaPlay([{ sku: 'outro_app', purchaseToken: 't' }], empresaMensal), { tipo: 'nova' });
  checar('Pro ativo e compra Empresa → TROCA a partir do Pro, com o token',
    comoComprarNaPlay([{ sku: 'olli_pro', planoBasico: 'mensal', purchaseToken: 'tok-pro' }], empresaMensal),
    { tipo: 'troca', oldProductId: 'olli_pro', purchaseToken: 'tok-pro', replacementMode: MODO_TROCA_PLAY });
  checar('Pro mensal → Pro anual → TROCA de plano básico no mesmo SKU',
    comoComprarNaPlay([{ sku: 'olli_pro', planoBasico: 'mensal', purchaseToken: 'tok-pro' }], { produtoId: 'olli_pro:anual' }),
    { tipo: 'troca', oldProductId: 'olli_pro', purchaseToken: 'tok-pro', replacementMode: MODO_TROCA_PLAY });
  checar('mesmo SKU e plano básico → não compra de novo', comoComprarNaPlay([{ sku: 'olli_empresa', planoBasico: 'mensal', purchaseToken: 't' }], empresaMensal), { tipo: 'ja_tem' });
  checar('mesmo SKU, plano básico que a loja não informou → na dúvida, não cobra de novo', comoComprarNaPlay([{ sku: 'olli_empresa', purchaseToken: 't' }], empresaMensal), { tipo: 'ja_tem' });
  checar('troca necessária sem token da antiga → indeterminado (não arrisca cobrança dupla)', comoComprarNaPlay([{ sku: 'olli_pro', planoBasico: 'mensal' }], empresaMensal), { tipo: 'indeterminado' });
  checar('modo de troca: vale na hora, com crédito do tempo pago', MODO_TROCA_PLAY, 'with-time-proration');
}

console.log('\n9) Confirmação do SERVIDOR antes de dizer "liberado"');
{
  const pago = { fonte: 'servidor', plano: 'pro', origem: 'pagamento' };
  checar('quem JÁ pagava por Pix/Stripe (sem produto da Play) → ainda NÃO liberado', liberacaoPlayConfirmada(pago, null, 'pro'), false);
  checar('Pro pela Play subindo p/ Empresa: produto ainda é o Pro → NÃO liberado', liberacaoPlayConfirmada({ ...pago, plano: 'empresa' }, 'olli_pro:mensal', 'empresa'), false);
  checar('servidor gravou o Empresa → liberado', liberacaoPlayConfirmada({ ...pago, plano: 'empresa' }, 'olli_empresa:mensal', 'empresa'), true);
  checar('Pix Empresa + Play Pro: produto Pro gravado → liberado (fica o maior nível)', liberacaoPlayConfirmada({ ...pago, plano: 'empresa' }, 'olli_pro:mensal', 'pro'), true);
  checar('restauração: qualquer produto da Play → liberado', liberacaoPlayConfirmada(pago, 'olli_pro:anual', null), true);
  checar('cache (não servidor) nunca confirma', liberacaoPlayConfirmada({ ...pago, fonte: 'cache_mesmo_usuario' }, 'olli_pro:mensal', 'pro'), false);
  checar('plano grátis no servidor nunca confirma', liberacaoPlayConfirmada({ ...pago, plano: 'gratis' }, 'olli_pro:mensal', 'pro'), false);
  checar('concessão do admin não é compra da Play', liberacaoPlayConfirmada({ ...pago, origem: 'admin' }, 'olli_pro:mensal', 'pro'), false);
}

console.log('\n10) Gerenciar na Play Store');
checar('abre a página de assinaturas do app, na assinatura certa',
  urlGerenciarNaPlay('online.olliorcamentos.app', 'olli_empresa:mensal'),
  'https://play.google.com/store/account/subscriptions?package=online.olliorcamentos.app&sku=olli_empresa');
checar('sem produto conhecido → só a lista de assinaturas',
  urlGerenciarNaPlay('online.olliorcamentos.app', 'x'),
  'https://play.google.com/store/account/subscriptions?package=online.olliorcamentos.app');

console.log('\n11) Serviço Android (origem): desliga antes de tocar a loja; servidor libera');
{
  const android = ler('../src/services/playBilling.android.ts');
  for (const fn of ['carregarOfertasPlay', 'comprarNaPlay', 'restaurarComprasPlay']) {
    checar(`${fn} desliga antes de tocar a loja`, (() => {
      const i = android.indexOf(`export async function ${fn}(`);
      return i >= 0 && android.slice(i, i + 200).includes("if (!playBillingLigado()) return { estado: 'desligado' };");
    })(), true);
  }
  checar('importa o expo-iap (Play Billing direto)', /from 'expo-iap';/.test(android), true);
  checar('binário: módulo nativo ExpoIap exigido', android.includes("requireOptionalNativeModule('ExpoIap') != null"), true);
  checar('Expo Go detectado pela API do SDK 57 (isRunningInExpoGo)', android.includes("import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';"), true);
  checar('servidor desligado → indisponivel (carregar, comprar, restaurar)', (android.match(/if \(cfg === 'desligada'\) return \{ estado: 'indisponivel' \};/g) ?? []).length, 3);
  checar('a compra leva obfuscatedAccountId = hash da conta', android.includes('obfuscatedAccountId: conta.hash,'), true);
  checar('hash = SHA-256 do user.id (expo-crypto)', android.includes('Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId)'), true);
  checar('oferta com o token que a LOJA devolveu', android.includes('subscriptionOffers: [{ sku, offerToken: pacote.offerToken }],'), true);
  checar('troca usa o token antigo + replacement params', [
    android.includes('purchaseToken: compra.purchaseToken,'),
    android.includes('subscriptionProductReplacementParams: {'),
  ], [true, true]);
  const lerAtivas = "const ativas = (await comprasNaPlay()).filter((c) => c.purchaseState === 'purchased');";
  checar('lê as assinaturas ATIVAS (sem pendentes) ANTES de comprar', android.indexOf(lerAtivas) >= 0 && android.indexOf(lerAtivas) < android.indexOf('await requestPurchase('), true);
  checar('erro do listener confere o SKU antes de encerrar a compra aberta', /purchaseErrorListener\(\(erro\) => \{[\s\S]*?erro\?\.productId[\s\S]*?resolverPendente\(traduzirFalhaPlay\(erro\?\.code\), sku\);/.test(android), true);
  checar('restaurar com recusa do servidor vira erro explícito (não "não há nada")', android.includes("else if (r.estado === 'recusada') recusada = true;") && android.includes('if (recusada) return { estado: \'erro\', mensagem: MENSAGEM_RECUSADA_RESTAURAR };'), true);
  checar('sem_liberacao tem texto próprio (nunca "estamos confirmando")', android.includes("case 'sem_liberacao':"), true);
  {
    const i = android.indexOf('async function verificarEFinalizar(');
    const corpo = android.slice(i, android.indexOf('\n}\n', i));
    checar('finishTransaction só DEPOIS do ok do servidor', [
      corpo.indexOf('await verificarCompraPlay(') >= 0,
      corpo.indexOf('await verificarCompraPlay(') < corpo.indexOf('finishTransaction('),
      corpo.includes("if (r.estado === 'ok' && compra.isAcknowledgedAndroid !== true) {"),
    ], [true, true, true]);
  }
  {
    const i = android.indexOf('async function tratarCompraRecebida(');
    const corpo = android.slice(i, android.indexOf('\n}\n', i));
    checar('compra PENDENTE não é verificada nem finalizada', corpo.indexOf("compra.purchaseState === 'pending'") < corpo.indexOf('verificarEFinalizar('), true);
    checar('assinatura SUSPENSA não dá acesso', corpo.includes('if (compra.isSuspendedAndroid === true) {'), true);
  }
  checar('restaurar inclui as suspensas (para avisar, nunca liberar)', android.includes('getAvailablePurchases({ includeSuspendedAndroid: true })'), true);
  checar('sincroniza ao voltar ao app (AppState active)', android.includes("if (estado === 'active') void sincronizarComprasPlay();"), true);
  checar('sincroniza ao abrir / entrar (INITIAL_SESSION, SIGNED_IN)', android.includes("if (evento === 'INITIAL_SESSION' || evento === 'SIGNED_IN') {"), true);
  checar('nada de IAPKit/verificação de terceiro', /verifyPurchaseWithProvider|iapkit/i.test(android), false);
  checar('contrato com a versão iOS/web conferido pelo tsc', android.includes("satisfies typeof import('./playBilling');"), true);

  const worker = ler('../src/services/playBillingWorker.ts');
  checar('cliente chama só /play/config e /play/verificar', [...worker.matchAll(/\/play\/[a-z]+/g)].map((m) => m[0]).filter((v, i, a) => a.indexOf(v) === i), ['/play/config', '/play/verificar']);
  checar('/play/verificar com o JWT do Supabase', worker.includes('Authorization: `Bearer ${token}`'), true);
  checar('corpo do contrato montado por corpoVerificacaoPlay (formato único)', worker.includes('body: JSON.stringify(corpoVerificacaoPlay(compra)),'), true);
}

console.log('\n12) `expo-iap` só no arquivo dono; nada de RevenueCat; segredos da Play fora do cliente');
{
  const doApp = [...arquivosDe('src'), 'App.tsx'].filter((f) => existsSync(join(RAIZ, f)));
  const importamIap = doApp.filter((f) => /from\s+['"]expo-iap['"]|require\(\s*['"]expo-iap/.test(readFileSync(join(RAIZ, f), 'utf8')));
  checar('só playBilling.android.ts importa expo-iap', importamIap, ['src/services/playBilling.android.ts']);
  const rc = doApp.filter((f) => /react-native-purchases|REVENUECAT_GOOGLE_KEY|EXPO_PUBLIC_REVENUECAT/.test(readFileSync(join(RAIZ, f), 'utf8')));
  checar('nenhum resto do SDK do RevenueCat no app', rc, []);
  const segredo = /PLAY_SA_JSON|PLAY_TESTE_PERMITIDOS|BEGIN PRIVATE KEY|private_key_id|androidpublisher/;
  const vazam = [...doApp, ...arquivosDe('webapp/src')].filter((f) => segredo.test(readFileSync(join(RAIZ, f), 'utf8')));
  checar('nenhum segredo/chamada privilegiada da Play no cliente', vazam, []);
  const pkg = JSON.parse(ler('../package.json')) as { dependencies: Record<string, string> };
  checar('package.json: expo-iap exato 5.8.2, sem react-native-purchases', [pkg.dependencies['expo-iap'], pkg.dependencies['react-native-purchases'] ?? null], ['5.8.2', null]);
  const config = ler('../src/config.ts');
  checar('config.ts sem chave do RevenueCat', /REVENUECAT/.test(config), false);
}

console.log('\n13) Telas: DESLIGADO = NADA SE VENDE; no Android nunca o preço da web');
{
  const planos = ler('../src/screens/PlanosScreen.tsx');
  checar('VENDA_PELA_PLAY nasce só do estado "ligado" do binário', planos.includes("const VENDA_PELA_PLAY = ESTADO_PLAY_BILLING === 'ligado';"), true);
  checar('venda visível exige o servidor (indisponivel/desligado escondem)', planos.includes("return VENDA_PELA_PLAY && estado !== 'indisponivel' && estado !== 'desligado';"), true);
  checar('a tela NÃO importa a loja direto (só o serviço)', /from\s+['"](?:expo-iap|react-native-purchases)['"]/.test(planos), false);
  checar('estado das ofertas nasce "desligado" sem o binário', planos.includes("VENDA_PELA_PLAY ? { estado: 'carregando' } : { estado: 'desligado' }"), true);
  checar('card sem venda pela Play recebe vendaPlay=null', planos.includes('if (!vendaPlayVisivel(ofertasPlay.estado)) return null;'), true);
  checar('Android sem venda: card SEM preço (nem o da web)', [
    planos.includes('const semPrecoNoAndroid = BUILD_PLAY_SEM_COMPRA_EXTERNA && !vendaPlay;'),
    planos.includes(': semPrecoNoAndroid\n      ? null'),
  ], [true, true]);
  checar('Android sem venda: diz que está indisponível no momento', planos.includes('Assinatura pelo app indisponível no momento'), true);
  checar('texto antigo de "não contratar" saiu', /não disponível neste aplicativo Android|mas não contratar/.test(planos), false);
  checar('comparativo nunca repete o preço da web no Android', planos.includes('precosDaFonte={!BUILD_PLAY_SEM_COMPRA_EXTERNA}'), true);
  // Abas e rodapé seguem a última resposta CONHECIDA (não piscam no "carregando").
  checar('abas mensal/anual no Android só com a venda confirmada', planos.includes('BUILD_PLAY_SEM_COMPRA_EXTERNA && molduraPlay !== true ? null : ('), true);
  checar('a moldura só muda com a resposta do servidor', planos.includes('setMolduraPlay(vendaPlayVisivel(resultado.estado));'), true);
  checar('"Restaurar" e "Gerenciar na Google Play" só com a venda confirmada', [
    planos.includes('{molduraPlay === true ? (\n          <View style={styles.playRodape}>'),
    planos.includes('<Text style={styles.ctaSecundarioText}>Gerenciar na Google Play</Text>'),
    planos.includes('Restaurar compras da Google Play'),
  ], [true, true, true]);
  {
    const i = planos.indexOf('function assinarPelaPlay(');
    const corpo = planos.slice(i, planos.indexOf('async function concluirAssinaturaPlay(', i));
    checar('assinarPelaPlay: guarda do binário', corpo.includes('if (!VENDA_PELA_PLAY) return;'), true);
    checar('assinarPelaPlay: quem já paga (Stripe/Pix/Play) não recebe oferta', corpo.includes('if (ehPagante) return;'), true);
    checar('assinarPelaPlay: termos ANTES da compra', corpo.indexOf('termosAssinaturaPlay(p.nome, oferta)') >= 0 && corpo.indexOf('termosAssinaturaPlay(p.nome, oferta)') < corpo.indexOf('concluirAssinaturaPlay(p, oferta)'), true);
  }
  {
    const i = planos.indexOf('function termosAssinaturaPlay(');
    const corpo = planos.slice(i, planos.indexOf('\n}\n', i));
    checar('termos: preço da loja, periodicidade, renovação automática e como cancelar', [
      corpo.includes('${oferta.precoTexto} por ${unidade}'),
      corpo.includes('renova automaticamente a cada ${unidade}'),
      corpo.includes('Cancele quando quiser em “Gerenciar na Google Play”'),
    ], [true, true, true]);
  }
  checar('Stripe/Pix/WhatsApp continuam fora do Android (guarda intacta)', [
    /import \{[^}]*\bBUILD_PLAY_SEM_COMPRA_EXTERNA\b[^}]*\} from '\.\.\/config\/loja';/.test(planos),
    ler('../src/config/lojaRegras.ts').includes("const buildPlaySemCompraExterna = os === 'android';"),
  ], [true, true]);
  checar('"liberado" só com o produto da Play confirmado no servidor', planos.includes('if (liberacaoPlayConfirmada(r, produtoNoServidor, esperado)) {'), true);
  checar('compra espera o plano COMPRADO; restauração aceita qualquer um', [
    planos.includes('await aguardarLiberacaoPlay(oferta.plano);'),
    planos.includes('await aguardarLiberacaoPlay(null);'),
  ], [true, true]);

  const recurso = ler('../src/components/RecursoPlano.tsx');
  checar('RecursoPlano: atalho de venda no Android só com o servidor confirmando', recurso.includes("return Platform.OS === 'android' && vendaPlayConfirmada();"), true);

  const conta = ler('../src/screens/ContaScreen.tsx');
  checar('Conta: preço da web escondido no Android', conta.includes('{BUILD_PLAY_SEM_COMPRA_EXTERNA ? null : (\n                  <View style={styles.soonPill}>'), true);
  checar('Conta: atalho "Assinaturas na Google Play" no Android', [
    conta.includes("...(Platform.OS === 'android' ? [{ id: 'gerenciarPlay'"),
    conta.includes("gerenciarPlay: { titulo: 'Assinaturas na Google Play'"),
  ], [true, true]);

  const app = JSON.parse(ler('../app.json')) as { expo: { plugins: unknown[]; android: { blockedPermissions?: string[] } } };
  checar('a permissão BILLING da Play não está bloqueada no app.json', (app.expo.android.blockedPermissions ?? []).includes('com.android.vending.BILLING'), false);
  checar('plugin do expo-iap registrado no app.json', app.expo.plugins.includes('expo-iap'), true);

  const assinatura = ler('../src/screens/AssinaturaScreen.tsx');
  checar('"Gerenciar na Google Play" só com leitura ok e produto da Play', assinatura.includes("const produtoPlay = play.estado === 'ok' ? play.produto : null;"), true);
  checar('...no Android pelo deep link da Play', assinatura.includes('? gerenciarAssinaturaNaPlay(produtoPlay)'), true);
  checar('...e sem botão para outra loja no iPhone', assinatura.includes("{Platform.OS === 'ios' ? null : ("), true);
  checar('assinante da Play não é mandado ao Portal da Stripe', [
    assinatura.includes('mostraPortalStripe(resumo)'),
    ler('../src/services/assinaturaTextos.ts').includes('return r.temClienteStripe === true;'),
  ], [true, true]);
  checar('Android: recibo é o PDF de fatura paga, sem citar o processador', [
    assinatura.includes("? 'Toque no recibo para abrir o PDF de uma fatura paga.'"),
    ler('../src/services/assinatura.ts').includes("recibo: typeof f.recibo === 'string' && (!BUILD_PLAY_SEM_COMPRA_EXTERNA || f.status === 'paid') ? f.recibo : null,"),
    ler('../src/services/assinatura.ts').includes('BUILD_PLAY_SEM_COMPRA_EXTERNA ? `${rota}?plataforma=android` : rota'),
  ], [true, true, true]);
  checar('upsell do Grátis lê os benefícios da tabela única', assinatura.includes("(PLANOS_BASE.find((p) => p.id === 'pro')?.beneficios ?? [])"), true);
}

console.log('\n14) Assinante da Play NUNCA recebe "Renovar com Pix" (app e painel)');
{
  // Sem Stripe, plano pago = Pix OU Play. Confundir os dois ofereceria pagar de novo
  // (Pix) a quem já é cobrado todo mês pela Google Play.
  const svc = ler('../src/services/assinatura.ts');
  checar('app: Play ativa → renovaSozinho=true', svc.includes('else if (play.produto) { renovaSozinho = true; renovaPelaPlay = true; }'), true);
  checar('app: leitura da Play falhou → "não sei" (undefined), não "Pix"', svc.includes("if (play.estado === 'indisponivel') renovaSozinho = undefined;"), true);
  checar('app: coluna ausente (42703, antes da migration) = não é da Play', svc.includes("error.code === '42703' ? { estado: 'ok', produto: null }"), true);
  checar('app: Play só conta enquanto a vigência DELA não passou', svc.includes('ate > Date.now() ? produto : null'), true);

  const painel = ler('../webapp/src/olli/marcaDocumento.ts');
  checar('painel: Play ativa → renovaSozinho=true', painel.includes('if (produtoPlay) return { renovaSozinho: true, renovaPelaPlay: true, produtoPlay, temClienteStripe };'), true);
  checar('painel: "não sei" não vira Pix', painel.includes('if (produtoPlay === undefined) return { temClienteStripe };'), true);
  checar('painel: coluna ausente (42703) = não é da Play', painel.includes('error.code === "42703" ? null : undefined'), true);

  const planosPainel = ler('../webapp/src/pages/olli/planos/index.tsx');
  checar('painel mostra o card da Play em vez do Portal da Stripe', planosPainel.includes('resumo.renovaPelaPlay ? (\n\t\t\t\t\t\t<CardAssinaturaPlay'), true);
  const app = JSON.parse(ler('../app.json')) as { expo: { android: { package: string } } };
  checar('pacote Android do painel = o do app.json', planosPainel.includes(`const PACOTE_ANDROID = "${app.expo.android.package}";`), true);

  // Exclusão de conta (decisão C12): o servidor cancela a renovação da Play; a tela avisa.
  const conta = ler('../src/screens/ContaScreen.tsx');
  const contaDesktop = ler('../src/screens/desktop/ContaDesktopScreen.tsx');
  checar('excluir conta (Android) avisa que a renovação da Play é cancelada', conta.includes('a renovação é cancelada ao excluir a conta, inclusive a assinatura feita pela Google Play'), true);
  checar('...com atalho para conferir na própria Play', conta.includes('Conferir em Assinaturas na Google Play'), true);
  checar('...e no desktop', contaDesktop.includes('Se você assinou pela Google Play (no app Android), a renovação de lá também é cancelada pela exclusão'), true);
  checar('texto antigo ("não é cancelada pela exclusão") saiu', /não é cancelada pela exclusão/.test(conta + contaDesktop), false);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
