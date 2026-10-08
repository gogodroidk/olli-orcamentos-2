// E2E do painel: cadastro -> (porta do cadastro) -> orçamento -> envio com link -> Pix do plano.
// Rede 100% simulada (support/backend-mock.mjs). Rodar: node --test e2e/painel/fluxo-comercial.spec.mjs
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { servir } from '../support/servidor-estatico.mjs';
import { criarBackend } from '../support/backend-mock.mjs';
import { cadastrar, CONTA } from '../support/fluxo.mjs';

const DIST = fileURLToPath(new URL('../../.e2e-dist/painel', import.meta.url));
const SAIDA = fileURLToPath(new URL('../../.e2e-out', import.meta.url));
mkdirSync(SAIDA, { recursive: true });

let browser, srv, base, ctx, page, backend;
const errosPagina = [];
let bannerErroAposCliente = null;
const T = { timeout: 30_000 };

// Em falha, anexa screenshot + controles visíveis ao erro (PC lento: cada rodada é cara, então a falha tem que ensinar).
async function comDiagnostico(nome, fn) {
  try { await fn(); } catch (e) {
    const controles = await page.evaluate(() => [...document.querySelectorAll('input,button,textarea,select,[role=dialog] h2,[role=alert]')]
      .filter((x) => x.offsetParent !== null)
      .map((x) => `${x.tagName.toLowerCase()} ph=${x.placeholder ?? ''} aria=${x.getAttribute('aria-label') ?? ''} txt=${(x.innerText ?? '').trim().slice(0, 60)}`)).catch(() => []);
    await page.screenshot({ path: `${SAIDA}/${nome}.png` }).catch(() => {});
    e.message += `\n--- URL ${page.url()}\n--- controles:\n${controles.join('\n')}`;
    throw e;
  }
}

