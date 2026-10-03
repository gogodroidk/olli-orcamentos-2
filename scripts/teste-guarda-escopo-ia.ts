/**
 * Teste da GUARDA DE ESCOPO DA IA (política de IA generativa da Google Play).
 *
 *     node scripts/teste-guarda-escopo-ia.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * A Play exige salvaguardas contra conteúdo restrito (sexual, violento, de ódio,
 * ilegal) em toda superfície generativa. O worker tem SETE prompts de sistema (chat,
 * ação auditável, diagnóstico, voz de orçamento, voz em modo conversa, Autopilot e
 * importação por IA); copiar o parágrafo à mão numa rota só deixa as outras sem
 * trava. Este teste tranca que os sete carregam o MESMO parágrafo
 * (`GUARDA_ESCOPO_IA`, em worker/src/guardaEscopoIa.js, reexportado por voz.js).
 * Autopilot e importação são exercitados DE VERDADE: o `gerarIA` é trocado por um
 * espião que guarda o system/user que o worker mandaria ao modelo.
 *
 * `worker/src/index.js` não é importável aqui (carrega @sentry/cloudflare, que só
 * existe em worker/), então os prompts dele são conferidos pelo TEXTO do arquivo.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { GUARDA_ESCOPO_IA, vozSystem, vozConversaSystem } from '../worker/src/voz.js';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { GUARDA_ESCOPO_IA as GUARDA_DO_MODULO } from '../worker/src/guardaEscopoIa.js';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { prepararPreviaAutopilot } from '../worker/src/iaAutopilot.js';
// @ts-expect-error — worker é JS puro, sem tipos; roda por type stripping.
import { prepararPreviaImportacaoIa } from '../worker/src/iaImportacao.js';

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

console.log('\n── Autopilot e importação por IA carregam a guarda (prompt real) ──');
{
  checar('voz.js reexporta o MESMO parágrafo do módulo único', GUARDA_ESCOPO_IA === GUARDA_DO_MODULO, true);
  const espiao = () => {
    const chamadas: Array<{ system: string; user: string }> = [];
    const gerarIA = async (_env: unknown, req: { system: string; user: string }) => {
      chamadas.push({ system: req.system, user: req.user });
      return '{}';
    };
    return { chamadas, gerarIA };
  };
  const user = { id: '6f1c2d3e-4a5b-4c6d-8e7f-901234567890' };
  const env = { OPENROUTER_API_KEY: 'chave-falsa' };
  const parseJsonLoose = (t: string) => { try { return JSON.parse(t); } catch { return null; } };

  const ap = espiao();
  await prepararPreviaAutopilot(JSON.stringify({ texto: 'Cliente Ana, instalação de split 12000 BTU', intencao: 'cadastro' }), env, user, { gerarIA: ap.gerarIA, parseJsonLoose });
  checar('Autopilot chamou o modelo', ap.chamadas.length, 1);
  checar('Autopilot: a guarda está no prompt enviado', ap.chamadas.some((c) => `${c.system}\n${c.user}`.includes(GUARDA_ESCOPO_IA)), true);
  checar('Autopilot: diz o que fazer ao recusar (listas vazias)', ap.chamadas.some((c) => /listas vazias/.test(`${c.system}\n${c.user}`)), true);

  const imp = espiao();
  await prepararPreviaImportacaoIa(
    JSON.stringify({ texto: 'Instalação de split 12000 BTU — R$ 800', tipo: 'servico', fontes: [{ nome: 'Tabela do fornecedor', url: 'https://exemplo.com/tabela', consultadaEm: '2026-01-01T00:00:00Z' }] }),
    env, user, { gerarIA: imp.gerarIA, parseJsonLoose },
  );
  checar('Importação chamou o modelo', imp.chamadas.length, 1);
  checar('Importação: a guarda está no system enviado', imp.chamadas.some((c) => c.system.includes(GUARDA_ESCOPO_IA)), true);
  checar('Importação: diz o que fazer ao recusar ("itens": [])', imp.chamadas.some((c) => c.system.includes('"itens": []')), true);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);
