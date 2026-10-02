/**
 * Teste do WebView da PRÉVIA DO PDF trancado (auditoria de segurança 02/10, S6).
 *
 *     node scripts/teste-pdf-preview-seguro.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A prévia é um documento estático montado por `montarHtmlOrcamentoCompleto` (escape
 * em todo campo do usuário, sem <script>). O WebView não precisa de JS, de origem
 * externa nem de navegação — então não tem por que tê-los.
 *
 * Duas partes:
 *  1. As props do <WebView> conferidas pelo TEXTO do componente (importar o .tsx
 *     aqui puxaria o react-native).
 *  2. COMPORTAMENTO REAL: a guarda (`src/components/pdfPreviewGuarda.ts`) roda
 *     dentro do `createOnShouldStartLoadWithRequest` DE VERDADE do
 *     react-native-webview instalado (com o `Linking` do react-native trocado por um
 *     espião). É ali que mora a pegadinha: URL fora do `originWhitelist` nem chega à
 *     guarda — vai para `Linking.openURL` e abre FORA do app. O teste prova que, com
 *     o curinga + a guarda, nenhum link carrega nem abre fora; e que com
 *     `['about:blank']` o link abriria fora (o bug que o curinga corrige).
 */
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { ORIGENS_DA_PREVIA, permitirCargaDaPrevia } from '../src/components/pdfPreviewGuarda.ts';

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

const fonte = readFileSync(new URL('../src/components/PdfPreviewModal.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Sem comentários (os docblocks citam as props e tornariam as buscas verdadeiras por acidente).
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => (l.trimStart().startsWith('//') ? '' : l)).join('\n');

const iWebView = codigo.indexOf('<WebView');
const bloco = iWebView >= 0 ? codigo.slice(iWebView, codigo.indexOf('/>', iWebView)) : '';

console.log('\n── WebView da prévia ──');
checar('o <WebView> foi localizado', bloco.length > 0, true);
checar('JavaScript desligado', bloco.includes('javaScriptEnabled={false}'), true);
checar('origens = ORIGENS_DA_PREVIA (curinga) JUNTO com a guarda', bloco.includes('originWhitelist={ORIGENS_DA_PREVIA}') && bloco.includes('onShouldStartLoadWithRequest={permitirCargaDaPrevia}'), true);
checar('a guarda vem do módulo puro testado aqui', /import \{[^}]*permitirCargaDaPrevia[^}]*\} from '\.\/pdfPreviewGuarda'/.test(codigo), true);
checar('ORIGENS_DA_PREVIA é o curinga', ORIGENS_DA_PREVIA, ['*']);
checar('sem janelas extras', bloco.includes('setSupportMultipleWindows={false}'), true);
checar('sem acesso a arquivo local', bloco.includes('allowFileAccess={false}'), true);
checar('sem ponte JS (onMessage / injectedJavaScript)', /onMessage|injectedJavaScript/.test(bloco), false);

console.log('\n── Guarda de navegação (função isolada) ──');
checar('about:blank passa (o próprio documento)', permitirCargaDaPrevia({ url: 'about:blank' }), true);
checar('data:text/html BLOQUEADO (seria HTML arbitrário dentro do app)', permitirCargaDaPrevia({ url: 'data:text/html;charset=utf-8,<p>x</p>' }), false);
checar('o documento carrega como about:blank (baseUrl explícito)', bloco.includes("source={{ html, baseUrl: 'about:blank' }}"), true);
checar('link https bloqueado', permitirCargaDaPrevia({ url: 'https://exemplo.com/' }), false);
checar('http bloqueado', permitirCargaDaPrevia({ url: 'http://exemplo.com/' }), false);
checar('tel: bloqueado', permitirCargaDaPrevia({ url: 'tel:+5511999999999' }), false);
checar('javascript: bloqueado', permitirCargaDaPrevia({ url: 'javascript:alert(1)' }), false);
checar('file: bloqueado', permitirCargaDaPrevia({ url: 'file:///data/user/0/x' }), false);
checar('sem url bloqueado', permitirCargaDaPrevia({}), false);

console.log('\n── Comportamento REAL do react-native-webview (Linking espionado) ──');
{
  // Carrega o WebViewShared.js INSTALADO com um react-native de mentira: só o
  // Linking (espião) e o que o módulo toca ao ser avaliado.
  const abertos: string[] = [];
  const reactNativeFalso = {
    Linking: {
      canOpenURL: async () => true,
      openURL: async (url: string) => { abertos.push(url); },
    },
    Platform: { OS: 'android' },
    View: 'View',
    Text: 'Text',
    ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: <T,>(s: T) => s },
  };
  const M = Module as unknown as { _load: (req: string, ...resto: unknown[]) => unknown };
  const carregarOriginal = M._load;
  M._load = function (req: string, ...resto: unknown[]) {
    if (req === 'react-native') return reactNativeFalso;
    return carregarOriginal.call(this, req, ...resto);
  };
  let criar: ((carregar: (ok: boolean, url: string) => void, origens: string[], guarda?: (e: { url?: string }) => boolean) => (ev: { nativeEvent: { url: string; lockIdentifier: number } }) => void) | null = null;
  try {
    const exigir = createRequire(import.meta.url);
    criar = (exigir('react-native-webview/lib/WebViewShared.js') as { createOnShouldStartLoadWithRequest: typeof criar }).createOnShouldStartLoadWithRequest;
  } finally {
    M._load = carregarOriginal;
  }
  checar('createOnShouldStartLoadWithRequest do pacote instalado foi carregado', typeof criar, 'function');

  const navegar = async (origens: string[], url: string) => {
    const decisoes: boolean[] = [];
    const handler = criar!((ok) => { decisoes.push(ok); }, origens, permitirCargaDaPrevia);
    abertos.length = 0;
    handler({ nativeEvent: { url, lockIdentifier: 1 } });
    await new Promise((r) => setTimeout(r, 0)); // o Linking do pacote é assíncrono
    return { carrega: decisoes[0], abriuFora: [...abertos] };
  };

  // Com o curinga + a guarda (o que o app usa):
  checar('o próprio documento (about:blank) carrega', await navegar(ORIGENS_DA_PREVIA, 'about:blank'), { carrega: true, abriuFora: [] });
  for (const url of ['https://exemplo.com/pagar', 'tel:+5511999999999', 'whatsapp://send?text=oi', 'http://x.y/']) {
    checar(`link ${url.split(':')[0]}: NÃO carrega e NÃO abre fora do app`, await navegar(ORIGENS_DA_PREVIA, url), { carrega: false, abriuFora: [] });
  }

  // O bug que o curinga corrige: com só about:blank, o link pula a guarda e abre fora.
  checar("com originWhitelist=['about:blank'] o link https ABRIRIA FORA (motivo do curinga)", await navegar(['about:blank'], 'https://exemplo.com/pagar'), { carrega: false, abriuFora: ['https://exemplo.com/pagar'] });
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
