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
import { pixDaPagina, regrasDaPagina, renderLinkPage, responderLink, validadeVencida, valorDoPix } from '../src/link.js';
import { pixCopiaEColaValido } from '../../src/utils/pixBrCode.ts';
import { cobrancaDoLink, prepararCobranca } from '../../src/utils/cobrancaCliente.ts';

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
/**
 * `plano` = o que a RPC `plano_comercial_para_usuario` devolve para o DONO do link.
 * Padrão 'pro' (o Pix no link é recurso do Pro — `link_pagamento`); `null` simula
 * a RPC falhando (500), que é o terceiro estado da página.
 */
function supabaseFalso(linha, { semColuna = false, plano = 'pro' } = {}) {
  const chamadas = [];
  const eventos = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const metodo = init.method || 'GET';
    chamadas.push({ metodo, url: u, body: init.body });
    if (u.endsWith('/rest/v1/rpc/plano_comercial_para_usuario')) {
      if (plano === null) return new Response('{"message":"erro"}', { status: 500 });
      return Response.json(plano);
    }
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
          // Respeita o filtro da QUERY (como o PostgREST): aprovado pelo cliente, ou
          // fechado pelo prestador (dados->>cobrarAgora) sem recusa.
          const porStatus = u.includes('status=eq.aprovado') && linha?.status === 'aprovado';
          const porPrestador =
            u.includes('dados->>cobrarAgora=eq.true') &&
            u.includes('status=neq.recusado') &&
            linha?.dados?.cobrarAgora === true &&
            linha?.status !== 'recusado';
          const aceita = linha && (porStatus || porPrestador) && !linha.pagamento_informado_em;
          if (!aceita) return Response.json([]);
          Object.assign(linha, patch);
          return Response.json([linha]);
        }
        if ('status' in patch) {
          const aceita = linha && linha.status !== 'aprovado' && linha.status !== 'recusado';
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
    user_id: '11111111-2222-4333-8444-555555555555',
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

/* ═══════════ 1.9 — Pix estático funcionando no fluxo real ═══════════ */

/** O valor embutido no BR Code (campo 54, logo depois da moeda 5303986). */
function valorDoCodigo(codigo) {
  const m = /530398654(\d{2})/.exec(codigo || '');
  if (!m) return null;
  const inicio = m.index + m[0].length;
  return codigo.slice(inicio, inicio + Number(m[1]));
}

await caso('fechado pelo PRESTADOR no app (cobrarAgora): Pix sem o cliente aprovar de novo', async () => {
  const linha = linhaBase({ status: 'enviado' });
  Object.assign(linha.dados, { statusApp: 'aprovado', cobrarAgora: true, valorACobrar: 350, cobrancaTipo: 'total' });
  const { html } = await pagina(linha);
  assert.match(html, />Pagar com Pix</);
  assert.match(html, /Orçamento aprovado/);
  assert.match(html, /Frio Bom confirmou este serviço com você/);
  assert.doesNotMatch(html, /id="btnAprovar"/, 'não pede aprovação de novo');
  assert.ok(pixCopiaEColaValido(codigoDaPagina(html)));
});

await caso('recusa registrada vence o cobrarAgora: nada de Pix para quem recusou', async () => {
  const linha = linhaBase({ status: 'recusado' });
  Object.assign(linha.dados, { cobrarAgora: true, valorACobrar: 350 });
  const { html } = await pagina(linha);
  assert.doesNotMatch(html, />Pagar com Pix</);
  assert.match(html, /Orçamento recusado/);
});

await caso('saldo: cliente que pagou parte vê o Pix SÓ do que falta', async () => {
  const linha = linhaBase();
  Object.assign(linha.dados, { statusApp: 'aprovado', cobrarAgora: true, valorACobrar: 150, cobrancaTipo: 'saldo' });
  const { html } = await pagina(linha);
  assert.match(html, /<div class="pix-valor">R\$ 150,00<\/div>/);
  assert.match(html, /Saldo em aberto/);
  assert.match(html, /Total do orçamento: R\$ 350,00/);
  const codigo = codigoDaPagina(html);
  assert.ok(pixCopiaEColaValido(codigo));
  assert.equal(valorDoCodigo(codigo), '150.00');
});

await caso('entrada (sinal): cobra a entrada e diz que é a entrada', async () => {
  const linha = linhaBase();
  Object.assign(linha.dados, { valorACobrar: 105, cobrancaTipo: 'sinal', sinal: { valor: 105, percentual: 30, data: '' } });
  const { html } = await pagina(linha);
  assert.match(html, /<div class="pix-valor">R\$ 105,00<\/div>/);
  assert.match(html, /<strong>Entrada<\/strong>/);
  assert.equal(valorDoCodigo(codigoDaPagina(html)), '105.00');
});

await caso('valorACobrar acima do total: teto no total (nunca cobra a mais)', async () => {
  const linha = linhaBase();
  linha.dados.valorACobrar = 9999;
  const { html } = await pagina(linha);
  assert.equal(valorDoCodigo(codigoDaPagina(html)), '350.00');
});

await caso('valorACobrar null (app não soube quanto já foi pago): sem Pix, nunca o total', async () => {
  const linha = linhaBase();
  linha.dados.valorACobrar = null;
  const { html } = await pagina(linha);
  assert.doesNotMatch(html, />Pagar com Pix</);
  assert.match(html, /Combine a forma de pagamento diretamente com Frio Bom/);
  assert.equal(valorDoPix({ valorACobrar: null }, 350), null);
  assert.equal(valorDoPix({ valorACobrar: 'abc' }, 350), null);
});

await caso('snapshot antigo (sem valorACobrar): continua cobrando o total', async () => {
  assert.equal(valorDoPix({}, 350), 350);
  assert.equal(valorDoPix({ pix: {} }, '350.004'), 350);
});

await caso('quitado (valorACobrar 0): diz que o pagamento já foi registrado, sem Pix', async () => {
  const linha = linhaBase();
  linha.dados.valorACobrar = 0;
  const { html } = await pagina(linha);
  assert.doesNotMatch(html, />Pagar com Pix</);
  assert.match(html, /Frio Bom já registrou o pagamento deste orçamento/);
  assert.doesNotMatch(html, /id="btnPaguei"/);
});

await caso('fechado no app sem valor a cobrar (quitado ou recebido ilegível): NÃO pede "Aprovar" de novo', async () => {
  for (const valorACobrar of [0, null]) {
    const linha = linhaBase({ status: 'enviado' });
    Object.assign(linha.dados, { statusApp: 'aprovado', cobrarAgora: false, valorACobrar });
    const { html } = await pagina(linha);
    assert.doesNotMatch(html, /id="btnAprovar"/, `valorACobrar ${valorACobrar}: sem botão de aprovar`);
    assert.match(html, /Orçamento aprovado/);
    assert.doesNotMatch(html, />Pagar com Pix</);
    assert.doesNotMatch(html, /id="btnPaguei"/);
  }
  // Recusa registrada continua vencendo, mesmo com o app marcado como aprovado.
  const recusada = linhaBase({ status: 'recusado' });
  Object.assign(recusada.dados, { statusApp: 'convertido', cobrarAgora: false, valorACobrar: 0 });
  assert.match((await pagina(recusada)).html, /Orçamento recusado/);
  // "Já paguei" sem cobrarAgora (nada a cobrar) continua recusado (409).
  const semValor = linhaBase({ status: 'enviado' });
  Object.assign(semValor.dados, { statusApp: 'aprovado', cobrarAgora: false, valorACobrar: 0 });
  supabaseFalso(semValor);
  const r = await responderLink(TOKEN, req('POST', { acao: 'informar_pagamento' }), ENV);
  assert.equal(r.status, 409);
});

await caso('PARIDADE app ↔ página: o Pix do link cobra o MESMO valor do WhatsApp', async () => {
  const orcamento = {
    id: 'o1', numero: '2026-0012', status: 'aprovado', valorTotal: 350, clienteNome: 'Maria', itens: [],
  };
  const empresa = { nome: 'Frio Bom', cidade: 'Campinas', chavePix: '52998224725' };
  for (const recebido of [0, 100, 349.99]) {
    const doLink = cobrancaDoLink(orcamento, recebido);
    const doWhats = prepararCobranca({ orcamento, empresa, diasParado: 1, valorEmAberto: 350 - recebido });
    const linha = linhaBase({ status: 'enviado' });
    Object.assign(linha.dados, doLink);
    const { html } = await pagina(linha);
    const codigo = codigoDaPagina(html);
    assert.ok(codigo, `recebido ${recebido}: página mostra o Pix (cobrarAgora)`);
    assert.equal(valorDoCodigo(codigo), valorDoCodigo(doWhats.pixCopiaECola), `recebido ${recebido}`);
  }
  // Leitura dos recebimentos falhou: o link não cobra (3 estados).
  const desconhecido = cobrancaDoLink(orcamento, null);
  assert.equal(desconhecido.valorACobrar, null);
  assert.equal(desconhecido.cobrarAgora, false);
  // Entrada configurada e nada pago: cobra a entrada (mesmo cálculo do PDF).
  const comSinal = cobrancaDoLink({ ...orcamento, sinalPercentual: 30 }, 0);
  assert.equal(comSinal.valorACobrar, 105);
  assert.equal(comSinal.cobrancaTipo, 'sinal');
  // Já pagou a entrada: o saldo.
  const depoisDoSinal = cobrancaDoLink({ ...orcamento, sinalPercentual: 30 }, 105);
  assert.equal(depoisDoSinal.valorACobrar, 245);
  assert.equal(depoisDoSinal.cobrancaTipo, 'saldo');
  // Ainda não fechado no app: não força o Pix (o cliente aprova primeiro).
  assert.equal(cobrancaDoLink({ ...orcamento, status: 'enviado' }, 0).cobrarAgora, false);
  // Tudo pago: nada a cobrar.
  const quitado = cobrancaDoLink(orcamento, 350);
  assert.equal(quitado.valorACobrar, 0);
  assert.equal(quitado.cobrarAgora, false);
});

await caso('"Já paguei" com cobrarAgora: grava com o filtro do prestador NA QUERY', async () => {
  const linha = linhaBase({ status: 'visualizado' });
  Object.assign(linha.dados, { cobrarAgora: true, valorACobrar: 350 });
  const { chamadas } = supabaseFalso(linha);
  const r = await responderLink(TOKEN, req('POST', { acao: 'informar_pagamento' }), ENV);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).pagamentoInformado, true);
  const patch = chamadas.find(c => c.metodo === 'PATCH');
  assert.match(patch.url, /status=neq\.recusado/);
  assert.match(patch.url, /dados->>cobrarAgora=eq\.true/);
  assert.equal(linha.status, 'visualizado', 'status intacto');
});

