/**
 * Teste da ASSINATURA PELA GOOGLE PLAY — lado do APP (regras + guardas da tela).
 *
 *     node scripts/teste-play-billing.ts
 * Exit 0 = passou; 1 = falhou. O exit code é a prova.
 *
 * O webhook do worker tem teste próprio (worker/scripts/teste-revenuecat-webhook.js).
 * Aqui fica trancado o que o APP promete:
 *  1. FLAG DESLIGADA = NADA APARECE. Sem a chave pública do RevenueCat, fora do
 *     Android ou dentro do Expo Go (onde o SDK simula compras), a venda não existe:
 *     a tela segue só informando, como antes. NUNCA MODO DEMO.
 *  2. PREÇO DA LOJA: o que o card mostra é o `priceString` que a Play devolveu —
 *     produto desconhecido ou sem preço não vira botão.
 *  3. UM CATÁLOGO SÓ: o worker lê o mesmo `produtoPlay` que o app usa para vender.
 *  4. Erros do SDK viram mensagens honestas; cancelar a folha da Play não é erro.
 */
import { readFileSync } from 'node:fs';
import {
  chavePlayValida,
  comoComprarNaPlay,
  estadoPlayBilling,
  liberacaoPlayConfirmada,
  idProdutoPlay,
  ofertaPara,
  ofertasDoCatalogo,
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
  return readFileSync(new URL(caminho, import.meta.url), 'utf8');
}

const CHAVE = 'goog_AbCdEfGhIjKlMnOpQr';

console.log('\n1) Quando a venda pela Play existe (e quando NÃO existe)');
checar('Android + chave goog_ + build nativo → ligado', estadoPlayBilling({ plataforma: 'android', chave: CHAVE, emExpoGo: false }), 'ligado');
checar('sem chave → desligado', estadoPlayBilling({ plataforma: 'android', chave: '', emExpoGo: false }), 'desligado_sem_chave');
checar('chave undefined → desligado', estadoPlayBilling({ plataforma: 'android', chave: undefined, emExpoGo: false }), 'desligado_sem_chave');
checar('chave da Apple (appl_) no Android → desligado', estadoPlayBilling({ plataforma: 'android', chave: 'appl_AbCdEfGhIjKlMn', emExpoGo: false }), 'desligado_sem_chave');
checar('chave SECRETA (sk_) colada por engano → desligado', estadoPlayBilling({ plataforma: 'android', chave: 'sk_AbCdEfGhIjKlMnOp', emExpoGo: false }), 'desligado_sem_chave');
checar('chave de teste da RevenueCat (test_) → desligado', chavePlayValida('test_AbCdEfGhIjKlMn'), false);
checar('Expo Go (compras SIMULADAS pelo SDK) → desligado', estadoPlayBilling({ plataforma: 'android', chave: CHAVE, emExpoGo: true }), 'desligado_expo_go');
checar('iOS, mesmo com chave → desligado (sem StoreKit)', estadoPlayBilling({ plataforma: 'ios', chave: CHAVE, emExpoGo: false }), 'desligado_plataforma');
checar('web, mesmo com chave → desligado (vende pelo checkout dela)', estadoPlayBilling({ plataforma: 'web', chave: CHAVE, emExpoGo: false }), 'desligado_plataforma');

console.log('\n2) Versão iOS/web do serviço: nunca vende');
checar('ESTADO_PLAY_BILLING = desligado_plataforma', stubPlay.ESTADO_PLAY_BILLING, 'desligado_plataforma');
checar('playBillingLigado() = false', stubPlay.playBillingLigado(), false);
checar('carregarOfertasPlay → desligado', await stubPlay.carregarOfertasPlay(), { estado: 'desligado' });
checar('comprarNaPlay → desligado', await stubPlay.comprarNaPlay({ plano: 'pro', periodo: 'mensal', produtoId: 'olli_pro:mensal', precoTexto: 'R$ 1' }), { estado: 'desligado' });
checar('restaurarComprasPlay → desligado', await stubPlay.restaurarComprasPlay(), { estado: 'desligado' });

