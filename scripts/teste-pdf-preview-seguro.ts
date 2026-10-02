/**
 * Teste do WebView da PRÉVIA DO PDF trancado (auditoria de segurança 02/10, S6).
 *
 *     node scripts/teste-pdf-preview-seguro.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A prévia é um documento estático montado por `montarHtmlOrcamentoCompleto` (escape
 * em todo campo do usuário, sem <script>). O WebView não precisa de JS, de origem
 * externa nem de navegação — então não tem por que tê-los. Se algum campo do
 * cliente um dia escapasse do escape, o HTML não executaria script nem levaria o
 * usuário para outra página. Conferido pelo TEXTO do componente (importar o .tsx
 * aqui puxaria o react-native).
 */
import { readFileSync } from 'node:fs';

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
checar('origem só about:blank (sem curinga)', bloco.includes("originWhitelist={['about:blank']}") && !bloco.includes("'*'"), true);
checar('navegação passa pela guarda', bloco.includes('onShouldStartLoadWithRequest={permitirCargaDaPrevia}'), true);
checar('sem janelas extras', bloco.includes('setSupportMultipleWindows={false}'), true);
checar('sem acesso a arquivo local', bloco.includes('allowFileAccess={false}'), true);
checar('sem ponte JS (onMessage / injectedJavaScript)', /onMessage|injectedJavaScript/.test(bloco), false);

console.log('\n── Guarda de navegação ──');
const iFn = codigo.indexOf('function permitirCargaDaPrevia');
const corpoFn = iFn >= 0 ? codigo.slice(iFn, codigo.indexOf('\n}', iFn) + 2) : '';
checar('a função da guarda existe', corpoFn.length > 0, true);
// Reavalia a função isolada, sem o react-native: tira só a anotação de tipo.
const permitir = new Function(
  `${corpoFn.replace('req: { url?: string }): boolean', 'req)')}; return permitirCargaDaPrevia;`,
)() as (req: { url?: string }) => boolean;
checar('about:blank passa (o próprio documento)', permitir({ url: 'about:blank' }), true);
checar('data:text/html passa (o próprio documento)', permitir({ url: 'data:text/html;charset=utf-8,<p>x</p>' }), true);
checar('link https bloqueado', permitir({ url: 'https://exemplo.com/' }), false);
checar('http bloqueado', permitir({ url: 'http://exemplo.com/' }), false);
checar('tel: bloqueado', permitir({ url: 'tel:+5511999999999' }), false);
checar('javascript: bloqueado', permitir({ url: 'javascript:alert(1)' }), false);
checar('file: bloqueado', permitir({ url: 'file:///data/user/0/x' }), false);
checar('sem url bloqueado', permitir({}), false);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