await caso('âncora #pagar: bloco com id="pagar", "Copiar código Pix" acima do QR', async () => {
  const { html } = await pagina(linhaBase());
  assert.match(html, /<div class="pix-box" id="pagar">/);
  assert.match(html, /location\.hash !== '#pagar'/);
  assert.ok(html.indexOf('id="btnCopiar"') < html.indexOf('aria-label="QR code do Pix"'), 'copiar vem antes do QR');
  // Sem Pix (não aprovado), o #pagar cai nas ações — o script procura as duas âncoras.
  assert.match(html, /getElementById\('pagar'\) \|\| document\.getElementById\('actions'\)/);
});

await caso('proposta vencida: GET diz "vencida" e não oferece aprovar', async () => {
  const linha = linhaBase({ status: 'enviado' });
  linha.dados.validade = '01/01/2020';
  const { html } = await pagina(linha);
  assert.match(html, /Proposta vencida/);
  assert.match(html, /terminou em 01\/01\/2020/);
  assert.match(html, /Venceu em 01\/01\/2020/);
  assert.doesNotMatch(html, /id="btnAprovar"/);
  assert.match(html, /Pedir proposta atualizada/);
});

await caso('proposta vencida: POST aprovar devolve 409 e não grava nada', async () => {
  const linha = linhaBase({ status: 'enviado' });
  linha.dados.validade = '2020-01-01T10:00:00Z';
  const { chamadas } = supabaseFalso(linha);
  const r = await responderLink(TOKEN, req('POST', { acao: 'aprovar' }), ENV);
  assert.equal(r.status, 409);
  assert.equal((await r.json()).erro, 'proposta_vencida');
  assert.equal(chamadas.filter(c => c.metodo === 'PATCH').length, 0);
  assert.equal(linha.status, 'enviado');
});

