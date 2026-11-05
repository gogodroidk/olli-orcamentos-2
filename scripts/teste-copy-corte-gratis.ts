/**
 * P0-09 · trava da copy do limite do Grátis (pré-voo LEGAL, D-0395).
 * Enquanto CORTE_GRATIS_DATA === null o Grátis é ilimitado e a copy pode dizer isso.
 * Quando a data existir, nenhuma copy escrita à mão pode dizer "ilimitado / sem cota / sem limite
 * de orçamentos" junto do Grátis — ligar o corte com esses textos é propaganda enganosa (CDC 37).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CELULA_ORCAMENTOS_GRATIS,
  CORTE_ANTIGAS_DATA,
  CORTE_GRATIS_PUBLICADO_EM,
  PARAGRAFO_LIMITE_TERMOS,
  diaExtenso,
  CORTE_GRATIS_DATA,
  FRASE_GRATIS,
  FRASE_GRATIS_CURTA,
  GRATIS_CONDICAO,
  GRATIS_LINHA_ANUNCIO,
  PREVIEW_EMAIL_GRATIS,
  LIMITE_ENVIOS_GRATIS_MES,
  RECURSOS_GRATIS,
} from '../src/services/planosBase.ts';

function dataCorteBR(iso: string): string { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PROIBIDO = /orçamentos? ilimitados?|sem cota mensal|sem limite de orçamentos|não tem (prazo nem )?limite de orçamentos/i;

// Textos escritos à mão que o grep do LEGAL achou (arquivo → o que não pode sobrar).
// Cada arquivo abaixo LÊ a constante do corte (não pode voltar a ter o texto à mão).
const DEVE_USAR: Record<string, RegExp> = {
  'src/content/ajuda/index.ts': /FRASE_GRATIS_CURTA/,
  'web/src/components/PaginaAnuncio.astro': /GRATIS_LINHA_ANUNCIO/,
  'web/src/components/PlanosPrecos.astro': /FRASE_GRATIS_CURTA/,
  'web/src/pages/eletricista.astro': /GRATIS_LINHA_ANUNCIO/,
  'src/screens/PlanosScreen.tsx': /gratis: CELULA_ORCAMENTOS_GRATIS/,
  'worker/src/emailLembretesTemplate.js': /preview: PREVIEW_EMAIL_GRATIS/,
  // AEO (PR #262): Resposta curta, FAQ e CTA das /para/<ofício> e o llms.txt leem a regra do Grátis da fonte.
  'web/src/pages/para/[oficio].astro': /GRATIS_CONDICAO[\s\S]*FRASE_GRATIS_CURTA[\s\S]*TRIAL_PRO_DIAS/,
  'web/src/pages/llms.txt.ts': /GRATIS_CONDICAO[\s\S]*TRIAL_PRO_DIAS/,
};
for (const arq of ['web/src/pages/para/[oficio].astro', 'web/src/pages/llms.txt.ts']) {
  const src = ler(arq);
  // "permanente" e "14 dias" digitados à mão viram promessa sem fonte (CDC): a constante é a única origem.
  assert.doesNotMatch(src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n'), /permanente|\b14 dias\b/i, `${arq}: 'permanente'/'14 dias' escritos à mão`);
}
assert.equal(GRATIS_CONDICAO, 'sem cartão e sem prazo');
// a regra "sem cartão e sem cobrança automática" do trial tem fonte no texto de ativação do app
assert.match(ler('src/services/ativacao.ts'), /Sem cartão e sem cobrança automática/, 'regra do trial sem cartão mudou: revisar FAQ e llms.txt do AEO');
for (const [arq, re] of Object.entries(DEVE_USAR)) assert.match(ler(arq), re, `${arq} precisa ler a constante do corte`);

const ESCRITOS_A_MAO = [
  'src/content/ajuda/index.ts',
  'web/src/components/PaginaAnuncio.astro',
  'web/src/components/PlanosPrecos.astro',
  'web/src/pages/eletricista.astro',
  'web/src/pages/index.astro',
  'web/src/pages/planos.astro',
  'web/src/pages/para/[oficio].astro',
  'web/src/pages/llms.txt.ts',
];

// O número da copy tem que ser o do banco (default da coluna `limite`) — nunca divergir.
assert.match(ler('supabase/migrations/20261024120000_limite_gratis_5_contas_novas.sql'), new RegExp(`limite integer not null default ${LIMITE_ENVIOS_GRATIS_MES}\\b`), 'LIMITE_ENVIOS_GRATIS_MES = default do banco');
// termos.ts usa import sem extensão (bundler): o node puro não o carrega, então a ligação é checada no texto.
const termosFonte = ler('src/content/legal/termos.ts');
assert.match(termosFonte, /\.\.\.\(PARAGRAFO_LIMITE_TERMOS === null \? \[\] : \[PARAGRAFO_LIMITE_TERMOS\]\)/, 'Termos §4 insere o parágrafo do limite');
assert.match(termosFonte, /atualizadoEm: ATUALIZADO_EM/, 'Termos usam a data derivada');
assert.match(termosFonte, /diaExtenso\(CORTE_GRATIS_PUBLICADO_EM\)/, 'data dos Termos vem da publicação');
assert.match(termosFonte, /'2 de novembro de 2026'/, 'fallback dos Termos continua 2 de novembro de 2026');
assert.doesNotMatch(termosFonte, /'2 de outubro de 2026'/, 'Termos não voltam para 2 de outubro de 2026');

if (CORTE_GRATIS_DATA === null) {
  assert.equal(PARAGRAFO_LIMITE_TERMOS, null, 'corte desligado: Termos sem o parágrafo do limite');
  assert.equal(CORTE_GRATIS_PUBLICADO_EM, null, 'corte desligado: sem data de publicação');
  assert.equal(CORTE_ANTIGAS_DATA, null, 'corte desligado: antigas também sem data');
  // Estado de hoje: a fonte única continua dizendo a verdade de hoje (ilimitado), sem número de limite.
  assert.match(FRASE_GRATIS, /ilimitados/, 'corte desligado: Grátis ilimitado');
  assert.equal(CELULA_ORCAMENTOS_GRATIS, 'Ilimitados', 'corte desligado: tabela igual à de hoje');
  assert.match(GRATIS_LINHA_ANUNCIO, /ilimitados/, 'corte desligado: anúncio igual ao de hoje');
  assert.match(FRASE_GRATIS_CURTA, /^orçamentos ilimitados$/);
  assert.match(PREVIEW_EMAIL_GRATIS, /ilimitados/);
  assert.doesNotMatch(RECURSOS_GRATIS[0], new RegExp(`até ${LIMITE_ENVIOS_GRATIS_MES}`), 'corte desligado: não anuncia limite');
} else {
  assert.match(CORTE_GRATIS_DATA, /^\d{4}-\d{2}-\d{2}$/, 'data do corte AAAA-MM-DD');
  assert.ok(CORTE_GRATIS_PUBLICADO_EM !== null && CORTE_GRATIS_PUBLICADO_EM < CORTE_GRATIS_DATA, 'publicação dos Termos definida e ANTES do corte');
  assert.ok(CORTE_ANTIGAS_DATA !== null, 'com corte das novas, o das antigas também (ordem do Igor 24/10)');
  const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  assert.ok(dias(CORTE_GRATIS_PUBLICADO_EM!, CORTE_ANTIGAS_DATA!) >= 30, 'aviso às antigas com pelo menos 30 dias (parecer LEGAL 24/10)');
  assert.ok(!/seguem sem limite|sem limite/i.test([FRASE_GRATIS, RECURSOS_GRATIS[0], FRASE_GRATIS_CURTA, GRATIS_LINHA_ANUNCIO, CELULA_ORCAMENTOS_GRATIS].join(' ')), "nenhuma copy diz 'anteriores seguem sem limite'");
  assert.match(PARAGRAFO_LIMITE_TERMOS ?? '', /depois de ver o aviso/, 'Termos: antiga só é limitada depois de ver o aviso');
  assert.ok(PARAGRAFO_LIMITE_TERMOS !== null);
  assert.ok(PARAGRAFO_LIMITE_TERMOS.includes(diaExtenso(CORTE_GRATIS_DATA)), 'parágrafo do limite com a data do corte por extenso');
  assert.match(PARAGRAFO_LIMITE_TERMOS!, /5 \(cinco\) orçamentos por mês/);
  const [a, m, d] = CORTE_GRATIS_DATA.split('-');
  const br = `${d}/${m}/${a}`;
  for (const t of [FRASE_GRATIS_CURTA, GRATIS_LINHA_ANUNCIO, CELULA_ORCAMENTOS_GRATIS, PREVIEW_EMAIL_GRATIS]) {
    assert.doesNotMatch(t, /ilimitad|sem cota|sem limite de or/i, `constante derivada sem 'ilimitado' após o corte: ${t}`);
  }
  for (const t of [FRASE_GRATIS, RECURSOS_GRATIS[0]]) {
    assert.doesNotMatch(t, PROIBIDO, `fonte única sem 'ilimitado' após o corte: ${t}`);
    assert.ok(t.includes(br) && t.includes(`${LIMITE_ENVIOS_GRATIS_MES}`), `fonte única traz data e número: ${t}`);
    assert.ok(t.includes(dataCorteBR(CORTE_ANTIGAS_DATA!)), 'copy traz a data das antigas');
  }
  for (const arq of ESCRITOS_A_MAO) {
    const achados = ler(arq).split('\n').map((l, i) => [i + 1, l] as const).filter(([, l]) => PROIBIDO.test(l));
    assert.deepEqual(achados, [], `${arq} ainda diz ilimitado após o corte (linhas ${achados.map(([i]) => i).join(', ')})`);
  }
}

// Em qualquer estado: a fonte única não promete "ilimitado" E "até N por mês" ao mesmo tempo.
for (const t of [FRASE_GRATIS, RECURSOS_GRATIS[0]]) {
  assert.ok(!(/ilimitados/.test(t) && new RegExp(`até ${LIMITE_ENVIOS_GRATIS_MES}`).test(t)), `copy contraditória: ${t}`);
}
console.log(`teste-copy-corte-gratis ok (corte ${CORTE_GRATIS_DATA ?? 'desligado'})`);
