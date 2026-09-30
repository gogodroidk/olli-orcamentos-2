/**
 * Teste do "Pagar com Pix" + "Já paguei" no link público (`src/link.js`).
 *
 *     node scripts/teste-link-pix.js   (de dentro de worker/)
 *
 * Protege: o Pix só aparece DEPOIS de aprovado e só com chave reconhecida e código
 * válido (CRC); "Já paguei" só avisa (não muda status) e só em link aprovado; banco
 * sem a coluna nova = botão escondido e POST "recurso_desligado" (nunca finge);
 * nada do prestador entra no HTML sem escape.
 */
import assert from 'node:assert/strict';
import { pixDaPagina, renderLinkPage, responderLink } from '../src/link.js';
import { pixCopiaEColaValido } from '../../src/utils/pixBrCode.ts';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv';
const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
});

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok++;
  console.log(`  ok  ${nome}`);
}

/**
 * Supabase de mentira: guarda UMA linha de orcamentos_publicos e registra cada
 * chamada. `semColuna` simula o banco antes da migration (PostgREST 400 quando o
 * select/patch cita pagamento_informado_em).
 */
function supabaseFalso(linha, { semColuna = false } = {}) {
  const chamadas = [];
  const eventos = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const metodo = init.method || 'GET';
    chamadas.push({ metodo, url: u, body: init.body });
    const citaColuna = u.includes('pagamento_informado_em') || String(init.body || '').includes('pagamento_informado_em');
    if (semColuna && citaColuna) return new Response('{"code":"42703"}', { status: 400 });
    if (u.includes('/eventos_orcamento_publico')) {
      if (metodo === 'POST') {
        eventos.push(JSON.parse(init.body));
        return new Response('', { status: 201 });
      }
      return Response.json([{ id: 1 }]); // "já visualizado hoje": não grava de novo
    }
    if (u.includes('/orcamentos_publicos')) {
      if (metodo === 'GET') return Response.json(linha ? [linha] : []);
      if (metodo === 'PATCH') {
        const patch = JSON.parse(init.body);
        if ('pagamento_informado_em' in patch) {
          const aceita = linha && linha.status === 'aprovado' && !linha.pagamento_informado_em;
          if (!aceita) return Response.json([]);
          Object.assign(linha, patch);
          return Response.json([linha]);
        }
        return Response.json([]);
      }
    }
    return new Response('nao esperado', { status: 500 });
  };
  return { chamadas, eventos };
}

function linhaBase(extra = {}) {
  return {
    token: TOKEN,
    status: 'aprovado',
    cliente_nome: 'Maria',
    prestador_nome: 'Frio Bom',
    prestador_whatsapp: '11999990000',
    numero: '2026-0012',
    valor_total: 350,
    resposta_cliente: null,
    pagamento_informado_em: null,
    dados: {
      numero: '2026-0012',
      clienteNome: 'Maria',
      valorTotal: 350,
      itens: [{ nome: 'Limpeza de split', quantidade: 1, unidade: 'un', preco: 350, subtotal: 350 }],
      prestador: { nome: 'Frio Bom', whatsapp: '11999990000' },
      pix: { chave: '52998224725', nome: 'Frio Bom', cidade: 'Campinas' },
    },
    ...extra,
  };
}