await caso('proposta no prazo: aprovar continua funcionando', async () => {
  const linha = linhaBase({ status: 'enviado' });
  linha.dados.validade = '31/12/2099';
  supabaseFalso(linha);
  const r = await responderLink(TOKEN, req('POST', { acao: 'aprovar' }), ENV);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'aprovado');
  assert.equal(linha.status, 'aprovado');
});

await caso('validade vale até o fim do dia em Brasília', async () => {
  // 30/09/2026 23:59 em Brasília = 01/10/2026 02:59 UTC → ainda no prazo.
  assert.equal(validadeVencida('30/09/2026', new Date('2026-10-01T02:59:00Z')), false);
  // 01/10/2026 00:00:01 em Brasília → venceu.
  assert.equal(validadeVencida('30/09/2026', new Date('2026-10-01T03:00:01Z')), true);
  assert.equal(validadeVencida('2026-09-30', new Date('2026-10-01T03:00:01Z')), true);
  // Sem validade ou ilegível: não bloqueia o cliente por um dado que não existe.
  assert.equal(validadeVencida('', new Date('2099-01-01')), false);
  assert.equal(validadeVencida('12/05/20', new Date('2099-01-01')), false);
  assert.equal(validadeVencida(undefined, new Date('2099-01-01')), false);
});