console.log('\n3) Catálogo único de produtos (app e worker)');
checar('pro mensal', idProdutoPlay('pro', 'mensal'), 'olli_pro:mensal');
checar('empresa anual', idProdutoPlay('empresa', 'anual'), 'olli_empresa:anual');
checar('olli_empresa:anual → empresa/anual', produtoPlay('olli_empresa:anual'), { plano: 'empresa', periodo: 'anual', periodoConhecido: true });
checar('só a assinatura (produto antigo) → nível conhecido, período não', produtoPlay('olli_pro')?.periodoConhecido, false);
checar('produto de outro app → null', produtoPlay('com.outro:mensal'), null);
checar('plano básico inventado → null', produtoPlay('olli_pro:vitalicio'), null);
checar('lixo → null', [produtoPlay(''), produtoPlay(null), produtoPlay('a:b:c')], [null, null, null]);
{
  const rc = ler('../worker/src/revenuecat.js');
  checar('o worker importa o MESMO produtoPlay do app', rc.includes("import { produtoPlay } from '../../src/services/playBillingRegras.ts';"), true);
}

console.log('\n4) Ofertas: preço vem da LOJA; desconhecido/sem preço não vira botão');
{
  const ofertas = ofertasDoCatalogo([
    { produtoId: 'olli_pro:mensal', precoTexto: 'R$ 41,90' },
    { produtoId: 'olli_pro:anual', precoTexto: '  R$ 399,00 ' },
    { produtoId: 'olli_empresa:mensal', precoTexto: '' }, // loja sem preço → fora
    { produtoId: 'olli_vip:mensal', precoTexto: 'R$ 9,90' }, // desconhecido → fora
    { produtoId: 'olli_pro', precoTexto: 'R$ 1,00' }, // sem período → fora
    { produtoId: 'olli_pro:mensal', precoTexto: 'R$ 0,01' }, // duplicata → fica a 1ª
  ]);
  checar('só os produtos do catálogo com preço', ofertas.map((o) => o.produtoId), ['olli_pro:mensal', 'olli_pro:anual']);
  checar('preço exatamente o da loja (aparado)', ofertas.map((o) => o.precoTexto), ['R$ 41,90', 'R$ 399,00']);
  checar('ofertaPara acha pro/anual', ofertaPara(ofertas, 'pro', 'anual')?.precoTexto, 'R$ 399,00');
  checar('empresa sem preço da loja → null (card diz "ainda não está à venda")', ofertaPara(ofertas, 'empresa', 'mensal'), null);
}

console.log('\n5) Erros do SDK → mensagens honestas');
checar('cancelou a folha da Play → cancelado (silêncio)', traduzirFalhaPlay('1'), { estado: 'cancelado' });
checar('userCancelled=true → cancelado', traduzirFalhaPlay('0', true).estado, 'cancelado');
checar('pagamento pendente → pendente (não libera nada)', traduzirFalhaPlay('20'), { estado: 'pendente' });
checar('recibo de outra conta → outra_conta', traduzirFalhaPlay('7').estado, 'outra_conta');
checar('...idem código 13', traduzirFalhaPlay('13').estado, 'outra_conta');
checar('já comprado → orienta restaurar', traduzirFalhaPlay('6').estado === 'erro' && (traduzirFalhaPlay('6') as { mensagem: string }).mensagem.includes('Restaurar'), true);
checar('rede → mensagem de conexão', (traduzirFalhaPlay('10') as { mensagem: string }).mensagem.includes('conexão'), true);
checar('desconhecido → erro genérico sem prometer que nada foi cobrado', (traduzirFalhaPlay('999') as { mensagem: string }).mensagem.includes('Se a Google Play chegar a confirmar'), true);

console.log('\n6) Gerenciar na Play Store');
checar('abre a página de assinaturas do app, na assinatura certa',
  urlGerenciarNaPlay('online.olliorcamentos.app', 'olli_empresa:mensal'),
  'https://play.google.com/store/account/subscriptions?package=online.olliorcamentos.app&sku=olli_empresa');
checar('sem produto conhecido → só a lista de assinaturas',
  urlGerenciarNaPlay('online.olliorcamentos.app', 'x'),
  'https://play.google.com/store/account/subscriptions?package=online.olliorcamentos.app');

