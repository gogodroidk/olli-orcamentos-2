import assert from 'node:assert/strict';
import { processarWelcomeOutbox } from '../src/welcomeOutboxConsumer.js';

const NOW = '2026-09-04T21:30:00.000Z';
const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
  RESEND_API_KEY: 'resend-key-test-only',
  WELCOME_DISPATCH_MODE: 'simulator',
  WELCOME_BATCH_LIMIT: '1',
  WELCOME_FROM: 'OLLI Orçamentos <nao-responda@olliorcamentos.online>',
  WELCOME_REPLY_TO: 'contato@olliorcamentos.online',
  WELCOME_APP_URL: 'https://app.olliorcamentos.online',
  WELCOME_SUPPORT_URL: 'https://olliorcamentos.online/ajuda/',
  WELCOME_LOGO_URL: 'https://olliorcamentos.online/icon-192.png',
});

function claim(recipient = 'delivered@resend.dev') {
  return {
    event_id: 'auth.email_confirmed:00000000-0000-4000-8000-000000000041:1',
    idempotency_key: 'auth.email_confirmed:00000000-0000-4000-8000-000000000041:1',
    template: 'boas_vindas',
    template_version: 'boas_vindas.v1',
    purpose: 'account_onboarding',
    recipient,
    attempts: 1,
    status: 'sending',
    next_attempt_at: NOW,
    provider_id: null,
    error_code: null,
    created_at: NOW,
    updated_at: NOW,
    claim_token: '00000000-0000-4000-8000-000000000099',
    lease_expires_at: '2026-09-04T21:32:00.000Z',
    dispatch_scope: 'simulator',
  };
}

function deps(fetchImpl) {
  return {
    fetchImpl,
    randomUUID: () => '00000000-0000-4000-8000-000000000077',
    now: () => new Date(NOW),
  };
}

async function casoDesligado() {
  let calls = 0;
  const result = await processarWelcomeOutbox(
    { WELCOME_DISPATCH_MODE: 'off' },
    deps(async () => { calls += 1; throw new Error('rede_nao_deveria_ser_chamada'); }),
  );
  assert.equal(calls, 0);
  assert.deepEqual(result, {
    version: '2026-09-30.v3', mode: 'off', claimed: 0, sent: 0, failed: 0,
  });
}

async function casoSucesso() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_dispatch_scope, 'simulator');
      assert.equal(body.p_limit, 1);
      assert.equal(body.p_lease_seconds, 120);
      return Response.json([claim()]);
    }
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.to, ['delivered@resend.dev']);
      assert.equal(body.reply_to, 'contato@olliorcamentos.online');
      assert.equal(init.headers['Idempotency-Key'], claim().idempotency_key);
      assert.match(body.html, /OLLI Orçamentos/);
      assert.match(body.text, /Sua conta está pronta/);
      return Response.json({ id: 'email_test_1' }, { status: 200 });
    }
    if (url.endsWith('/rpc/settle_email_welcome_outbox')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_attempts, 1);
      assert.equal(body.p_status, 'sent');
      assert.equal(body.p_provider_id, 'email_test_1');
      assert.equal(body.p_error_code, null);
      assert.equal(Object.hasOwn(body, 'p_next_attempt_at'), false);
      return Response.json([{ applied: true, status: 'sent', attempts: 1 }]);
    }
    throw new Error('url_inesperada');
  };
  const result = await processarWelcomeOutbox(ENV, deps(fetchImpl));
  assert.equal(calls.length, 3);
  assert.deepEqual(result, {
    version: '2026-09-30.v3', mode: 'simulator', claimed: 1, sent: 1, failed: 0,
  });
}

