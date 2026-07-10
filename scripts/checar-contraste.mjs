#!/usr/bin/env node
/**
 * Gate de contraste. Roda no `preflight`, antes do typecheck passar a impressão de
 * que está tudo bem.
 *
 * Duas verificações, porque houve duas famílias de bug — ambas com a MESMA raiz:
 * a cor foi escolhida pelo nome, não pela pergunta "o que está atrás deste texto?".
 *
 *  [1] LINT ESTÁTICO
 *      (a) `accent` usado como cor de texto/ícone. `accent` é a marca pura, sem
 *          ajuste: 2.05:1 sobre superfície clara — reprova até o limiar de ícone
 *          (3:1). O token de primeiro plano é `accentLight`, e no modo escuro os
 *          dois são idênticos, então a troca nunca piora nada.
 *      (b) tinta escura CRAVADA (`'#0A1626'`) como cor de texto/ícone. Se o fundo
 *          for um preenchimento derivado do tema, ele muda com o modo e a tinta
 *          morre. O certo é `textoSobre(<fundo>)`.
 *
 *      Exceção legítima existe (tinta escura sobre o verde do WhatsApp dá 9.16:1).
 *      Ela se declara NA PRÓPRIA LINHA, com `// contraste-ok: <motivo>`. Uma lista
 *      de exceções em arquivo separado apodrece; um comentário na linha some junto
 *      com a linha.
 *
 *  [2] PROVA DA PALETA
 *      Toda cor de marca oferecida no seletor é medida contra a paleta inteira que
 *      ela gera: 2 modos × 4 superfícies × 6 tokens de primeiro plano, mais as duas
 *      pontas dos três gradientes que carregam texto, mais o rótulo sobre o
 *      preenchimento. Nada abaixo de 4.5:1.
 */
