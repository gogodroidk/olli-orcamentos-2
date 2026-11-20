/**
 * SEO — 1 canônica por ofício (Camila, 07/10/2026): /eletricista/ e /refrigeracao/ (páginas de destino dos anúncios) eram
 * indexáveis, com canonical para si mesmas e no sitemap, disputando a busca com /para/eletricista/ e
 * /para/climatizacao-e-refrigeracao/. Regras travadas aqui:
 *  - a variante de anúncio continua NO AR e indexável (nada de noindex: o Pixel/UTM do marketing.ts morre em noindex) mas o
 *    canonical aponta para a página de SEO do mesmo ofício, que tem de EXISTIR (slug em SLUG_POR_OFICIO);
 *  - variantes fora do sitemap; páginas fixas com lastmod real (data válida, nunca futura).
 *
 *     node scripts/teste-seo-canonicais.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
let ok = 0;
const caso = (nome: string, fn: () => void) => {
  fn();
  ok += 1;
  console.log(`  ok  ${nome}`);
};

// D-2876: o <head> mora em components/Cabeca.astro, compartilhado por Layout e LayoutSite.
const PROMOVIDOS_NA_V10 = new Set(['marido-de-aluguel']);
const layout = ler('web/src/layouts/Layout.astro') + ler('web/src/components/Cabeca.astro');
const anuncio = ler('web/src/components/PaginaAnuncio.astro');
const config = ler('web/astro.config.mjs');
const oficios = ler('web/src/data/oficios.ts');
const slugs = new Set([...oficios.slice(oficios.indexOf('SLUG_POR_OFICIO')).matchAll(/:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]));

const PAGINAS: [string, string][] = [
  ['web/src/pages/eletricista.astro', '/para/eletricista/'],
  ['web/src/pages/refrigeracao.astro', '/para/climatizacao-e-refrigeracao/'],
];

caso('Layout aceita canonicalPath e o usa no canonical', () => {
  assert.match(layout, /canonicalPath\?: string/);
  assert.match(layout, /canonicalPath \?\? Astro\.url\.pathname/);
});

caso('PaginaAnuncio exige `canonico` e o repassa ao Layout; segue SEM noindex', () => {
  assert.match(anuncio, /canonico: string;/);
  assert.match(anuncio, /canonicalPath=\{canonico\}/);
  assert.doesNotMatch(anuncio, /<Layout[^>]*noindex/);
});

for (const [arq, canon] of PAGINAS) {
  caso(`${arq}: canonico = ${canon}, e essa página de SEO existe`, () => {
    const fonte = ler(arq);
    assert.ok(fonte.includes(`canonico="${canon}"`), 'canonico ausente ou diferente');
    assert.doesNotMatch(fonte, /noindex/);
    const slug = canon.replace(/^\/para\//, '').replace(/\/$/, '');
    assert.ok(slugs.has(slug), `slug ${slug} não existe em SLUG_POR_OFICIO`);
  });
}

caso('as variantes de anúncio ficam fora do sitemap, sem enfraquecer o filtro das rotas utilitárias', () => {
  assert.match(config, /VARIANTES_DE_ANUNCIO = \['\/eletricista\/', '\/refrigeracao\/'\]/);
  assert.match(config, /VARIANTES_DE_ANUNCIO\.includes\(caminho\)\) return false/);
  assert.match(config, /\['\/admin\/', '\/404\/', '\/excluir-conta\/'(, '\/servicos\/')?\]/);
  // /servicos/: noindex sai do sitemap; publicada entra. O teste acompanha a flag.
  const servicos = ler('web/src/data/servicos.ts');
  const lista = config.match(/\['\/admin\/'[^\]]*\]/)?.[0] ?? '';
  if (/PAGINA_PUBLICADA = false/.test(servicos)) assert.ok(lista.includes("'/servicos/'"), '/servicos/ noindex precisa sair do sitemap');
  else if (/PAGINA_PUBLICADA = true/.test(servicos)) assert.ok(!lista.includes("'/servicos/'"), '/servicos/ publicada precisa entrar no sitemap');
  else assert.fail('PAGINA_PUBLICADA não encontrado em servicos.ts');
});

caso('lastmod das páginas fixas: datas válidas (AAAA-MM-DD), nenhuma no futuro, /para/* coberto', () => {
  const datas = [...config.slice(config.indexOf('LASTMOD_PAGINAS')).matchAll(/'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  assert.ok(datas.length >= 6, 'poucas datas');
  const hoje = new Date().toISOString().slice(0, 10);
  for (const d of datas) {
    assert.ok(!Number.isNaN(Date.parse(d)), `data inválida ${d}`);
    assert.ok(d <= hoje, `data no futuro ${d}`);
  }
  assert.match(config, /startsWith\('\/para\/'\) \? LASTMOD_PARA/);
});

caso('aliases de /para/ (D-1013): cada um aponta para vertical existente, fica fora do sitemap e a página manda canonicalPath', () => {
  const pagina = ler('web/src/pages/para/[oficio].astro');
  assert.match(pagina, /canonicalPath=\{canonicalPath\}/);
  const aliases = [...oficios.matchAll(/\{ slug: '([a-z0-9-]+)', id: '([a-z_]+)'/g)];
  assert.equal(aliases.length, 5, 'esperava 5 aliases');
  for (const [, slug, id] of aliases) {
    // D-2876: "marido de aluguel" virou página própria da v10 (menu de serviços, texto próprio, canonical próprio, no sitemap).
    if (PROMOVIDOS_NA_V10.has(slug)) {
      assert.ok(!config.includes(`'/para/${slug}/'`), `${slug} foi promovido a página própria e não pode ficar em ALIASES_PARA_FORA`);
      continue;
    }
    assert.ok(config.includes(`'/para/${slug}/'`), `alias ${slug} fora de ALIASES_PARA_FORA (entraria no sitemap)`);
    assert.match(oficios, new RegExp(`\\b${id}: '[a-z0-9-]+'`), `vertical ${id} sem slug`);
  }
});

console.log(`\nteste-seo-canonicais: ${ok} casos OK`);