async function casoDestinatarioBloqueado() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      return Response.json([claim('pessoa@example.com')]);
    }
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'));
    const body = JSON.parse(init.body);
    assert.equal(body.p_status, 'dead_letter');
    assert.equal(body.p_error_code, 'simulator_recipient_rejected');
    assert.equal(body.p_attempts, 1);
    return Response.json([{ applied: true, status: 'dead_letter', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV, deps(fetchImpl));
  assert.equal(calls.length, 2);
  assert.equal(calls.some((item) => item.url === 'https://api.resend.com/emails'), false);
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
}

async function casoRetry() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) return Response.json([claim()]);
    if (url === 'https://api.resend.com/emails') {
      return Response.json({ name: 'rate_limit_exceeded' }, { status: 429 });
    }
    const body = JSON.parse(init.body);
    assert.equal(body.p_status, 'failed');
    assert.equal(body.p_error_code, 'provider_rate_limited');
    assert.equal(Object.hasOwn(body, 'p_next_attempt_at'), false);
    return Response.json([{ applied: true, status: 'failed', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV, deps(fetchImpl));
  assert.equal(calls.length, 3);
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
}

const USER = '00000000-0000-4000-8000-000000000041';
const ENV_PROD = Object.freeze({
  ...ENV,
  WELCOME_DISPATCH_MODE: 'production',
  WELCOME_BATCH_LIMIT: '3',
  EMAIL_DESCADASTRO_URL: 'https://diagnostico.olliorcamentos.online/email/descadastrar',
});

// Renovação do Pro pago no Pix, D-3 (o único lembrete de cobrança desde que o
// Grátis ficou ilimitado, 01/10/2026).
const VENCE_LEMBRETE = '2026-10-02T02:00:00.000Z';
function claimLembrete() {
  const key = `lembrete:assinatura:${USER}:renovacao:${VENCE_LEMBRETE}:D-3`;
  return {
    ...claim('pessoa@example.com'),
    event_id: key,
    idempotency_key: key,
    template: 'lembrete_assinatura',
    template_version: 'lembrete_assinatura.v1',
    purpose: 'billing_reminder',
    dispatch_scope: 'production',
    user_id: USER,
    template_dados: {
      tipo: 'renovar_pix', plano: 'pro', venceEm: VENCE_LEMBRETE, momento: 'D-3', sequencia: `renovacao:${VENCE_LEMBRETE}`,
    },
  };
}

async function casoProducaoBoasVindasELembrete() {
  const calls = [];
  const enviados = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_dispatch_scope, 'production');
      assert.equal(body.p_limit, 3);
      return Response.json([
        { ...claim('novo@example.com'), dispatch_scope: 'production', user_id: USER, template_dados: null },
        claimLembrete(),
      ]);
    }
    if (url === 'https://api.resend.com/emails') {
      const body = JSON.parse(init.body);
      enviados.push({ body, headers: init.headers });
      return Response.json({ id: `email_${enviados.length}` }, { status: 200 });
    }
    if (url.endsWith('/rpc/settle_email_welcome_outbox')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_status, 'sent');
      return Response.json([{ applied: true, status: 'sent', attempts: 1 }]);
    }
    throw new Error('url_inesperada');
  };
  const result = await processarWelcomeOutbox(ENV_PROD, deps(fetchImpl));
  assert.deepEqual(result, { version: '2026-09-30.v3', mode: 'production', claimed: 2, sent: 2, failed: 0 });

  // Boas-vindas: destinatário real, sem List-Unsubscribe.
  assert.deepEqual(enviados[0].body.to, ['novo@example.com']);
  assert.equal(Object.hasOwn(enviados[0].body, 'headers'), false);

  // Lembrete: link assinado no corpo e no cabeçalho one-click.
  const lembrete = enviados[1];
  assert.deepEqual(lembrete.body.to, ['pessoa@example.com']);
  assert.equal(lembrete.headers['Idempotency-Key'], claimLembrete().idempotency_key);
  assert.equal(lembrete.body.subject, 'Seu plano Pro vence em 01/10 (quinta)');
  const unsub = lembrete.body.headers['List-Unsubscribe'];
  assert.match(unsub, /^<https:\/\/diagnostico\.olliorcamentos\.online\/email\/descadastrar\?u=00000000-0000-4000-8000-000000000041&e=lembretes&a=[A-Za-z0-9_-]{43}>$/);
  assert.equal(lembrete.body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(lembrete.body.text.includes(unsub.slice(1, -1)));
  assert.ok(lembrete.body.html.includes('Parar de receber lembretes</a>'));
  assert.equal(lembrete.body.text.includes(ENV.SUPABASE_SERVICE_ROLE_KEY), false);
}

