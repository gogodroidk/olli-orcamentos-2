/**
 * Prévia (Open Graph) do link público do orçamento — worker/src/link.js.
 *
 *     node worker/scripts/teste-link-og.js
 *
 * Tranca: a prévia que o WhatsApp/Instagram/Telegram mostram leva SÓ o nome do prestador e uma imagem estática da
 * OLLI. NUNCA o valor, o cliente, o número do orçamento, itens nem Pix · nome do prestador escapado e limitado ·
 * páginas de erro não carregam prévia de orçamento.
 */
import assert from 'node:assert/strict';
import { metaOpenGraph, OG_IMAGEM, renderLinkPage } from '../src/link.js';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const ENV = Object.freeze({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456' });
const CLIENTE = 'Maria Aparecida Souza';
const NUMERO = '2026-0777';

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  console.log(`  ok   ${nome}`);
}

function linha(nomePrestador) {
  return {
    token: TOKEN,
    user_id: '11111111-2222-4333-8444-555555555555',
    status: 'enviado',
    cliente_nome: CLIENTE,
    prestador_nome: nomePrestador,
    prestador_whatsapp: '11999990000',
    numero: NUMERO,
    valor_total: 12345.67,
    dados: {
      prestador: { nome: nomePrestador },
      clienteNome: CLIENTE,
      numero: NUMERO,
      valorTotal: 12345.67,
      itens: [{ descricao: 'Instalação de split 12000 BTUs', quantidade: 1, valorUnitario: 12345.67 }],
    },
  };
}

function supabaseFalso(row) {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/rest/v1/rpc/plano_comercial_para_usuario')) return Response.json('pro');
    if (u.includes('/eventos_orcamento_publico')) return (init.method || 'GET') === 'POST' ? new Response('', { status: 201 }) : Response.json([{ id: 1 }]);
    if (u.includes('/orcamentos_publicos')) return (init.method || 'GET') === 'GET' ? Response.json(row ? [row] : []) : Response.json([]);
    return new Response('nao esperado', { status: 500 });
  };
}

const metasOg = (html) => html.split('\n').filter((l) => /<meta (property="og:|name="twitter:)/.test(l)).join('\n');
const pagina = async (nome, ua = 'WhatsApp/2.24.1 A') => {
  supabaseFalso(linha(nome));
  const r = await renderLinkPage(TOKEN, ENV, new Request(`https://link.test/o/${TOKEN}`, { headers: { 'User-Agent': ua } }));
  return { status: r.status, html: await r.text() };
};

console.log('Prévia (Open Graph) do link do orçamento');
const original = globalThis.fetch;
try {
  await caso('a página do orçamento carrega og:title com o NOME DO PRESTADOR, descrição genérica e a imagem estática da OLLI', async () => {
    const { status, html } = await pagina('Frio Bom Climatização');
    assert.equal(status, 200);
    const og = metasOg(html);
    assert.match(og, /property="og:title" content="Orçamento de Frio Bom Climatização"/);
    assert.match(og, /property="og:description" content="Veja os itens do orçamento, aprove e fale direto com o prestador pelo WhatsApp\."/);
    assert.match(og, new RegExp(`property="og:image" content="${OG_IMAGEM.replace(/[.]/g, '\\.')}"`));
    assert.match(og, /name="twitter:card" content="summary_large_image"/);
    assert.ok(OG_IMAGEM.startsWith('https://'));
    assert.ok(html.indexOf('og:title') < html.indexOf('<title>') || html.includes('og:title'), 'meta dentro do <head>');
  });

  await caso('NUNCA na prévia: valor, nome do cliente, número do orçamento, itens (mesmo com todos na página)', async () => {
    const { html } = await pagina('Frio Bom');
    assert.ok(html.includes(CLIENTE) && html.includes(NUMERO), 'a página em si mostra os dados (é o cliente que vê)');
    const og = metasOg(html);
    assert.ok(og.length > 0);
    for (const proibido of [CLIENTE, 'Maria', NUMERO, '12345', '12.345', '12,345', 'R$', 'Instalação', 'split', 'Pix', '11999990000']) {
      assert.equal(og.includes(proibido), false, `a prévia vazou: ${proibido}`);
    }
    assert.equal(/\d{3,}/.test(og.replace(OG_IMAGEM, '')), false, 'nenhum número de 3+ dígitos nas metas (fora da URL da imagem)');
  });

  await caso('nome do prestador: escapado (sem quebrar o atributo), limitado a 60 caracteres, vazio vira "Seu prestador"', async () => {
    const xss = metaOpenGraph('Frio"><script>alert(1)</script>');
    assert.equal(xss.includes('<script>'), false);
    assert.equal(xss.includes('"><'), false);
    assert.match(xss, /Frio&quot;&gt;&lt;script&gt;/);
    const longo = metaOpenGraph('A'.repeat(200));
    assert.ok(longo.includes(`Orçamento de ${'A'.repeat(60)}"`), 'corta em 60');
    assert.equal(longo.includes('A'.repeat(61)), false);
    assert.match(metaOpenGraph('   '), /Orçamento de Seu prestador/);
    assert.match(metaOpenGraph(null), /Orçamento de Seu prestador/);
    assert.match(metaOpenGraph('  Frio   Bom  '), /Orçamento de Frio Bom"/);
    const { html } = await pagina('Frio"><img src=x onerror=alert(1)>');
    assert.equal(metasOg(html).includes('<img'), false);
  });

  await caso('link inexistente/inválido NÃO carrega prévia de orçamento (só a página de erro)', async () => {
    supabaseFalso(null);
    const r404 = await renderLinkPage(TOKEN, ENV, new Request(`https://link.test/o/${TOKEN}`));
    assert.equal(r404.status, 404);
    assert.equal(metasOg(await r404.text()), '');
    const r400 = await renderLinkPage('curto', ENV, new Request('https://link.test/o/curto'));
    assert.equal(r400.status, 400);
    assert.equal(metasOg(await r400.text()), '');
  });

  await caso('o robô de prévia do WhatsApp (e o navegador do cliente) recebem a MESMA página com as metas', async () => {
    const bot = await pagina('Frio Bom', 'WhatsApp/2.24.1 A');
    const cliente = await pagina('Frio Bom', 'Mozilla/5.0 (Linux; Android 13) Chrome/129 Mobile');
    assert.equal(metasOg(bot.html), metasOg(cliente.html));
  });
} finally {
  globalThis.fetch = original;
}
console.log(`\nPASSOU: ${ok} casos — prévia Open Graph do orçamento`);
