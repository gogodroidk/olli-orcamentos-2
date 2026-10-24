/**
 * P0-09 · trava da copy do limite do Grátis (pré-voo LEGAL, D-0395).
 * Enquanto CORTE_GRATIS_DATA === null o Grátis é ilimitado e a copy pode dizer isso.
 * Quando a data existir, nenhuma copy escrita à mão pode dizer "ilimitado / sem cota / sem limite
 * de orçamentos" junto do Grátis — ligar o corte com esses textos é propaganda enganosa (CDC 37).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CORTE_GRATIS_DATA,
  FRASE_GRATIS,
  LIMITE_ENVIOS_GRATIS_MES,
  RECURSOS_GRATIS,
} from '../src/services/planosBase.ts';

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PROIBIDO = /orçamentos? ilimitados?|sem cota mensal|sem limite de orçamentos|não tem (prazo nem )?limite de orçamentos/i;

// Textos escritos à mão que o grep do LEGAL achou (arquivo → o que não pode sobrar).
const ESCRITOS_A_MAO = [
  'src/content/ajuda/index.ts',
  'web/src/components/PaginaAnuncio.astro',
  'web/src/components/PlanosPrecos.astro',
  'web/src/pages/eletricista.astro',
  'web/src/pages/index.astro',
  'web/src/pages/planos.astro',
];

if (CORTE_GRATIS_DATA === null) {
  // Estado de hoje: a fonte única continua dizendo a verdade de hoje (ilimitado), sem número de limite.
  assert.match(FRASE_GRATIS, /ilimitados/, 'corte desligado: Grátis ilimitado');
  assert.doesNotMatch(RECURSOS_GRATIS[0], new RegExp(`até ${LIMITE_ENVIOS_GRATIS_MES}`), 'corte desligado: não anuncia limite');
} else {
  assert.match(CORTE_GRATIS_DATA, /^\d{4}-\d{2}-\d{2}$/, 'data do corte AAAA-MM-DD');
  const [a, m, d] = CORTE_GRATIS_DATA.split('-');
  const br = `${d}/${m}/${a}`;
  for (const t of [FRASE_GRATIS, RECURSOS_GRATIS[0]]) {
    assert.doesNotMatch(t, PROIBIDO, `fonte única sem 'ilimitado' após o corte: ${t}`);
    assert.ok(t.includes(br) && t.includes(`${LIMITE_ENVIOS_GRATIS_MES}`), `fonte única traz data e número: ${t}`);
    assert.match(t, /anteriores seguem sem limite/, 'contas antigas: dito com honestidade');
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
