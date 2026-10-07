/**
 * Parecer LEGAL 07/10/2026 sobre Pixel/Google tag/CAPI — os 3 ajustes, travados:
 *   1) o banner informa o envio server-side (e-mail em hash) e tem versão;
 *   2) a política não chama o hash de e-mail/ID de "irreversível";
 *   3) o aceite tem prova (consentimento_em + versao_texto) e REVOGA em 3 estados (ligada/desligada/indisponível).
 *
 *     node scripts/teste-consentimento-medicao.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  interpretarMedicao,
  montarMedicaoAtualizada,
  TEXTO_BANNER,
  VERSAO_TEXTO_BANNER,
} from '../web/src/lib/consentimento.ts';

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
let ok = 0;
const caso = (nome: string, fn: () => void) => {
  fn();
  ok += 1;
  console.log(`  ok  ${nome}`);
};

caso('ajuste 1: o banner diz que o e-mail vai ao Meta em código (hash) e a versão do texto subiu', () => {
  assert.match(TEXTO_BANNER, /Meta/);
  assert.match(TEXTO_BANNER, /e-mail em código \(hash\)/);
  assert.match(TEXTO_BANNER, /criar conta ou assinar/);
  assert.ok(VERSAO_TEXTO_BANNER >= 2, 'texto novo = versão nova (o antigo era a versão 1)');
  assert.match(ler('web/src/lib/consentimento.ts'), /texto\.append\(TEXTO_BANNER\)/, 'o banner usa a constante testada');
});

caso('ajuste 2: a política não promete "irreversível" para o hash do e-mail/ID e explica o Meta', () => {
  const pol = ler('src/content/legal/privacidade.ts');
  const trecho = pol.slice(pol.indexOf('Informar ao Meta'), pol.indexOf('Informar ao Meta') + 1800);
  assert.doesNotMatch(trecho, /código irreversível/);
  assert.match(trecho, /hash SHA-256\), que o Meta consegue comparar com os próprios cadastros/);
  assert.match(trecho, /controlador próprio/);
  assert.match(trecho, /Medição de anúncios/);
});

caso('ajuste 3: interpretarMedicao tem 3 estados e erro NÃO vira "desligada"', () => {
  assert.equal(interpretarMedicao(undefined).estado, 'indisponivel');
  assert.equal(interpretarMedicao(null).estado, 'indisponivel');
  assert.equal(interpretarMedicao({}).estado, 'sem_resposta', 'conta antiga/do app: não respondeu');
  assert.equal(interpretarMedicao({ medicao_anuncios: { consentimento: 'sim' } }).estado, 'ligada');
  assert.equal(interpretarMedicao({ medicao_anuncios: { consentimento: 'nao' } }).estado, 'desligada');
  assert.equal(interpretarMedicao({ medicao_anuncios: { consentimento: 'sem_resposta' } }).estado, 'sem_resposta');
  const r = interpretarMedicao({ medicao_anuncios: { consentimento: 'sim', consentimento_em: '2026-10-07T10:00:00.000Z', versao_texto: 2 } });
  assert.deepEqual([r.consentimentoEm, r.versaoTexto], ['2026-10-07T10:00:00.000Z', 2]);
});

caso('ajuste 3: desligar grava "nao" com carimbo e versão e APAGA o user agent', () => {
  const antes = { versao: 1, consentimento: 'sim', ua: 'Mozilla/5.0 X' };
  const depois = montarMedicaoAtualizada(antes, 'nao', new Date('2026-10-08T12:00:00Z'), 'Mozilla/5.0 X');
  assert.equal(depois.consentimento, 'nao');
  assert.equal(depois.consentimento_em, '2026-10-08T12:00:00.000Z');
  assert.equal(depois.versao_texto, VERSAO_TEXTO_BANNER);
  assert.equal('ua' in depois, false, 'sem consentimento não guarda o navegador');
  assert.equal(depois.versao, 1, 'preserva a versão do formato');
});

caso('ajuste 3: religar grava "sim" com o user agent; conta sem medição começa do zero', () => {
  const novo = montarMedicaoAtualizada(undefined, 'sim', new Date('2026-10-08T12:00:00Z'), 'UA-teste');
  assert.deepEqual(
    [novo.consentimento, novo.ua, novo.versao, novo.versao_texto],
    ['sim', 'UA-teste', 1, VERSAO_TEXTO_BANNER],
  );
  assert.equal(montarMedicaoAtualizada({ consentimento: 'nao' }, 'sim', new Date(), undefined).ua, undefined, 'sem UA, não inventa');
});

caso('o banco só envia com "sim": desligar para o evento pendente (cláusula do SQL intacta)', () => {
  const sql = ler('supabase/migrations/20261005090000_anuncios_conversoes.sql');
  assert.match(sql, /'medicao_anuncios' ->> 'consentimento' = 'sim'/);
});

caso('cadastro novo carimba consentimento_em/versao_texto e o painel tem o card, com 3 estados', () => {
  const mkt = ler('webapp/src/lib/marketing.ts');
  assert.match(mkt, /medicao\.consentimento_em = new Date\(\)\.toISOString\(\)/);
  assert.match(mkt, /medicao\.versao_texto = VERSAO_TEXTO_BANNER/);
  assert.match(mkt, /if \(error \|\| !data\?\.user\) return \{ estado: "indisponivel" \}/);
  assert.match(mkt, /if \(erroGravar\) throw erroGravar;\n\tgravarConsentimento\(valor\)/, 'grava na conta ANTES do cookie; falha lança');
  const card = ler('webapp/src/pages/olli/configuracoes/MedicaoAnunciosCard.tsx');
  assert.match(card, /Medição de anúncios/);
  assert.match(card, /Tentar de novo/);
  assert.match(card, /disabled=\{salvar\.isPending\}/);
  assert.match(ler('webapp/src/pages/olli/configuracoes/index.tsx'), /<MedicaoAnunciosCard \/>/);
});

console.log(`\nteste-consentimento-medicao: ${ok} casos OK`);