describe('fluxo comercial (painel)', { concurrency: false }, () => {
  before(async () => {
    ({ servidor: srv, url: base } = await servir(DIST, { spa: true }));
    backend = criarBackend({ pixPagoDepois: 2 });
    browser = await chromium.launch();
    ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    ctx.setDefaultTimeout(30_000);
    await backend.instalar(ctx);
    page = await ctx.newPage();
    page.on('pageerror', (e) => errosPagina.push(e.message));
  });
  after(async () => { await browser?.close(); srv?.close(); });

  it('1. cadastro por e-mail cria conta e abre o painel', async () => comDiagnostico('01-cadastro', async () => {
    await cadastrar(page, base);
    await page.waitForURL(/\/inicio/, T);
    const ev = backend.db.eventos.find((e) => e.tipo === 'signup');
    assert.ok(ev, 'signup não chegou ao Supabase');
    assert.equal(ev.email, CONTA.email);
    assert.equal(ev.meta.full_name, CONTA.nome);
    assert.equal(ev.meta.phone, '+5511987654321', 'telefone deve ir em E.164');
  }));

  it('2. cria cliente e orçamento', async () => comDiagnostico('02-orcamento', async () => {
    await page.goto(`${base}/orcamentos?novo=1`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Selecionar cliente…').click();
    await page.getByText('Cadastrar novo cliente').click();
    await page.getByPlaceholder('Maria Souza').fill('Carlos Cliente');
    await page.getByLabel('Telefone / WhatsApp').fill('11999998888');
    await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
    await page.getByRole('dialog').getByText('Carlos Cliente').first().waitFor();
    // ACHADO #1 (ver ACHADOS.md): o submit do FormCliente borbulha pelo portal React até o form do orçamento.
    bannerErroAposCliente = await page.getByText('Escolha o cliente deste orçamento.').isVisible();
    await page.getByRole('button', { name: 'Adicionar item' }).click();
    await page.getByRole('button', { name: /Serviço avulso/ }).click();
    await page.getByLabel(/Nome do item/).fill('Instalação de ar-condicionado 12000 BTU');
    await page.getByLabel(/Preço de/).fill('85000') // máscara de centavos: 85000 -> R$ 850,00;
    await page.getByRole('button', { name: 'Criar orçamento' }).click();
    await page.getByText(/Carlos Cliente/).first().waitFor();
    const orc = backend.tab('orcamentos');
    assert.equal(orc.length, 1, 'orçamento não foi gravado');
    assert.equal(Number(orc[0].valor_total), 850);
  }));

  it('3. enviar sem cadastro do negócio completo é bloqueado e orienta a completar (nada sai)', async () => comDiagnostico('03-envio-bloqueado', async () => {
    await page.goto(`${base}/orcamentos`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Enviar orçamento .* pelo WhatsApp/ }).first().click();
    await page.getByText('Complete seu negócio para gerar').waitFor();
    assert.equal(backend.tab('orcamentos_publicos').length, 0, 'link do cliente foi publicado com o cadastro incompleto');
    assert.equal(backend.db.eventos.filter((e) => e.tipo === 'rpc' && e.nome === 'reservar_envio_orcamento_gratis').length, 0, 'cota foi reservada com o cadastro incompleto');
  }));

  it('4. completa o cadastro do negócio (Meu negócio)', async () => comDiagnostico('04-meu-negocio', async () => {
    await page.goto(`${base}/meu-negocio`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Ex.: Clima Bom Refrigeração').fill('Eletro João Serviços');
    await page.getByPlaceholder('Ex.: João da Silva').fill('João da Silva');
    await page.getByPlaceholder('Ex.: Assistência técnica de ar-condicionado').fill('Instalação e manutenção de ar-condicionado');
    await page.getByRole('button', { name: 'Autônomo / pessoa física' }).click();
    await page.getByRole('button', { name: /Elétrica/ }).click();
    await page.getByLabel('Cidade').fill('São Paulo');
    await page.getByPlaceholder('SP').fill('SP');
    await page.getByRole('button', { name: 'Salvar alterações' }).first().click();
    await page.waitForFunction(() => /Meu negócio|salvo|Salvo/.test(document.body.innerText), null, T);
    for (let i = 0; i < 40 && backend.tab('empresa').length === 0; i++) await page.waitForTimeout(500);
    assert.ok(backend.tab('empresa').length >= 1, 'empresa não foi gravada');
  }));

  it('5. envia pelo WhatsApp: publica link /o/<token>, mensagem com o link, "Já enviei" move para enviado', async () => comDiagnostico('05-envio', async () => {
    await page.goto(`${base}/orcamentos`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Enviar orçamento .* pelo WhatsApp/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText(/Enviar para Carlos Cliente pelo WhatsApp/).waitFor();
    const publicos = backend.tab('orcamentos_publicos');
    assert.equal(publicos.length, 1, 'link do cliente não foi publicado');
    const url = `https://link.e2e.test/o/${publicos[0].token}`;
    assert.ok((await dlg.locator('pre').innerText()).includes(url), 'mensagem não contém o link do cliente');
    const wa = await dlg.getByRole('link', { name: 'Abrir o WhatsApp' }).getAttribute('href');
    assert.match(wa, /^https:\/\/(wa\.me|api\.whatsapp\.com)\/.*5511999998888|phone=5511999998888/, `link do WhatsApp errado: ${wa}`);
    // Clique real, mas sem abrir o WhatsApp de verdade: o popup é capturado e fechado.
    const popup = ctx.waitForEvent('page', { timeout: 10_000 }).catch(() => null);
    await dlg.getByRole('link', { name: 'Abrir o WhatsApp' }).click();
    (await popup)?.close().catch(() => {});
    assert.notEqual(backend.tab('orcamentos')[0].status, 'enviado', 'abrir o WhatsApp não pode contar como enviado');
    await dlg.getByRole('button', { name: 'Já enviei' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('marcado como enviado'), null, T);
    assert.equal(backend.tab('orcamentos')[0].status, 'enviado');
    assert.ok(backend.db.eventos.some((e) => e.tipo === 'rpc' && e.nome === 'confirmar_envio_orcamento_gratis'), 'envio não foi confirmado na cota');
  }));

  it('6. Pix do plano: gera QR, acompanha o status e só libera quando o servidor confirma', async () => comDiagnostico('06-pix', async () => {
    await page.goto(`${base}/planos`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Pagar com Pix/ }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('img', { name: /QR Code do Pix/ }).waitFor();
    assert.equal(backend.db.pixCriados.length, 1);
    assert.match(backend.db.pixCriados[0].plano, /^(pro|empresa)_(mensal|anual)$/);
    assert.ok(await dlg.getByText('00020126E2E-FALSO-NAO-PAGAVEL').count() > 0, 'copia-e-cola não aparece');
    // sem pago do servidor, a tela NUNCA afirma pagamento
    assert.equal(await dlg.getByText('Pagamento confirmado!').count(), 0);
    await dlg.getByText('Pagamento confirmado!').waitFor({ timeout: 60_000 });
    assert.ok(backend.db.pixConsultas > 2, 'liberou sem consultar o servidor');
  }));

  it('2b. criar cliente de dentro do orçamento NÃO acende erro de validação (regressão: submit borbulha pelo portal)', async () => {
    assert.equal(bannerErroAposCliente, false, 'banner "Escolha o cliente deste orçamento." apareceu com o cliente já selecionado');
  });
});