console.log('\n7) FLAG DESLIGADA = NADA APARECE — guardas da tela (origem)');
{
  const planos = ler('../src/screens/PlanosScreen.tsx');
  checar('VENDA_PELA_PLAY nasce só do estado "ligado"', planos.includes("const VENDA_PELA_PLAY = ESTADO_PLAY_BILLING === 'ligado';"), true);
  checar('a tela NÃO importa o SDK direto (só o serviço)', planos.includes('react-native-purchases'), false);
  checar('estado das ofertas nasce "desligado" sem a flag', planos.includes("VENDA_PELA_PLAY ? { estado: 'carregando' } : { estado: 'desligado' }"), true);
  checar('carregarPlay não faz nada sem a flag', planos.includes('const carregarPlay = useCallback(async () => {\n    if (!VENDA_PELA_PLAY) return;') || planos.includes('const carregarPlay = useCallback(async () => {\r\n    if (!VENDA_PELA_PLAY) return;'), true);
  checar('card sem venda pela Play recebe vendaPlay=null', planos.includes("if (!VENDA_PELA_PLAY || (p.id !== 'pro' && p.id !== 'empresa')) return null;"), true);
  checar('sem vendaPlay o Android mostra o texto de antes', planos.includes('Contratação não disponível neste aplicativo Android'), true);
  checar('assinarPelaPlay tem o early-return da flag', (() => {
    const i = planos.indexOf('async function assinarPelaPlay(');
    return planos.slice(i, i + 200).includes('if (!VENDA_PELA_PLAY) return;');
  })(), true);
  checar('"Restaurar compras" só com a flag', planos.includes('{VENDA_PELA_PLAY ? (\n          <View style={styles.playRodape}>') || planos.includes('{VENDA_PELA_PLAY ? (\r\n          <View style={styles.playRodape}>'), true);
  checar('abas mensal/anual no Android só com a flag', planos.includes('BUILD_PLAY_SEM_COMPRA_EXTERNA && !VENDA_PELA_PLAY ? null : ('), true);
  checar('Stripe/Pix/WhatsApp continuam fora do Android (guarda intacta)', planos.includes("const BUILD_PLAY_SEM_COMPRA_EXTERNA = Platform.OS === 'android';"), true);
  checar('o preço do card na Play é o da loja', planos.includes('const precoLoja = vendaPlay?.oferta?.precoTexto ?? null;'), true);
  checar('a tabela não repete o preço da Stripe quando cobra a Play', planos.includes('precosDaFonte={!VENDA_PELA_PLAY}'), true);
  checar('"liberado" só com o produto da Play confirmado no servidor', planos.includes('if (liberacaoPlayConfirmada(r, produtoNoServidor, esperado)) {'), true);
  checar('compra espera o plano COMPRADO; restauração aceita qualquer um', [
    planos.includes('await aguardarLiberacaoPlay(oferta.plano);'),
    planos.includes('await aguardarLiberacaoPlay(null);'),
  ], [true, true]);

  const android = ler('../src/services/playBilling.android.ts');
  for (const fn of ['carregarOfertasPlay', 'comprarNaPlay', 'restaurarComprasPlay']) {
    checar(`${fn} desliga antes de tocar o SDK`, (() => {
      const i = android.indexOf(`export async function ${fn}(`);
      return i >= 0 && android.slice(i, i + 200).includes("if (!playBillingLigado()) return { estado: 'desligado' };");
    })(), true);
  }
  checar('troca de plano vira SUBSTITUIÇÃO na Play (nunca 2ª assinatura)', android.includes('await Purchases.purchasePackage(pacote, null, { oldProductIdentifier: compra.oldProductIdentifier });'), true);
  checar('lê as assinaturas ativas ANTES de comprar', android.indexOf('Purchases.getCustomerInfo()') >= 0 && android.indexOf('Purchases.getCustomerInfo()') < android.indexOf('Purchases.purchasePackage('), true);
  checar('SDK configurado com appUserID = usuário do Supabase (nunca anônimo)', android.includes('Purchases.configure({ apiKey: REVENUECAT_GOOGLE_KEY, appUserID: userId });'), true);
  checar('sem sessão não configura o SDK', android.includes("if (!userId) return null;"), true);
  checar('Expo Go detectado pela API do SDK 57 (isRunningInExpoGo)', android.includes("import { isRunningInExpoGo } from 'expo';"), true);
  checar('na dúvida sobre Expo Go, desliga', android.includes('return true;\n    }\n  })(),') || android.includes('return true;\r\n    }\r\n  })(),'), true);

  const config = ler('../src/config.ts');
  checar('chave vazia por padrão (desligado até existir)', config.includes("(process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY ?? '').trim()"), true);

  const app = JSON.parse(ler('../app.json')) as { expo: { android: { blockedPermissions?: string[] } } };
  checar('a permissão BILLING da Play não está bloqueada no app.json', (app.expo.android.blockedPermissions ?? []).includes('com.android.vending.BILLING'), false);

  const assinatura = ler('../src/screens/AssinaturaScreen.tsx');
  checar('"Gerenciar na Google Play" só com leitura ok e produto da Play', assinatura.includes("const produtoPlay = play.estado === 'ok' ? play.produto : null;"), true);
  checar('...e sem botão para outra loja no iPhone', assinatura.includes("{Platform.OS === 'ios' ? null : ("), true);
  checar('assinante da Play não é mandado ao Portal da Stripe', assinatura.includes("(!semRenovacao && resumo?.renovaPelaPlay !== true) || resumo?.temClienteStripe === true"), true);
}

