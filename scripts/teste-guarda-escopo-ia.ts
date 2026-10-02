/**
 * Teste da GUARDA DE ESCOPO DA IA (política de IA generativa da Google Play).
 *
 *     node scripts/teste-guarda-escopo-ia.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A Play exige salvaguardas contra conteúdo restrito (sexual, violento, de ódio,
 * ilegal) em toda superfície generativa. O worker tem CINCO prompts de sistema (chat,
 * ação auditável, diagnóstico, voz de orçamento e voz em modo conversa); copiar o
 * parágrafo à mão numa rota só deixa as outras sem trava. Este teste tranca que os
 * cinco carregam o MESMO parágrafo (`GUARDA_ESCOPO_IA`, em worker/src/voz.js).
 *
 * `worker/src/index.js` não é importável aqui (carrega @sentry/cloudflare, que só
 * existe em worker/), então os prompts dele são conferidos pelo TEXTO do arquivo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { GUARDA_ESCOPO_IA, vozSystem, vozConversaSystem } from '../worker/src/voz.js';

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

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const index = readFileSync(join(RAIZ, 'worker/src/index.js'), 'utf8');

console.log('\n── O parágrafo cobre as categorias da política ──');
for (const [rotulo, re] of [
  ['sexual', /sexual/i],
  ['violento', /violento/i],
  ['ódio', /ódio/i],
  ['ilegal', /ilegal/i],
  ['autoagressão', /autoagress/i],
  ['menores', /menores/i],
  ['fora do trabalho do prestador', /somente no trabalho do prestador/i],
] as const) {
  checar(`GUARDA_ESCOPO_IA cobre ${rotulo}`, re.test(GUARDA_ESCOPO_IA), true);
}

console.log('\n── Os cinco prompts de sistema carregam a guarda ──');
for (const vertical of ['refrigeracao', 'pintura', undefined]) {
  checar(`vozSystem(${vertical}) inclui a guarda`, vozSystem(vertical).includes(GUARDA_ESCOPO_IA), true);
  checar(`vozSystem(${vertical}) ainda exige JSON`, /SOMENTE com JSON válido/.test(vozSystem(vertical)), true);
  for (const forcar of [false, true]) {
    checar(`vozConversaSystem(${vertical}, ${forcar}) inclui a guarda`, vozConversaSystem(vertical, forcar).includes(GUARDA_ESCOPO_IA), true);
  }
}
checar('index.js importa a guarda de voz.js', /GUARDA_ESCOPO_IA,\n\s*vozPrompt/.test(index.replace(/\r\n/g, '\n')), true);

const usos = index.match(/\$\{GUARDA_ESCOPO_IA\}/g) ?? [];
checar('index.js usa a guarda em DIAG_SYSTEM e chatSystem (2 usos)', usos.length, 2);
const diag = index.slice(index.indexOf('const DIAG_SYSTEM = `'), index.indexOf('Responda SOMENTE com JSON válido no formato pedido.`;'));
checar('DIAG_SYSTEM carrega a guarda', diag.includes('${GUARDA_ESCOPO_IA}'), true);
const iChat = index.indexOf('function chatSystem(vertical) {');
const chat = index.slice(iChat, index.indexOf('\n}', iChat));
checar('chatSystem carrega a guarda', chat.includes('${GUARDA_ESCOPO_IA}'), true);
// O prompt da AÇÃO auditável é `${chatSystem(vertical)}\n\n...`: herda a guarda do chat.
checar('o prompt de ação deriva de chatSystem (herda a guarda)', index.includes('return `${chatSystem(vertical)}\\n\\nVocê está preparando uma alteração auditável'), true);

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