async function casoLembreteSemDescadastro() {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) return Response.json([claimLembrete()]);
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'), 'lembrete sem descadastro não pode chegar à Resend');
    const body = JSON.parse(init.body);
    assert.equal(body.p_status, 'dead_letter');
    assert.equal(body.p_error_code, 'consumer_contract_error');
    return Response.json([{ applied: true, status: 'dead_letter', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox({ ...ENV_PROD, EMAIL_DESCADASTRO_URL: '' }, deps(fetchImpl));
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
}

async function casoLembreteComDadosInvalidos() {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      return Response.json([{ ...claimLembrete(), template_dados: { ...claimLembrete().template_dados, email: 'x@y.z' } }]);
    }
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'));
    assert.equal(JSON.parse(init.body).p_status, 'dead_letter');
    return Response.json([{ applied: true, status: 'dead_letter', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV_PROD, deps(fetchImpl));
  assert.equal(result.failed, 1);
}

/**
 * Grátis ilimitado (01/10/2026): um "faltam 2 orçamentos grátis" que ficou na fila
 * de antes do deploy NÃO pode chegar ao cliente — vai para dead_letter, sem Resend.
 */
async function casoLembreteDeCotaAntigoNaFilaNaoSai() {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      const key = `lembrete:assinatura:${USER}:cota_quase:2026-09`;
      return Response.json([{
        ...claimLembrete(), event_id: key, idempotency_key: key,
        template_dados: { tipo: 'cota_quase', limite: 5, usados: 3, restantes: 2 },
      }]);
    }
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'), 'e-mail de cota descontinuado não pode chegar à Resend');
    assert.equal(JSON.parse(init.body).p_status, 'dead_letter');
    return Response.json([{ applied: true, status: 'dead_letter', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV_PROD, deps(fetchImpl));
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
}

async function casoSimuladorNaoEnviaLembreteReal() {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      return Response.json([{ ...claimLembrete(), dispatch_scope: 'simulator' }]);
    }
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'));
    assert.equal(JSON.parse(init.body).p_error_code, 'simulator_recipient_rejected');
    return Response.json([{ applied: true, status: 'dead_letter', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox({ ...ENV_PROD, WELCOME_DISPATCH_MODE: 'simulator' }, deps(fetchImpl));
  assert.equal(result.sent, 0);
}

function claimResumo(dados = {}) {
  const key = `resumo:dinheiro:${USER}:2026-09-30`;
  return {
    ...claim('pessoa@example.com'),
    event_id: key,
    idempotency_key: key,
    template: 'resumo_dinheiro',
    template_version: 'resumo_dinheiro.v2',
    purpose: 'money_digest',
    dispatch_scope: 'production',
    user_id: USER,
    template_dados: {
      data: '2026-09-30', aReceberCentavos: 85000, aReceberItens: 1, diasMaisAntigo: 12,
      semValor: 0, propostasParadas: 0, clientesParaLembrar: 0, ...dados,
    },
  };
}

async function casoResumoDinheiro() {
  const enviados = [];
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) return Response.json([claimResumo()]);
    if (url === 'https://api.resend.com/emails') {
      enviados.push({ body: JSON.parse(init.body), headers: init.headers });
      return Response.json({ id: 'email_resumo' }, { status: 200 });
    }
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'));
    assert.equal(JSON.parse(init.body).p_status, 'sent');
    return Response.json([{ applied: true, status: 'sent', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV_PROD, deps(fetchImpl));
  assert.equal(result.sent, 1);
  const [e] = enviados;
  assert.equal(e.body.subject, 'Você tem R$ 850 a receber');
  assert.equal(e.headers['Idempotency-Key'], claimResumo().idempotency_key);
  // Link do RESUMO (escopo próprio): desliga só o resumo, não os lembretes.
  const unsub = e.body.headers['List-Unsubscribe'];
  assert.match(unsub, /^<https:\/\/diagnostico\.olliorcamentos\.online\/email\/descadastrar\?u=00000000-0000-4000-8000-000000000041&e=resumo&a=[A-Za-z0-9_-]{43}>$/);
  assert.equal(e.body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(e.body.html.includes('Parar de receber o resumo</a>'));
}

async function casoResumoSemNadaAcionavelNaoSai() {
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/rpc/claim_email_welcome_outbox')) {
      return Response.json([claimResumo({ aReceberCentavos: 0, aReceberItens: 0, diasMaisAntigo: null })]);
    }
    assert.ok(url.endsWith('/rpc/settle_email_welcome_outbox'), 'resumo vazio não pode chegar à Resend');
    const body = JSON.parse(init.body);
    assert.equal(body.p_status, 'dead_letter');
    assert.equal(body.p_error_code, 'consumer_contract_error');
    return Response.json([{ applied: true, status: 'dead_letter', attempts: 1 }]);
  };
  const result = await processarWelcomeOutbox(ENV_PROD, deps(fetchImpl));
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
}

const originalLog = console.log;
const originalError = console.error;
console.log = () => {};
console.error = () => {};
try {
  await casoDesligado();
  await casoSucesso();
  await casoDestinatarioBloqueado();
  await casoRetry();
  await casoProducaoBoasVindasELembrete();
  await casoLembreteSemDescadastro();
  await casoLembreteComDadosInvalidos();
  await casoLembreteDeCotaAntigoNaFilaNaoSai();
  await casoSimuladorNaoEnviaLembreteReal();
  await casoResumoDinheiro();
  await casoResumoSemNadaAcionavelNaoSai();
} finally {
  console.log = originalLog;
  console.error = originalError;
}

console.log('PASSOU: consumer da outbox — off, sucesso, bloqueio de destinatário, retry, produção (boas-vindas + lembrete com List-Unsubscribe) e falhas fechadas do lembrete; resumo diário com descadastro próprio');
