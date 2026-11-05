/**
 * Cor de marca personalizada — contraste no papel, na etiqueta e no painel.
 *
 *     node scripts/teste-cor-marca.ts
 * Exit 0 = passou; 1 = falhou.
 *
 * O que prende:
 *  - as 7 cores da paleta que já passam no branco voltam idênticas (caixa inclusive);
 *  - Ciano, amarelo, branco e a cor da logo escurecem até 4,5:1 e não vazam o hex cru;
 *  - #123ABC (fixture da etiqueta pública) continua byte a byte;
 *  - lixo de CSS vira o azul OLLI e não aparece no resultado;
 *  - o painel no claro usa a cor do papel e no escuro a cor legível sobre o navy;
 *  - PDF, etiqueta, recibo, ofício, contrato e as três páginas públicas chamam
 *    a mesma função (sem uma segunda conta de contraste).
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { contraste } from '../src/theme/cores.ts';
import {
  CORES_MARCA,
  FUNDO_PAINEL_ESCURO,
  FUNDO_PAPEL,
  corMarcaNoPapel,
  corMarcaSobre,
  contrasteTextoSobre,
  tokensDaMarca,
  type MisturasMarca,
} from '../src/utils/coresMarca.ts';
import { montarHtmlEtiqueta } from '../src/utils/etiquetaQrPdf.ts';

const ALVO = 4.5;
let falhas = 0;

function ok(nome: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ok   ${nome}`);
  } catch (e) {
    falhas += 1;
    console.error(`  FALHA ${nome}\n        ${e instanceof Error ? e.message : String(e)}`);
  }
}

function semComentario(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const misturaQuePassa: MisturasMarca = {
  lighter: '#d6e8fa',
  light: '#8ec0f0',
  dark: '#084f96',
  darker: '#063868',
};

console.log('\n1) papel branco');
ok('paleta que já passa fica idêntica, com a caixa', () => {
  for (const swatch of CORES_MARCA) {
    if (swatch.value === '#19D3E6') continue;
    assert.equal(corMarcaNoPapel(swatch.value), swatch.value, swatch.label);
    assert.ok(contraste(swatch.value, FUNDO_PAPEL) >= ALVO, swatch.label);
  }
});
ok('Ciano continua na amostra e escurece só no papel', () => {
  const ciano = CORES_MARCA.find((c) => c.label === 'Ciano');
  assert.equal(ciano?.value, '#19D3E6');
  const papel = corMarcaNoPapel('#19D3E6');
  assert.notEqual(papel, '#19D3E6');
  assert.ok(contraste(papel, FUNDO_PAPEL) >= ALVO, `ciano papel ${papel} = ${contraste(papel, FUNDO_PAPEL)}`);
  assert.ok(contraste('#FFFFFF', papel) >= ALVO);
});
ok('amarelo, branco e amarelo de logo escurecem', () => {
  for (const cru of ['#FFFF00', '#FFFFFF', '#FFE566', '#fff']) {
    const papel = corMarcaNoPapel(cru);
    assert.notEqual(papel.toUpperCase(), cru.toUpperCase().length === 4 ? `#${cru[1]}${cru[1]}${cru[2]}${cru[2]}${cru[3]}${cru[3]}`.toUpperCase() : cru.toUpperCase());
    assert.ok(contraste(papel, FUNDO_PAPEL) >= ALVO, `${cru} → ${papel}`);
    assert.equal(papel, corMarcaNoPapel(papel), `idempotente ${cru}`);
  }
});
ok('#123ABC e o azul OLLI não se mexem', () => {
  assert.equal(corMarcaNoPapel('#123ABC'), '#123ABC');
  assert.equal(corMarcaNoPapel('#0B6FCE'), '#0B6FCE');
  assert.equal(corMarcaNoPapel('#0b6fce'), '#0b6fce');
});
ok('lixo de CSS não entra na cor', () => {
  for (const veneno of ['red;}</style><script>', 'red;}body{display:none', '', null, 'azul', '#GGGGGG']) {
    const papel = corMarcaNoPapel(veneno);
    assert.equal(papel, '#0B6FCE');
    assert.ok(!papel.includes('script'));
    assert.ok(!papel.includes('red'));
  }
});
ok('#RGB vira 6 dígitos (o alfa do recibo precisa de #RRGGBB)', () => {
  assert.equal(corMarcaNoPapel('#036'), '#003366');
});

console.log('\n2) swatch e superfície');
ok('check do Ciano é tinta escura; o do azul é branco', () => {
  assert.notEqual(contrasteTextoSobre('#19D3E6'), '#FFFFFF');
  assert.equal(contrasteTextoSobre('#0B6FCE'), '#FFFFFF');
});
ok('ícone ciano sobre superfície clara escurece; sobre navy pode ficar claro', () => {
  const claro = corMarcaSobre('#19D3E6', '#FFFFFF');
  const escuro = corMarcaSobre('#19D3E6', FUNDO_PAINEL_ESCURO);
  assert.notEqual(claro, '#19D3E6');
  assert.ok(contraste(claro, '#FFFFFF') >= ALVO);
  assert.equal(escuro, '#19D3E6');
  assert.ok(contraste(escuro, FUNDO_PAINEL_ESCURO) >= ALVO);
});

console.log('\n3) rampa do painel');
ok('azul no claro fica azul; no escuro clareia até ler no navy', () => {
  const claro = tokensDaMarca('#0B6FCE', misturaQuePassa, false);
  assert.equal(claro.default, '#0B6FCE');
  assert.equal(claro.dark, '#084f96');
  assert.equal(claro.foreground, '#FFFFFF');
  const escuro = tokensDaMarca('#0B6FCE', misturaQuePassa, true);
  assert.notEqual(escuro.default, '#0B6FCE');
  assert.ok(contraste(escuro.default, FUNDO_PAINEL_ESCURO) >= ALVO);
  assert.notEqual(escuro.foreground, '#FFFFFF');
});
ok('ciano no claro escurece e no escuro permanece ciano', () => {
  const claro = tokensDaMarca('#19D3E6', misturaQuePassa, false);
  assert.notEqual(claro.default.toUpperCase(), '#19D3E6');
  assert.ok(contraste(claro.default, FUNDO_PAPEL) >= ALVO);
  assert.equal(claro.foreground, '#FFFFFF');
  const escuro = tokensDaMarca('#19D3E6', misturaQuePassa, true);
  assert.equal(escuro.default, '#19D3E6');
  assert.notEqual(escuro.foreground, '#FFFFFF');
});
ok('degrau escuro que já passa não é achatado; o que falha cede', () => {
  const passa = tokensDaMarca('#0B6FCE', misturaQuePassa, false);
  assert.equal(passa.dark, '#084f96');
  assert.ok(contraste('#084f96', FUNDO_PAPEL) >= ALVO);
  const falha = tokensDaMarca('#19D3E6', { ...misturaQuePassa, dark: '#19D3E6' }, false);
  assert.notEqual(falha.dark.toUpperCase(), '#19D3E6');
  assert.ok(contraste(falha.dark, FUNDO_PAPEL) >= ALVO);
  const lightFalha = tokensDaMarca('#1C2230', { ...misturaQuePassa, light: '#1C2230' }, true);
  assert.notEqual(lightFalha.light, '#1C2230');
  assert.ok(contraste(lightFalha.light, FUNDO_PAINEL_ESCURO) >= ALVO);
});

console.log('\n4) etiqueta impressa');
ok('ciano não sai cru; azul e veneno continuam seguros', () => {
  const base = { titulo: 'AC-014', qrToken: 'tok-teste-cor-marca' };
  const ciano = montarHtmlEtiqueta(base, { corMarca: '#19D3E6' });
  const papel = corMarcaNoPapel('#19D3E6');
  assert.ok(!ciano.includes('#19D3E6'));
  assert.ok(ciano.includes(papel), papel);
  assert.ok(montarHtmlEtiqueta(base, { corMarca: '#0B6FCE' }).includes('#0B6FCE'));
  const veneno = montarHtmlEtiqueta(base, { corMarca: 'red;}</style><script>' });
  assert.ok(!veneno.includes('<script>'));
  assert.ok(veneno.includes('#0B6FCE'));
});

console.log('\n5) uma função só, nos pontos que pintam a marca');
const exige = (arquivo: string, trecho: string) => {
  const src = semComentario(readFileSync(arquivo, 'utf8'));
  assert.ok(src.includes(trecho), `${arquivo} sem ${trecho}`);
};
ok('geradores e páginas públicas chamam corMarcaNoPapel', () => {
  exige('src/utils/pdfGenerator.ts', 'corMarcaNoPapel(accentRaw ?? o.corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT)');
  exige('src/utils/etiquetaQrPdf.ts', 'corMarcaNoPapel(o.corMarca)');
  exige('src/utils/documentoBase.ts', 'corMarcaNoPapel(corMarca ?? empresa.corMarca, DEFAULT_ACCENT)');
  exige('src/utils/documentoOficioPdf.ts', 'corMarcaNoPapel(corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT)');
  exige('src/utils/reciboPdf.ts', 'corMarcaNoPapel(opts?.corMarca ?? empresa.corMarca ?? DEFAULT_ACCENT, DEFAULT_ACCENT)');
  exige('worker/src/link.js', 'corMarcaNoPapel(accentRaw, ACCENT)');
  exige('worker/src/pmoc.js', 'corMarcaNoPapel(accentRaw, ACCENT)');
  exige('worker/src/confirmacaoVisita.js', 'corMarcaNoPapel(accentRaw, ACCENT)');
});
ok('painel usa a rampa por modo e não promete cor testada', () => {
  exige('webapp/src/olli/branding.ts', 'tokensDaMarca(');
  exige('webapp/src/olli/branding.ts', 'data-theme-mode');
  exige('webapp/src/olli/branding.ts', 'hexPedido');
  const painel = readFileSync('webapp/src/pages/olli/meu-negocio/index.tsx', 'utf8');
  const app = readFileSync('src/screens/MeuNegocioScreen.tsx', 'utf8');
  assert.ok(!painel.includes('Cores testadas para o texto branco'));
  assert.ok(painel.includes('escurece só o necessário'));
  assert.ok(app.includes('escurece só o necessário'));
  exige('webapp/src/pages/olli/meu-negocio/constantes.ts', 'from "../../../../../src/utils/coresMarca"');
});
ok('botão do painel usa a tinta da marca, não branco cravado', () => {
  const arquivos = [
    'webapp/src/components/lazy/chunk-boundary.tsx',
    'webapp/src/layouts/components/search-bar.tsx',
    'webapp/src/pages/olli/equipamentos/index.tsx',
    'webapp/src/pages/olli/equipe/index.tsx',
    'webapp/src/pages/olli/ferramentas/index.tsx',
    'webapp/src/pages/olli/inicio/WelcomeHeader.tsx',
    'webapp/src/pages/olli/meu-negocio/index.tsx',
    'webapp/src/pages/olli/orcamentos/FormOrcamento.tsx',
    'webapp/src/pages/olli/planos/index.tsx',
  ];
  for (const arquivo of arquivos) {
    for (const linha of semComentario(readFileSync(arquivo, 'utf8')).split('\n')) {
      const pintaMarca = linha.includes('bg-primary') || linha.includes('from-primary');
      assert.ok(!(pintaMarca && /text-(?:common-)?white/.test(linha)), `${arquivo}: ${linha.trim()}`);
    }
  }
  const chips = semComentario(readFileSync('webapp/src/pages/olli/equipamentos/index.tsx', 'utf8'));
  assert.ok(!chips.includes('text-white/90'));
});

console.log(`\n${falhas === 0 ? 'PASSOU' : 'FALHOU'}: ${falhas} falha(s)\n`);
process.exitCode = falhas === 0 ? 0 : 1;
