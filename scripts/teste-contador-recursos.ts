/**
 * D-1438 G13 — o guia de contador é informativo, com fonte oficial,
 * e em nenhum lugar diz que a OLLI emite nota fiscal.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AVISO_NAO_EMITE as AVISO_REGRA,
  FONTE_OBRIGATORIEDADE_SIMPLES as FONTE_REGRA,
  OBRIGATORIEDADE_NFSE as OBRIGACAO_REGRA,
  URL_EMISSOR_NACIONAL as URL_REGRA,
} from '../src/utils/notaServico.ts';
import {
  AVISO_CONTADOR,
  AVISO_NAO_EMITE,
  FONTE_OBRIGATORIEDADE_SIMPLES,
  OBRIGATORIEDADE_NFSE,
  URL_EMISSOR_NACIONAL,
  hrefsContador,
  textosVisiveisContador,
} from '../src/content/contador.ts';

const ler = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), 'utf8');

assert.equal(AVISO_NAO_EMITE, AVISO_REGRA, 'o aviso curto tem de ser o da regra da nota');
assert.equal(OBRIGATORIEDADE_NFSE, OBRIGACAO_REGRA, 'as duas datas têm de ser as da regra da nota');
assert.equal(URL_EMISSOR_NACIONAL, URL_REGRA);
assert.equal(FONTE_OBRIGATORIEDADE_SIMPLES, FONTE_REGRA);
assert.ok(AVISO_CONTADOR.includes(AVISO_NAO_EMITE));
assert.match(AVISO_CONTADOR, /não emite/);
assert.match(AVISO_CONTADOR, /não substitui o seu contador/);

const textos = textosVisiveisContador();
assert.ok(textos.some((t) => t.includes('MEI')));
assert.ok(textos.some((t) => t.includes('Microempresa')));
assert.ok(textos.some((t) => /\bME\b/.test(t) || t.includes('Microempresa')));
assert.ok(textos.some((t) => t.includes('01/09/2023')));
assert.ok(textos.some((t) => t.includes('01/11/2026')));
assert.ok(textos.some((t) => t.includes('ME e EPP do Simples Nacional')));

const hrefOficial = /^https:\/\/([a-z0-9.-]+\.)?gov\.br\/|^https:\/\/www\.planalto\.gov\.br\//;
for (const href of hrefsContador()) {
  assert.match(href, hrefOficial, `fonte fora do gov.br/planalto: ${href}`);
  assert.equal(hrefsContador().filter((h) => h === href).length >= 1, true);
}

function afirmaQueEmite(texto: string): boolean {
  const semNegacao = texto.replace(/não emite/gi, '');
  return /olli emite/i.test(semNegacao)
    || /emitimos/i.test(texto)
    || /geramos (a|sua) nota/i.test(texto)
    || /nota emitida pelo olli/i.test(texto)
    || /emissão automática/i.test(texto);
}

for (const texto of textos) {
  assert.equal(afirmaQueEmite(texto), false, `texto diz que a OLLI emite: ${texto.slice(0, 140)}`);
}

const tela = ler('../src/screens/ContadorScreen.tsx');
const painel = ler('../webapp/src/pages/olli/ferramentas/ContadorRecursos.tsx');
const hub = ler('../webapp/src/pages/olli/ferramentas/index.tsx');
const ajuda = ler('../src/content/ajuda/index.ts');
const nav = ler('../src/navigation/AppNavigator.tsx');
const conta = ler('../src/screens/ContaScreen.tsx');
const grade = ler('../src/screens/desktop/FerramentasDesktopScreen.tsx');

assert.match(tela, /AVISO_CONTADOR/);
assert.match(painel, /AVISO_CONTADOR/);
assert.match(hub, /<ContadorRecursos \/>/);
assert.match(hub, /Meu INSS/);
assert.match(hub, /NFS-e padrão nacional/);
assert.match(hub, /Cursos Sebrae/);
assert.match(hub, /Confirme prazos e exigências/);
assert.match(ajuda, /id: 'contador-tipos-empresa'/);
assert.match(ajuda, /AVISO_CONTADOR/);
assert.match(ajuda, /ME e EPP do Simples Nacional a partir de 01\/11\/2026/);
assert.match(nav, /name="Contador"/);
assert.match(conta, /route: 'Contador'/);
assert.match(grade, /route: 'Contador'/);

for (const arquivo of [tela, painel, hub]) {
  assert.equal(afirmaQueEmite(arquivo), false, 'a tela não pode dizer que a OLLI emite');
}

console.log('teste-contador-recursos: guia informativo, fontes oficiais, OLLI não emite');
