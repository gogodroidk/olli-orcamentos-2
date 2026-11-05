/**
 * Busca do topo (D-1438): rolagem acompanha o tema, caixa sem selo azul,
 * atalho Ctrl+K e Ctrl+Q.
 *
 *     node scripts/teste-busca-tema.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O painel não roda no Node. O que dá para provar aqui é a regra: o documento
 * declara color-scheme por tema, a trilha da rolagem usa o token (não branco)
 * e o atalho não rouba o Cmd+Q do Mac.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atalhoAbreBusca, type TeclasAtalho } from '../webapp/src/layouts/components/atalho-busca.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

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

const css = ler('webapp/src/global.css');
const html = ler('webapp/index.html');
const tema = ler('webapp/src/theme/theme-provider.tsx');
const busca = ler('webapp/src/layouts/components/search-bar.tsx');
const comando = ler('webapp/src/ui/command.tsx');

console.log('\n1) color-scheme por tema e rolagem com o token');
checar('claro declara color-scheme light', /:root\s*\{[^}]*color-scheme:\s*light;/.test(css), true);
checar('escuro declara color-scheme dark', /:root\[data-theme-mode="dark"\]\s*\{[^}]*color-scheme:\s*dark;/.test(css), true);
checar('scrollbar-color usa o token do polegar', /scrollbar-color:\s*var\(--scrollbar-thumb\)\s+transparent/.test(css), true);
checar('polegar claro usa o canal gray-500', /--scrollbar-thumb:\s*rgba\(var\(--colors-palette-gray-500Channel/.test(css), true);
checar('polegar escuro usa o canal gray-400', /--scrollbar-thumb:\s*rgba\(var\(--colors-palette-gray-400Channel/.test(css), true);
checar('a lista da busca entra na mesma rolagem', /\[data-slot="command-list"\]/.test(css), true);
checar('trilha não é branco fixo', /scrollbar-color:[^;]*(#fff\b|white\b)/i.test(css), false);

console.log('\n2) o tema chega antes da pintura e na troca');
checar('o html lê themeMode salvo', html.includes('themeMode'), true);
checar('o html grava data-theme-mode', html.includes('data-theme-mode'), true);
checar('o html grava colorScheme', html.includes('colorScheme'), true);
checar('o provider grava colorScheme na troca', /root\.style\.colorScheme\s*=/.test(tema), true);

console.log('\n3) a caixa é um campo e os dois atalhos abrem');
checar('a busca usa o atalho extraído', busca.includes('atalhoAbreBusca'), true);
checar('o rótulo anuncia Ctrl+K e Ctrl+Q', busca.includes('aria-keyshortcuts="Control+K Control+Q"'), true);
checar('não é mais o selo azul sólido', busca.includes('bg-primary'), false);
checar('parece campo: borda e cantos de campo', busca.includes('rounded-full') && busca.includes('border-input'), true);
checar('a paleta reserva espaço pro botão fechar', comando.includes('data-[slot=command-input-wrapper]:pr-12'), true);
checar('a paleta declara color-scheme nos dois temas', comando.includes('[color-scheme:light]') && comando.includes('dark:[color-scheme:dark]'), true);

function teclas(parcial: Partial<TeclasAtalho>): TeclasAtalho {
  return {
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...parcial,
  };
}

console.log('\n4) quais teclas abrem a busca');
checar('Ctrl+K abre', atalhoAbreBusca(teclas({ key: 'k', ctrlKey: true })), true);
checar('Cmd+K abre', atalhoAbreBusca(teclas({ key: 'k', metaKey: true })), true);
checar('Ctrl+Q abre', atalhoAbreBusca(teclas({ key: 'q', ctrlKey: true })), true);
checar('Ctrl+Q maiúsculo abre', atalhoAbreBusca(teclas({ key: 'Q', ctrlKey: true })), true);
checar('Cmd+Q não abre (fecha o Mac)', atalhoAbreBusca(teclas({ key: 'q', metaKey: true })), false);
checar('Ctrl+Cmd+Q não abre', atalhoAbreBusca(teclas({ key: 'q', ctrlKey: true, metaKey: true })), false);
checar('Alt+Ctrl+K não abre', atalhoAbreBusca(teclas({ key: 'k', ctrlKey: true, altKey: true })), false);
checar('Shift+Ctrl+K não abre', atalhoAbreBusca(teclas({ key: 'K', ctrlKey: true, shiftKey: true })), false);
checar('tecla repetida não alterna', atalhoAbreBusca(teclas({ key: 'k', ctrlKey: true, repeat: true })), false);
checar('só K não abre', atalhoAbreBusca(teclas({ key: 'k' })), false);
checar('Ctrl+J não abre', atalhoAbreBusca(teclas({ key: 'j', ctrlKey: true })), false);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