const req = (metodo = 'GET', corpo) =>
  new Request(`https://link.exemplo/o/${TOKEN}`, {
    method: metodo,
    headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'teste', 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

async function pagina(linha, opcoes) {
  supabaseFalso(linha, opcoes);
  const r = await renderLinkPage(TOKEN, ENV, req());
  return { status: r.status, html: await r.text() };
}

/** O código dentro do <textarea id="pixCodigo"> (desescapado). */
function codigoDaPagina(html) {
  const m = /<textarea id="pixCodigo"[^>]*>([^<]*)<\/textarea>/.exec(html);
  return m ? m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') : null;
}

await caso('aprovado + chave válida: mostra Pix com o valor, QR e "Já paguei"', async () => {
  const { status, html } = await pagina(linhaBase());
  assert.equal(status, 200);
  assert.match(html, />Pagar com Pix</);
  assert.match(html, /R\$ 350,00/);
  const codigo = codigoDaPagina(html);
  assert.ok(codigo && pixCopiaEColaValido(codigo), 'código na página passa na conferência EMV+CRC');
  assert.ok(codigo.includes('5406350.00'), 'valor do orçamento embutido');
  assert.ok(codigo.includes('011152998224725'), 'chave do prestador');
  assert.match(html, /<svg[^>]*aria-label="QR code do Pix"/);
  assert.match(html, /id="btnPaguei"/);
  assert.match(html, /só avisa Frio Bom/);
});

await caso('antes de aprovar: nada de Pix na página', async () => {
  const { html } = await pagina(linhaBase({ status: 'enviado' }));
  assert.doesNotMatch(html, />Pagar com Pix</);
  assert.equal(codigoDaPagina(html), null);
  assert.match(html, /Aprovar orçamento/);
});

await caso('recusado: nada de Pix', async () => {
  const { html } = await pagina(linhaBase({ status: 'recusado' }));
  assert.doesNotMatch(html, />Pagar com Pix</);
});

await caso('aprovado SEM chave (ou chave duvidosa): não inventa meio de pagamento', async () => {
  for (const pix of [undefined, null, { chave: '' }, { chave: 'meu pix' }, { chave: '<script>alert(1)</script>' }]) {
    const linha = linhaBase();
    linha.dados.pix = pix;
    const { html } = await pagina(linha);
    assert.doesNotMatch(html, />Pagar com Pix</);
    assert.doesNotMatch(html, /id="btnPaguei"/);
    assert.match(html, /Combine a forma de pagamento diretamente com Frio Bom/);
    assert.doesNotMatch(html, /<script>alert/);
  }
});

await caso('valor zerado: sem Pix', async () => {
  assert.equal(pixDaPagina(linhaBase().dados, 0, '1'), null);
  assert.equal(pixDaPagina(linhaBase().dados, 'abc', '1'), null);
});

await caso('banco sem a coluna nova: Pix aparece, "Já paguei" fica desligado', async () => {
  const { status, html } = await pagina(linhaBase(), { semColuna: true });
  assert.equal(status, 200);
  assert.match(html, />Pagar com Pix</);
  assert.doesNotMatch(html, /id="btnPaguei"/);
  supabaseFalso(linhaBase(), { semColuna: true });
  const r = await responderLink(TOKEN, req('POST', { acao: 'informar_pagamento' }), ENV);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).erro, 'recurso_desligado');
});

await caso('"Já paguei" em link aprovado: carimba 1x, grava evento e NÃO muda status', async () => {
  const linha = linhaBase();
  const { chamadas, eventos } = supabaseFalso(linha);
  const r = await responderLink(TOKEN, req('POST', { acao: 'informar_pagamento' }), ENV);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, pagamentoInformado: true });
  assert.equal(linha.status, 'aprovado', 'status intacto: quem confirma é o prestador');
  assert.ok(linha.pagamento_informado_em);
  const patch = chamadas.find(c => c.metodo === 'PATCH');
  assert.match(patch.url, /status=eq\.aprovado/);
  assert.match(patch.url, /pagamento_informado_em=is\.null/);
  assert.deepEqual(Object.keys(JSON.parse(patch.body)), ['pagamento_informado_em']);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].evento, 'pagamento_informado');
  assert.notEqual(eventos[0].ip_hash, '203.0.113.9', 'IP nunca cru');
});

await caso('"Já paguei" de novo: idempotente, sem novo PATCH nem evento', async () => {
  const linha = linhaBase({ pagamento_informado_em: '2026-09-30T13:00:00Z' });
  const { chamadas, eventos } = supabaseFalso(linha);
  const r = await responderLink(TOKEN, req('POST', { acao: 'informar_pagamento' }), ENV);
  assert.equal((await r.json()).jaInformado, true);
  assert.equal(chamadas.filter(c => c.metodo === 'PATCH').length, 0);
  assert.equal(eventos.length, 0);
});

await caso('"Já paguei" em link NÃO aprovado: recusado (409)', async () => {
  supabaseFalso(linhaBase({ status: 'enviado' }));
  const r = await responderLink(TOKEN, req('POST', { acao: 'informar_pagamento' }), ENV);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).erro, 'nao_aprovado');
});

await caso('depois do aviso: página diz que o prestador vai conferir (não diz "pago")', async () => {
  const { html } = await pagina(linhaBase({ pagamento_informado_em: '2026-09-30T13:00:00Z' }));
  assert.match(html, /Você avisou que pagou em 30\/09\/2026/);
  assert.match(html, /vai conferir e confirmar/);
  assert.doesNotMatch(html, /id="btnPaguei"/);
  assert.doesNotMatch(html, /Pagamento confirmado/);
});

await caso('nome do prestador com HTML é escapado no bloco do Pix', async () => {
  const linha = linhaBase();
  linha.dados.prestador.nome = '<img src=x onerror=alert(1)>';
  const { html } = await pagina(linha);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

console.log(`\nteste-link-pix: ${ok} casos OK`);