await caso('texto honesto: nada de "avisado na hora" (não existe aviso instantâneo)', async () => {
  for (const status of ['enviado', 'aprovado']) {
    const { html } = await pagina(linhaBase({ status }));
    assert.doesNotMatch(html, /avisado na hora/);
    assert.doesNotMatch(html, /já (foi|é) avisado/);
  }
  const { html } = await pagina(linhaBase({ status: 'aprovado' }));
  assert.match(html, /Sua aprovação foi registrada e aparece para Frio Bom no OLLI/);
});

await caso('"Falar no WhatsApp" com DDD 55 vai para o número certo', async () => {
  const linha = linhaBase({ status: 'enviado', prestador_whatsapp: '' });
  linha.dados.prestador.whatsapp = '(55) 99876-5432';
  const { html } = await pagina(linha);
  assert.match(html, /href="https:\/\/wa\.me\/5555998765432\?text=/);
  // Número torto: sem botão (nunca um wa.me para um desconhecido).
  const torta = linhaBase({ status: 'enviado', prestador_whatsapp: '' });
  torta.dados.prestador.whatsapp = '123';
  const r = await pagina(torta);
  assert.doesNotMatch(r.html, /wa\.me/);
});

await caso('app: republicar o link NÃO volta o status para "enviado" (leitura do código)', async () => {
  // clienteLink.ts importa supabase/react-native e não carrega no node: a rede aqui é
  // ler o código. O caminho "reusado" tem de ser UPDATE do conteúdo, sem o status.
  const { readFileSync } = await import('node:fs');
  const fonteLink = readFileSync(new URL('../../src/services/clienteLink.ts', import.meta.url), 'utf8');
  // O conteúdo nasce em `conteudoDoLink` (clienteLinkSnapshot.ts), compartilhado com o painel.
  const fonteSnap = readFileSync(new URL('../../src/services/clienteLinkSnapshot.ts', import.meta.url), 'utf8');
  const fonte = `${fonteLink}\n${fonteSnap}`;
  assert.match(fonteLink, /const conteudo = conteudoDoLink\(orc, empresa, cobranca\);/, 'o app monta o conteúdo por conteudoDoLink');
  const conteudo = /export function conteudoDoLink[\s\S]*?return \{([\s\S]*?)\r?\n {2}\};/.exec(fonteSnap);
  assert.ok(conteudo, 'bloco `conteudo` existe');
  assert.doesNotMatch(conteudo[1], /status/, 'conteúdo republicado não leva status');
  assert.match(fonte, /\.update\(conteudo\)\s*\.eq\('token', reusado\)/);
  assert.doesNotMatch(fonte, /upsert\(\{ token, \.\.\.baseRow \}/, 'o upsert com status enviado saiu');
  // O snapshot leva o que a página precisa para cobrar certo.
  for (const campo of ['statusApp', 'cobrarAgora', 'valorACobrar', 'cobrancaTipo', 'sinal']) {
    assert.match(fonte, new RegExp(`${campo}: cobranca\\.${campo}`), campo);
  }
  // Erro ao ler o token existente não vira "não tem" (senão nasce um 2º link).
  assert.match(fonte, /if \(error\) throw error;\r?\n {2}return \(data as any\)\?\.token \?\? null;/);
});


// ─── Grátis ilimitado (01/10/2026): o plano do DONO decide selo e Pix ──────────
await caso('regra pura: Grátis = selo + sem Pix; Pro/Empresa = sem selo + Pix; "não sei" = selo + 3º estado', async () => {
  assert.deepEqual(regrasDaPagina({ confirmado: true, plano: 'gratis' }), { mostrarSelo: true, pagamento: 'bloqueado' });
  assert.deepEqual(regrasDaPagina({ confirmado: true, plano: 'pro' }), { mostrarSelo: false, pagamento: 'liberado' });
  assert.deepEqual(regrasDaPagina({ confirmado: true, plano: 'empresa' }), { mostrarSelo: false, pagamento: 'liberado' });
  assert.deepEqual(regrasDaPagina({ confirmado: false }), { mostrarSelo: true, pagamento: 'indeterminado' });
  assert.deepEqual(regrasDaPagina({ confirmado: true, plano: 'trial' }), { mostrarSelo: true, pagamento: 'indeterminado' });
  assert.deepEqual(regrasDaPagina(null), { mostrarSelo: true, pagamento: 'indeterminado' });
});

await caso('dono no Grátis: selo "Feito com OLLI" com UTM e SEM Pix (cliente nunca vê paywall)', async () => {
  const { status, html } = await pagina(linhaBase(), { plano: 'gratis' });
  assert.equal(status, 200);
  assert.doesNotMatch(html, /Pagar com Pix/);
  assert.equal(codigoDaPagina(html), null);
  assert.match(html, /Combine a forma de pagamento diretamente com Frio Bom/);
  assert.doesNotMatch(html, /Disponível no Pro|plano Pro|assine/i, 'o cliente final não vê oferta de plano');
  assert.match(html, /Feito com <span[^>]*>OLLI<\/span>/);
  assert.match(html, /utm_source=link_orcamento&amp;utm_medium=selo&amp;utm_campaign=feito_com_olli|utm_source=link_orcamento&utm_medium=selo&utm_campaign=feito_com_olli/);
});

await caso('dono no Pro: Pix aparece e o selo some', async () => {
  const { html } = await pagina(linhaBase(), { plano: 'pro' });
  assert.match(html, />Pagar com Pix</);
  assert.doesNotMatch(html, /Feito com <span/);
  assert.doesNotMatch(html, /utm_medium=selo/);
});

await caso('dono no Empresa: Pix aparece e o selo some', async () => {
  const { html } = await pagina(linhaBase(), { plano: 'empresa' });
  assert.match(html, />Pagar com Pix</);
  assert.doesNotMatch(html, /utm_medium=selo/);
});

await caso('plano ilegível (RPC 500): selo FICA e o Pix vira "não carregou" — nunca Pix sem confirmar', async () => {
  const { status, html } = await pagina(linhaBase(), { plano: null });
  assert.equal(status, 200, 'falha do plano não derruba a página do cliente');
  assert.doesNotMatch(html, /Pagar com Pix/);
  assert.match(html, /Não consegui carregar a forma de pagamento agora/);
  assert.match(html, /utm_medium=selo/);
});

await caso('linha sem dono (user_id ausente/torto): nem chama a RPC, trata como "não sei"', async () => {
  const linha = linhaBase({ user_id: 'nao-e-uuid' });
  const { chamadas } = supabaseFalso(linha);
  const html = await (await renderLinkPage(TOKEN, ENV, req())).text();
  assert.equal(chamadas.some((c) => c.url.includes('plano_comercial_para_usuario')), false);
  assert.match(html, /Não consegui carregar a forma de pagamento agora/);
  assert.match(html, /utm_medium=selo/);
});

await caso('a página pede o user_id do dono (sem ele não há como ler o plano)', async () => {
  const { chamadas } = supabaseFalso(linhaBase());
  await renderLinkPage(TOKEN, ENV, req());
  const get = chamadas.find((c) => c.metodo === 'GET' && c.url.includes('/orcamentos_publicos?'));
  assert.ok(get && /select=[^&]*user_id/.test(get.url));
});

// ── Defeitos de tela achados na ronda de 20/11 (print em 390 px) ──────────────────────────────
await caso('Pix copia e cola: a caixa tem linhas para o código inteiro (a última linha, com o CRC, não fica cortada)', async () => {
  const { html } = await pagina(linhaBase());
  const codigo = codigoDaPagina(html);
  const rows = Number(/<textarea id="pixCodigo"[^>]*rows="(\d+)"/.exec(html)?.[1]);
  assert.ok(codigo && rows >= Math.ceil(codigo.length / 32), `rows=${rows} para ${codigo?.length} caracteres`);
  assert.ok(rows >= 4, 'nunca menos de 4 linhas');
});

await caso('link pendente: "Aprovar orçamento" vem ANTES do "Como funciona" e a frase repetida saiu', async () => {
  const { html } = await pagina(linhaBase({ status: 'enviado' }));
  const iBotao = html.indexOf('id="btnAprovar"');
  const iComo = html.indexOf('<div class="cf-t">Como funciona</div>');
  assert.ok(iBotao > 0 && iComo > 0, 'os dois existem');
  assert.ok(iBotao < iComo, 'o botão de aprovar vem primeiro (fica na primeira tela do celular)');
  assert.doesNotMatch(html, /sem cadastro e sem burocracia/);
  assert.equal((html.match(/sem cadastro/g) || []).length, 1, '"sem cadastro" dito uma vez só');
});

await caso('texto pequeno legível: nenhum cinza claro (#9AA3B2 / #8A93A2) em texto da página', async () => {
  const { html } = await pagina(linhaBase({ status: 'enviado' }));
  assert.doesNotMatch(html, /color:#9AA3B2|color:#8A93A2/i);
  assert.doesNotMatch(html, /\.cond-l\{font-size:9\.5px/);
});

await caso('"Já paguei" não recarrega a página: troca o botão pelo aviso (sem location.reload no fluxo)', async () => {
  const { html } = await pagina(linhaBase());
  const ini = html.indexOf('async function informarPagamento()');
  const fim = html.indexOf('// Link de cobrança (/o/<token>#pagar)');
  assert.ok(ini > 0 && fim > ini, 'achou o trecho do script');
  const trecho = html.slice(ini, fim);
  assert.doesNotMatch(trecho, /location\.reload/);
  assert.match(trecho, /replaceWith\(av\)/);
  assert.match(html, /data-prestador="Frio Bom"/);
  assert.match(html, /prefers-reduced-motion:reduce\)\{\.pix-avisado\.entra\{animation:none/);
});

console.log(`\nteste-link-pix: ${ok} casos OK`);