console.log('\n7b) Troca de plano e confirmação do servidor (comportamento)');
{
  const empresaMensal = { produtoId: 'olli_empresa:mensal' };
  checar('nada ativo → compra nova', comoComprarNaPlay([], empresaMensal), { tipo: 'nova' });
  checar('só produto de fora do catálogo ativo → compra nova', comoComprarNaPlay(['outro_app:x', 42], empresaMensal), { tipo: 'nova' });
  checar('Pro ativo e compra Empresa → TROCA a partir de olli_pro', comoComprarNaPlay(['olli_pro:mensal'], empresaMensal), { tipo: 'troca', oldProductIdentifier: 'olli_pro' });
  checar('Empresa ativo e compra Pro anual → TROCA a partir de olli_empresa', comoComprarNaPlay(['olli_empresa:mensal'], { produtoId: 'olli_pro:anual' }), { tipo: 'troca', oldProductIdentifier: 'olli_empresa' });
  checar('mesmo produto já ativo → não compra de novo', comoComprarNaPlay(['olli_empresa:mensal'], empresaMensal), { tipo: 'ja_tem' });
  checar('lista ausente → compra nova', comoComprarNaPlay(undefined, empresaMensal), { tipo: 'nova' });

  const pago = { fonte: 'servidor', plano: 'pro', origem: 'pagamento' };
  checar('quem JÁ pagava por Pix/Stripe (sem produto da Play) → ainda NÃO liberado', liberacaoPlayConfirmada(pago, null, 'pro'), false);
  checar('Pro pela Play subindo p/ Empresa: produto ainda é o Pro → NÃO liberado', liberacaoPlayConfirmada({ ...pago, plano: 'empresa' }, 'olli_pro:mensal', 'empresa'), false);
  checar('webhook gravou o Empresa → liberado', liberacaoPlayConfirmada({ ...pago, plano: 'empresa' }, 'olli_empresa:mensal', 'empresa'), true);
  checar('Pix Empresa + Play Pro: produto Pro gravado → liberado (fica o maior nível)', liberacaoPlayConfirmada({ ...pago, plano: 'empresa' }, 'olli_pro:mensal', 'pro'), true);
  checar('restauração: qualquer produto da Play → liberado', liberacaoPlayConfirmada(pago, 'olli_pro:anual', null), true);
  checar('cache (não servidor) nunca confirma', liberacaoPlayConfirmada({ ...pago, fonte: 'cache_mesmo_usuario' }, 'olli_pro:mensal', 'pro'), false);
  checar('plano grátis no servidor nunca confirma', liberacaoPlayConfirmada({ ...pago, plano: 'gratis' }, 'olli_pro:mensal', 'pro'), false);
  checar('concessão do admin não é compra da Play', liberacaoPlayConfirmada({ ...pago, origem: 'admin' }, 'olli_pro:mensal', 'pro'), false);
}

console.log('\n8) Assinante da Play NUNCA recebe "Renovar com Pix" (app e painel)');
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
  checar('painel mostra o card da Play em vez do Portal da Stripe', planosPainel.includes('resumo.renovaPelaPlay ? (\n\t\t\t\t\t\t<CardAssinaturaPlay') || planosPainel.includes('resumo.renovaPelaPlay ? (\r\n\t\t\t\t\t\t<CardAssinaturaPlay'), true);
  const app = JSON.parse(ler('../app.json')) as { expo: { android: { package: string } } };
  const conta = ler('../src/screens/ContaScreen.tsx');
  const contaDesktop = ler('../src/screens/desktop/ContaDesktopScreen.tsx');
  checar('excluir conta NÃO promete cancelar a assinatura da Play (Android)', conta.includes('Assinatura feita pela Google Play não é cancelada pela exclusão'), true);
  checar('...nem no desktop', contaDesktop.includes('Assinatura feita pela Google Play (no app Android) não é cancelada pela exclusão'), true);
  checar('pacote Android do painel = o do app.json', planosPainel.includes(`const PACOTE_ANDROID = "${app.expo.android.package}";`), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
