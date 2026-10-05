/**
 * INDEXNOW (landing) — o aviso de recrawl só sai com a chave certa, só para URL realmente
 * alterada e nunca por engano de rede.
 *
 * Trava, lendo a FONTE (roda sem build e sem rede):
 *  1. a chave é válida pelo protocolo e o arquivo /<chave>.txt existe em web/public com
 *     exatamente a chave (sem ela o IndexNow responde 403);
 *  2. URL → arquivo do dist (/, /ajuda/, /legal/termos/);
 *  3. a normalização ignora o que a Cloudflare injeta, para o hash comparar só o nosso HTML;
 *  4. o plano separa nova, alterada, igual e falha, e erro de rede NÃO vira "alterada";
 *  5. o payload só leva https do nosso host, sem duplicata, no formato do protocolo;
 *  6. cada código de resposta (200/202/400/403/422/429) vira a decisão certa.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CHAVE,
  HOST,
  chaveValida,
  hash,
  interpretarResposta,
  montarPayload,
  normalizar,
  planejar,
  urlParaArquivo,
  urlsDoSitemap,
} from '../web/scripts/indexnow.mjs';

let verificacoes = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  verificacoes++;
};
const igual = (a: unknown, b: unknown, msg: string) => {
  assert.deepEqual(a, b, msg);
  verificacoes++;
};

// 1. chave + arquivo público
ok(chaveValida(CHAVE), 'a chave segue o protocolo (8 a 128, A-Za-z0-9-)');
ok(!chaveValida('curta'), 'chave curta é recusada');
ok(!chaveValida('com espaco e símbolo!'), 'chave com caractere fora do protocolo é recusada');
const arquivoChave = fileURLToPath(new URL(`../web/public/${CHAVE}.txt`, import.meta.url));
igual(readFileSync(arquivoChave, 'utf8').trim(), CHAVE, 'web/public/<chave>.txt contém exatamente a chave');

// 2. URL → arquivo do dist
igual(urlParaArquivo(`https://${HOST}/`), 'index.html', 'raiz');
igual(urlParaArquivo(`https://${HOST}/ajuda/`), 'ajuda/index.html', 'pasta com barra');
igual(urlParaArquivo(`https://${HOST}/legal/termos`), 'legal/termos/index.html', 'pasta sem barra');
igual(urlParaArquivo(`https://${HOST}/llms.txt`), 'llms.txt', 'arquivo com extensão');

// 3. normalização
const base = '<html><body><h1>Oi</h1></body></html>';
const comCloudflare = '<html><body><h1>Oi</h1><script src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script></body></html>';
igual(hash(comCloudflare), hash(base), 'script injetado em /cdn-cgi/ não muda o hash');
ok(hash('<h1>Oi</h1>') !== hash('<h1>Oi!</h1>'), 'conteúdo diferente muda o hash');
igual(normalizar('a  \r\nb\r\n'), 'a\nb', 'quebra de linha e espaço final normalizados');
igual(
  hash('<astro-island uid="1rJtEV" prefix="r1" ssr></astro-island>'),
  hash('<astro-island uid="26rUIT" prefix="r1" ssr></astro-island>'),
  'o uid aleatório da ilha do Astro (muda a cada build) não conta como mudança',
);
ok(
  hash('<astro-island uid="a" component-url="/x.js"></astro-island>') !== hash('<astro-island uid="a" component-url="/y.js"></astro-island>'),
  'mas mudar o componente da ilha conta',
);

// 4. plano
const urls = ['nova', 'mudou', 'igual', 'rede', 'quebrada', 'sem-arquivo'].map((x) => `https://${HOST}/${x}/`);
const local: Record<string, string | null> = {
  [urls[0]]: 'N',
  [urls[1]]: 'novo texto',
  [urls[2]]: 'mesmo',
  [urls[3]]: 'x',
  [urls[4]]: 'x',
  [urls[5]]: null,
};
const noAr: Record<string, { status: number; corpo: string } | 'erro'> = {
  [urls[0]]: { status: 404, corpo: '' },
  [urls[1]]: { status: 200, corpo: 'texto velho' },
  [urls[2]]: { status: 200, corpo: 'mesmo' },
  [urls[3]]: 'erro',
  [urls[4]]: { status: 500, corpo: '' },
};
const plano = await planejar(
  urls,
  (u: string) => local[u],
  async (u: string) => {
    const r = noAr[u];
    if (r === 'erro') throw new Error('timeout');
    return r as { status: number; corpo: string };
  },
);
igual(plano.novas, [urls[0]], 'página 404 no ar é nova');
igual(plano.alteradas, [urls[1]], 'hash diferente é alterada');
igual(plano.iguais, [urls[2]], 'hash igual não entra');
igual(plano.semArquivo, [urls[5]], 'sem arquivo no dist fica de fora');
igual(plano.falhas.map((f: { url: string }) => f.url), [urls[3], urls[4]], 'erro de rede e HTTP 500 viram falha');
ok(!plano.alteradas.includes(urls[3]) && !plano.novas.includes(urls[3]), 'erro de rede NÃO vira "alterada" (não sei ≠ mudou)');

// 5. payload
const p = montarPayload([`https://${HOST}/a/`, `https://${HOST}/a/`, 'http://olliorcamentos.online/b/', 'https://outro.com/c/', 'lixo']);
igual(p.urlList, [`https://${HOST}/a/`], 'só https do nosso host, sem duplicata');
igual(p.host, HOST, 'host');
igual(p.key, CHAVE, 'key');
igual(p.keyLocation, `https://${HOST}/${CHAVE}.txt`, 'keyLocation aponta para o arquivo da chave');
assert.throws(() => montarPayload(['https://olliorcamentos.online/'], { chave: 'x' }), /inválida/);
verificacoes++;
assert.throws(() => montarPayload(Array.from({ length: 10001 }, (_, i) => `https://${HOST}/p${i}/`)), /10000/);
verificacoes++;

// sitemap
const xml = `<urlset><url><loc>https://${HOST}/</loc></url><url><loc> https://${HOST}/ajuda/ </loc></url><url><loc>https://outro.com/</loc></url></urlset>`;
igual(urlsDoSitemap(xml), [`https://${HOST}/`, `https://${HOST}/ajuda/`], 'sitemap: só URLs do nosso host');

// 6. respostas
ok(interpretarResposta(200).ok && interpretarResposta(202).ok, '200 e 202 são sucesso');
for (const c of [400, 403, 422, 429, 500]) ok(!interpretarResposta(c).ok, `${c} não é sucesso`);
ok(/spam/.test(interpretarResposta(429).texto), '429 explica o risco de spam');

console.log(`teste-indexnow: ${verificacoes} verificações OK`);
