/**
 * Teste da catraca de lint (`scripts/checar-lint.mjs`).
 *
 *     node scripts/teste-checar-lint.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O gate de lint só presta se a comparação com a base estiver certa. Os dois
 * jeitos de ele mentir são silenciosos: reprovar consertos (e alguém desliga o
 * gate por raiva) ou deixar passar erro novo (e o gate vira enfeite). Este
 * teste prende a lógica pura — leitura da saída do Biome, contagem e
 * comparação — sem rodar o Biome; o gate de verdade roda em `npm run lint`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error — módulo .mjs sem declaração de tipos; testado pelo comportamento.
import { ALVOS, coberturaSumiu, comparar, contar, lerDiagnosticos, total } from './checar-lint.mjs';

const RAIZ = resolve(import.meta.dirname, '..');

let falhas = 0;
let passes = 0;

function checar(nome: string, condicao: boolean, detalhe = ''): void {
  if (condicao) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}${detalhe ? `\n        ${detalhe}` : ''}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) lê a saída --reporter=github do Biome');
const SAIDA = [
  '::error title=lint/suspicious/noSelfCompare,file=src\\a.ts,line=3,endLine=3,col=1,endColumn=9::Comparing to itself is potentially pointless.',
  '::error title=lint/suspicious/noSelfCompare,file=src/a.ts,line=9,endLine=9,col=1,endColumn=9::Comparing to itself, de novo, com vírgula.',
  '::error title=lint/correctness/useExhaustiveDependencies,file=App.tsx,line=10,endLine=10,col=3,endColumn=12::This hook does not specify its dependency on x.',
  'Checked 3 files in 2ms. No fixes applied.',
  '',
].join('\r\n');
const diags = lerDiagnosticos(SAIDA);
checar('3 diagnósticos (linha de resumo ignorada)', diags.length === 3, `recebido: ${diags.length}`);
checar('barra invertida vira barra (base igual no Windows e no CI)', diags[0]?.arquivo === 'src/a.ts');
checar('linha numérica', diags[1]?.linha === 9);
checar('mensagem com vírgula preservada', diags[1]?.mensagem === 'Comparing to itself, de novo, com vírgula.');
checar('saída vazia → nenhum diagnóstico', lerDiagnosticos('').length === 0);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) conta por arquivo × regra, com chaves ordenadas');
const contagem = contar(diags);
checar('src/a.ts noSelfCompare = 2', contagem['src/a.ts']?.['lint/suspicious/noSelfCompare'] === 2);
checar('App.tsx useExhaustiveDependencies = 1', contagem['App.tsx']?.['lint/correctness/useExhaustiveDependencies'] === 1);
checar('arquivos em ordem (base não oscila entre execuções)', JSON.stringify(Object.keys(contagem)) === '["App.tsx","src/a.ts"]');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) compara com a base: sobe reprova, desce só avisa');
const BASE = { 'src/a.ts': { 'lint/x': 2 }, 'src/b.ts': { 'lint/y': 1 } };

let r = comparar(BASE, BASE);
checar('igual à base → nada novo, nada melhor', r.novos.length === 0 && r.melhoras.length === 0);

r = comparar(BASE, { 'src/a.ts': { 'lint/x': 3 }, 'src/b.ts': { 'lint/y': 1 } });
checar('contagem subiu → 1 novo', r.novos.length === 1 && r.novos[0].antes === 2 && r.novos[0].agora === 3);

r = comparar(BASE, { ...BASE, 'src/c.ts': { 'lint/x': 1 } });
checar('arquivo fora da base nasce limpo → erro nele é novo', r.novos.length === 1 && r.novos[0].arquivo === 'src/c.ts');

r = comparar(BASE, { 'src/a.ts': { 'lint/x': 2, 'lint/z': 1 }, 'src/b.ts': { 'lint/y': 1 } });
checar('regra nova em arquivo já na base → novo', r.novos.length === 1 && r.novos[0].regra === 'lint/z');

r = comparar(BASE, { 'src/a.ts': { 'lint/x': 1 } });
checar('conserto (a.ts caiu, b.ts zerou) → nunca reprova', r.novos.length === 0);
checar('conserto → 2 melhoras para apertar a base', r.melhoras.length === 2);

r = comparar(BASE, { 'src/a.ts': { 'lint/x': 1 }, 'src/b.ts': { 'lint/y': 2 } });
checar('melhora num arquivo NÃO compensa piora em outro', r.novos.length === 1 && r.novos[0].arquivo === 'src/b.ts');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3b) alvo que zerou de repente é "não sei", não "consertado"');
checar('total soma todas as contagens', total(BASE) === 3, `recebido: ${total(BASE)}`);
checar('total de alvo vazio/ausente = 0', total({}) === 0 && total(undefined) === 0);
// `includes` quebrado → Biome sai 0 com saída vazia → contagem {}. Sem a trava, passava.
checar('base com erro + atual vazio → cobertura sumiu (reprova)', coberturaSumiu(BASE, {}) === true);
checar('base com erro + atual com erro → segue a catraca normal', coberturaSumiu(BASE, { 'src/a.ts': { 'lint/x': 1 } }) === false);
checar('base já vazia + atual vazio → alvo limpo de verdade, passa', coberturaSumiu({}, {}) === false);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n4) a base versionada cobre todos os alvos');
const base = JSON.parse(readFileSync(resolve(RAIZ, 'scripts', 'lint-base.json'), 'utf8'));
for (const { nome } of ALVOS as { nome: string }[]) {
  // Alvo sem base: o gate reprova em runtime; aqui o erro aparece antes, com nome.
  checar(`scripts/lint-base.json tem o alvo \`${nome}\``, typeof base[nome] === 'object' && base[nome] !== null);
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
