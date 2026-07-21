/**
 * META-TESTE: todo `scripts/teste-*.ts` tem de ser ALCANÇÁVEL pelo gate.
 *
 *     node scripts/teste-suite-completa.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * ─── O DEFEITO, MEDIDO ─────────────────────────────────────────────────────
 * O gate do app é `npm run preflight` → `npm test`. Um teste só protege alguma
 * coisa se o `npm test` o CHAMAR. Em 20/07/2026, 4 dos 29 arquivos `teste-*.ts`
 * não eram chamados por ninguém:
 *
 *   teste-isolamento-tenant.ts        tinha script, ficou FORA do agregado
 *   teste-cobranca-ia-ponta-a-ponta.ts   sem script nenhum no package.json
 *   teste-planos-fonte.ts                sem script nenhum
 *   teste-roteamento-pagamento.ts        sem script nenhum
 *
 * Os quatro passavam quando rodados à mão — e nenhum rodava no gate. Entre eles
 * estavam o teste de ISOLAMENTO ENTRE CONTAS (o P0 do sequestro de tenant e dos
 * dois bypasses do paywall) e o da COBRANÇA DE IA ponta a ponta. Escrever o
 * teste e não ligá-lo no agregado é a versão de suíte do padrão que a casa já
 * combateu no produto: **o erro vira vazio**. Um teste que não roda não é um
 * teste vermelho; é um teste que não existe, com a aparência de que existe.
 *
 * ─── POR QUE ESTE ARQUIVO, E NÃO UMA REVISÃO ATENTA ────────────────────────
 * Foi exatamente "alguém confere na revisão" que deixou passar quatro. A regra
 * é mecânica, então a checagem também tem de ser: qualquer arquivo novo em
 * `scripts/teste-*.ts` que ninguém pendurar no `npm test` derruba ESTE teste —
 * que roda no `npm test`. É a mesma técnica da seção 4 de
 * `teste-rotas-metodo.ts` (a tabela não pode se descolar do roteador que a usa).
 *
 * Um teste ainda pode ser inútil por dentro; isto não julga conteúdo. Ele fecha
 * só a falha silenciosa de acoplamento — a que não deixa rastro nenhum.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let falhas = 0;
let passes = 0;

function checar(nome: string, real: unknown, esperado: unknown): void {
  if (Object.is(real, esperado)) {
    passes++;
    console.log(`  ok   ${nome}`);
  } else {
    falhas++;
    console.error(`  FALHA ${nome}\n        esperado: ${String(esperado)}\n        recebido: ${String(real)}`);
  }
}

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const pkg = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/**
 * Nomes de script invocados por um comando. Casa `npm run <nome>` por TOKEN, não
 * por substring: `includes('npm run test:eta-saida')` casaria também com
 * `test:eta-saida-app` e daria um falso "está coberto".
 */
function invocados(comando: string): string[] {
  return [...comando.matchAll(/npm\s+run\s+([A-Za-z0-9:_-]+)/g)].map((m) => m[1]);
}

/** Fecho transitivo de scripts alcançáveis a partir de `raiz`. */
function alcancaveis(raiz: string): Set<string> {
  const vistos = new Set<string>();
  const fila = [raiz];
  while (fila.length) {
    const atual = fila.pop() as string;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    for (const proximo of invocados(pkg.scripts[atual] ?? '')) fila.push(proximo);
  }
  return vistos;
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n1) o gate encadeia preflight → test');
checar('existe o script `preflight`', typeof pkg.scripts?.preflight, 'string');
checar('existe o script `test`', typeof pkg.scripts?.test, 'string');
checar('`preflight` chama `test`', invocados(pkg.scripts.preflight).includes('test'), true);

const COBERTOS = alcancaveis('test');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n2) todo scripts/teste-*.ts é chamado por algum script alcançável');
const arquivos = readdirSync(AQUI)
  .filter((f) => f.startsWith('teste-') && f.endsWith('.ts'))
  .sort();

checar('achei arquivos de teste para conferir', arquivos.length > 0, true);

for (const arquivo of arquivos) {
  // Qual script roda ESTE arquivo? Compara o caminho de forma tolerante a
  // separador (`scripts/x.ts` vs `scripts\x.ts`) e a aspas.
  const dono = Object.keys(pkg.scripts).find((nome) => {
    const cmd = pkg.scripts[nome].replace(/\\/g, '/');
    return new RegExp(`(^|[\\s"'])scripts/${arquivo.replace(/\./g, '\\.')}([\\s"']|$)`).test(cmd);
  });
  if (!dono) {
    // Sem script nenhum: o arquivo é invisível para o gate.
    checar(`${arquivo} → tem script no package.json`, false, true);
    continue;
  }
  checar(`${arquivo} → \`${dono}\` roda no \`npm test\``, COBERTOS.has(dono), true);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n3) o agregado não referencia script que não existe');
// `npm test` para no primeiro `&&` que falhar; um nome errado aqui derruba o
// gate inteiro com "Missing script", escondendo o resultado dos seguintes.
for (const nome of COBERTOS) {
  if (nome === 'test') continue;
  checar(`\`${nome}\` está definido`, typeof pkg.scripts[nome], 'string');
}

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${passes} ok, ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