import { execFileSync } from 'node:child_process';
import { globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ALVO = 4.5;

let falhas = 0;
const erro = (msg) => { falhas += 1; console.error(`  FALHA  ${msg}`); };

// ─── [1] lint estático ───────────────────────────────────────────────────────

const ISENTO = /\/\/\s*contraste-ok:/;
const ACCENT_FG = /\b(?:color|tintColor)\s*(?::|=\{)\s*(?:c|cores|Colors)\.accent\b(?!Light|Container)/;
const TINTA_FG = /\b(?:color|tintColor)\s*(?::|=)\s*\{?['"]#0A1626['"]\}?/;
const BRANCO_FG = /\b(?:color|tintColor)\s*(?::|=)\s*\{?['"](?:#fff|#FFF|#ffffff|#FFFFFF|white)['"]\}?/;
// Um `//` depois de `/>` NÃO é comentário: está na posição de FILHO do JSX e o texto
// aparece na tela. O tsc não reclama. Cometido uma vez; nunca mais.
const COMENTARIO_EM_JSX = /\/>\s*\/\//;
// `rgba(...)` cravado como COR DE TEXTO. Era o subtítulo do onboarding a 3.67:1 e o
// hero da Home a 1.06:1. Véu de FUNDO (`backgroundColor: 'rgba(...)'`) é legítimo e
// não casa este padrão.
const RGBA_FG = /\b(?:color|tintColor)\s*(?::|=)\s*\{?['"]rgba?\([^)]*\)['"]\}?/;
// Alfa fixo sobre a cor de um gradiente: reprova na ponta clara, porque o branco opaco
// já está em 5.02:1 no azul padrão (e 4.83:1 no vermelho). Use `sobreSecundario`, que
// desce o alfa só até onde as duas pontas aguentam.
const ALFA_FIXO_SOBRE = /comAlfa\(\s*(?:gradientes|g)\.sobre(?:Primary|Header|Brand)\s*,/;

const arquivos = globSync('{src/**/*.{ts,tsx},App.tsx}', { cwd: RAIZ })
  .filter((f) => !f.replaceAll('\\', '/').endsWith('src/theme/cores.ts'));

const brancos = [];

console.log(`[1] lint estático — ${arquivos.length} arquivos`);
for (const rel of arquivos) {
  const texto = readFileSync(join(RAIZ, rel), 'utf8');
  texto.split(/\r?\n/).forEach((linha, i) => {
    const n = i + 1;

    // Esta checagem vale MESMO em linha isenta: a isenção é sobre a cor, não sobre
    // um comentário que virou texto renderizado.
    if (COMENTARIO_EM_JSX.test(linha)) {
      erro(`${rel}:${n}  '//' depois de '/>' cai na posição de filho do JSX e RENDERIZA como texto. ` +
           `Mova o comentário para dentro da tag, junto ao atributo.`);
    }

    if (ISENTO.test(linha)) return;

    if (ACCENT_FG.test(linha)) {
      erro(`${rel}:${n}  'accent' como cor de texto/ícone. Use 'accentLight' (idêntico no escuro).`);
    }
    if (TINTA_FG.test(linha)) {
      erro(`${rel}:${n}  tinta '#0A1626' cravada como cor de texto/ícone. Use textoSobre(<fundo>), ` +
           `ou declare a exceção com  // contraste-ok: <motivo>`);
    }
    if (RGBA_FG.test(linha)) {
      erro(`${rel}:${n}  'rgba(...)' cravado como cor de texto/ícone. Sobre gradiente use ` +
           `sobreSecundario(gradientes.sobreX, gradientes.X); sobre superfície use c.onSurfaceVariant; ` +
           `sobre véu translúcido use achatarVeu(). Ou declare a exceção com  // contraste-ok: <motivo>`);
    }
    if (ALFA_FIXO_SOBRE.test(linha)) {
      erro(`${rel}:${n}  comAlfa(gradientes.sobreX, <fixo>) reprova na ponta clara do gradiente. ` +
           `Use sobreSecundario(gradientes.sobreX, gradientes.X).`);
    }
    if (BRANCO_FG.test(linha)) brancos.push(`${rel}:${n}`);
  });
}
if (falhas === 0) console.log('    nenhuma ocorrência');

// ─── [2] prova da paleta ─────────────────────────────────────────────────────

// `cores.ts` é TypeScript e não há tsx/ts-node no projeto. Compilar num temp é mais
// honesto que reimplementar a matemática do WCAG aqui e torcer para não divergir.
const saida = mkdtempSync(join(tmpdir(), 'olli-cores-'));
let cores;
try {
  // CommonJS de propósito: um `.js` com `export` num diretório temporário sem
  // package.json seria lido como CJS e explodiria no parser.
  execFileSync('npx', ['tsc', 'src/theme/cores.ts', '--ignoreConfig', '--outDir', saida,
                       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
               { cwd: RAIZ, stdio: 'pipe', shell: process.platform === 'win32' });
  cores = createRequire(import.meta.url)(join(saida, 'cores.js'));
} catch (e) {
  console.error('  FALHA  não consegui compilar src/theme/cores.ts:', e.message);
  process.exit(1);
}

const { criarPaleta, criarGradientes, contraste } = cores;

// Espelha CORES_MARCA de src/components/SeletorTema.tsx. Uma cor nova só entra no
// seletor depois de passar por aqui.
const MARCAS = [
  ['Azul OLLI', '#0B6FCE'], ['Petróleo', '#0E7490'], ['Esmeralda', '#047857'],
  ['Verde', '#15803D'], ['Índigo', '#4338CA'], ['Roxo', '#6D28D9'],
  ['Rosa', '#BE185D'], ['Vinho', '#9F1239'], ['Vermelho', '#DC2626'],
  ['Laranja', '#C2410C'], ['Terracota', '#B45309'], ['Grafite', '#374151'],
];
const SUPERFICIES = ['background', 'surface', 'surfaceVariant', 'surfaceElevated'];
const PRIMEIRO_PLANO = ['primaryLight', 'accentLight', 'success', 'danger', 'warning', 'plan'];
const GRADIENTES = [['primary', 'sobrePrimary'], ['header', 'sobreHeader'], ['brand', 'sobreBrand']];

console.log(`\n[2] prova da paleta — ${MARCAS.length} marcas × 2 modos`);
for (const [nome, hex] of MARCAS) {
  let pior = Infinity;
  let onde = '';
  const reprovar = (r, ctx) => { if (r < pior) { pior = r; onde = ctx; } };

  for (const modo of ['claro', 'escuro']) {
    const c = criarPaleta(modo, hex);
    const g = criarGradientes(modo, hex);

    for (const sup of SUPERFICIES)
      for (const tok of PRIMEIRO_PLANO)
        reprovar(contraste(c[tok], c[sup]), `${modo} ${tok} sobre ${sup}`);

    reprovar(contraste(c.onPrimary, c.primary), `${modo} onPrimary sobre primary`);

    for (const [chave, sobre] of GRADIENTES)
      for (const ponta of g[chave])
        reprovar(contraste(g[sobre], ponta), `${modo} ${sobre} sobre ponta de ${chave}`);
  }

  if (pior < ALVO) erro(`marca ${nome} (${hex}): pior par ${pior.toFixed(2)}:1 em ${onde}`);
  else console.log(`    ${nome.padEnd(12)} pior par ${pior.toFixed(2)}:1  (${onde})`);
}

// ─── [3] o invariante que amarra o seletor aos brancos cravados ──────────────
//
// Existem ~90 sítios com `color="#fff"` cravado sobre gradientes de marca (ícones
// dentro de OlliButton, sobretudo). Eles só estão corretos porque TODA cor de marca
// oferecida é escura o bastante para `textoSobre` devolver branco. Uma marca clara
// (amarelo, ciano) faria `sobre*` virar tinta escura — e os ~90 brancos quebrariam
// de uma vez, silenciosamente. Este teste prende o acoplamento: para acrescentar uma
// cor clara ao seletor é preciso ANTES eliminar os brancos cravados.
console.log('\n[3] toda marca oferecida carrega texto BRANCO nos gradientes');
for (const [nome, hex] of MARCAS) {
  for (const modo of ['claro', 'escuro']) {
    const g = criarGradientes(modo, hex);
    for (const chave of ['sobrePrimary', 'sobreHeader', 'sobreBrand']) {
      if (g[chave] !== '#FFFFFF') {
        erro(`marca ${nome} (${hex}) no modo ${modo}: ${chave} = ${g[chave]}, não branco. ` +
             `Os ~${brancos.length} '#fff' cravados no app quebrariam. Elimine-os antes de oferecer esta cor.`);
      }
    }
  }
}
if (!falhas) console.log(`    as ${MARCAS.length} marcas resolvem sobre* = #FFFFFF nos dois modos`);

// Dívida conhecida, reportada sem falhar o build: os brancos cravados estão CORRETOS
// hoje (ver [3]), mas são frágeis. Ver FOLLOWUPS: `OlliButton` deveria colorir o
// próprio ícone, o que apagaria a maior parte deles.
console.log(`\n[dívida] '#fff' cravado como cor de texto/ícone: ${brancos.length} sítios.`);
console.log(`         Corretos hoje porque [3] passa. Ver docs/FOLLOWUPS.md (itens 22 e 24).`);

rmSync(saida, { recursive: true, force: true });

console.log();
if (falhas) {
  console.error(`${falhas} falha(s) de contraste.`);
  process.exit(1);
}
console.log('contraste: tudo acima de 4.5:1.');
