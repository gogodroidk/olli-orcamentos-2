/**
 * Teste da RODADA de lembretes (`src/emailLembretesJob.js`) com fetch falso.
 *
 *     node scripts/teste-email-lembretes-job.js   (de dentro de worker/)
 *
 * Protege os portões (modo, dispatch real, hora cheia comercial, descadastro
 * configurado), o teto por rodada, a parada no teto diário do banco e o log sem
 * PII.
 */
import assert from 'node:assert/strict';
import { processarLembretesEmail } from '../src/emailLembretesJob.js';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-09-29T15:00:00.000Z'); // 12h em Brasília
const H = 3600e3;
const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
  WELCOME_DISPATCH_MODE: 'production',
  EMAIL_LEMBRETES_MODE: 'production',
  EMAIL_LEMBRETES_MAX_POR_RODADA: '2',
  EMAIL_LEMBRETES_TETO_DIARIO: '40',
  EMAIL_DESCADASTRO_URL: 'https://diagnostico.olliorcamentos.online/email/descadastrar',
});

/** Pagou o Pro no Pix e vence em 60h: é o D-3 da renovação (o único e-mail de cobrança hoje). */
const VENCE = new Date(AGORA.getTime() + 60 * H).toISOString();
function candidato(n) {
  return {
    candidato: {
      userId: U(n),
      confirmadoEm: new Date(AGORA.getTime() - 60 * 24 * H).toISOString(),
      orcamentos: 4,
      membroDeEquipe: false,
      donoDoTenant: true,
      assinatura: {
        plano: 'pro', status: 'active', current_period_end: VENCE,
        admin_plano_override: null, admin_override_ativo: false, admin_override_ate: null, recorrente: false,
      },
      oferta: {
        plano_efetivo: 'pro', limite_envios: null, envios_usados: 3, envios_restantes: null,
        trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
      },
      historico: { ativacao: [], cobranca: [] },
    },
  };
}

/** Conta nova (80 h), sem orçamento: cai na janela activation_day_3 → e-mail de ativação. */
function contaNova(n) {
  const c = candidato(n);
  return {
    candidato: {
      ...c.candidato,
      confirmadoEm: new Date(AGORA.getTime() - 80 * H).toISOString(),
      orcamentos: 0,
      donoDoTenant: true,
      assinatura: null,
      oferta: { ...c.candidato.oferta, plano_efetivo: 'gratis', envios_usados: 0, trial_estado: 'available' },
    },
  };
}

/** Grátis com muitos envios: desde 01/10/2026 (ilimitado) não gera e-mail nenhum. */
function gratisComEnvios(n, usados) {
  const c = candidato(n);
  return {
    candidato: {
      ...c.candidato,
      orcamentos: usados + 1,
      assinatura: null,
      oferta: { ...c.candidato.oferta, plano_efetivo: 'gratis', envios_usados: usados },
    },
  };
}

function fetchFalso({ candidatos, respostasEnqueue = [] }) {
  const calls = [];
  const fila = [...respostasEnqueue];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (url.endsWith('/rpc/listar_candidatos_lembrete_email')) return Response.json(candidatos);
    if (url.endsWith('/rpc/enqueue_lembrete_email')) return Response.json(fila.shift() ?? { enfileirado: true, motivo: 'enfileirado' });
    throw new Error(`url_inesperada:${url}`);
  };
  return { calls, fetchImpl };
}

const logs = [];
const originalLog = console.log;
const originalError = console.error;
console.log = (...a) => logs.push(a.join(' '));
console.error = (...a) => logs.push(a.join(' '));

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  originalLog(`  ok   ${nome}`);
}

try {
  await caso('modo off não chama rede', async () => {
    const f = fetchFalso({ candidatos: [] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'off' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.mode, 'off');
    assert.equal(f.calls.length, 0);
  });
  await caso('sem dispatch em production não acumula fila', async () => {
    const f = fetchFalso({ candidatos: [] });
    const r = await processarLembretesEmail({ ...ENV, WELCOME_DISPATCH_MODE: 'simulator' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'dispatch_nao_production');
    assert.equal(f.calls.length, 0);
  });
  await caso('fora da hora cheia ou fora de 8h–20h de Brasília não roda', async () => {
    const f = fetchFalso({ candidatos: [] });
    for (const quando of ['2026-09-29T15:30:00.000Z', '2026-09-29T10:00:00.000Z', '2026-09-29T23:00:00.000Z']) {
      const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => new Date(quando) });
      assert.equal(r.motivo, 'fora_da_rodada');
    }
    assert.equal(f.calls.length, 0);
  });
  await caso('sem URL de descadastro, nenhum lembrete', async () => {
    const f = fetchFalso({ candidatos: [] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_DESCADASTRO_URL: '' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'descadastro_nao_configurado');
    assert.equal(f.calls.length, 0);
  });
  await caso('URL de descadastro em outro caminho é recusada', async () => {
    const f = fetchFalso({ candidatos: [] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_DESCADASTRO_URL: 'https://diagnostico.olliorcamentos.online/outra' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'descadastro_nao_configurado');
  });
  await caso('rodada: lista, decide e enfileira até o teto (2)', async () => {
    const f = fetchFalso({ candidatos: [candidato(1), candidato(2), candidato(3)] });
    const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'ok');
    assert.equal(r.candidatos, 3);
    assert.equal(r.enfileirados, 2);
    assert.equal(r.decisoes.teto_da_rodada, 1);
    const lista = f.calls[0].body;
    assert.deepEqual(lista, { p_now: AGORA.toISOString(), p_ativacao_max_dias: 30, p_limit: 50 });
    const enq = f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email'));
    assert.equal(enq.length, 2);
    assert.equal(enq[0].body.p_template, 'lembrete_assinatura');
    assert.equal(enq[0].body.p_idempotency_key, `lembrete:assinatura:${U(1)}:renovacao:${VENCE}:D-3`);
    assert.equal(enq[0].body.p_teto_diario, 40);
    assert.deepEqual(enq[0].body.p_template_dados, {
      tipo: 'renovar_pix', plano: 'pro', venceEm: VENCE, momento: 'D-3', sequencia: `renovacao:${VENCE}`,
    });
  });
  await caso('MODE=production:ativacao: sai a ativação, a cobrança fica desligada e não ocupa vaga do teto', async () => {
    const f = fetchFalso({ candidatos: [candidato(1), candidato(2), contaNova(3)] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'production:ativacao', EMAIL_LEMBRETES_MAX_POR_RODADA: '1' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 1);
    assert.equal(r.decisoes.tipo_desligado, 2);
    assert.equal(r.decisoes.teto_da_rodada, undefined);
    const enq = f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email'));
    assert.equal(enq.length, 1);
    assert.equal(enq[0].body.p_template, 'lembrete_ativacao');
  });
  await caso('MODE=production:assinatura: a ativação fica desligada', async () => {
    const f = fetchFalso({ candidatos: [contaNova(1), candidato(2)] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'production:assinatura' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 1);
    assert.equal(r.decisoes.tipo_desligado, 1);
    assert.equal(f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email'))[0].body.p_template, 'lembrete_assinatura');
  });
  await caso('MODE=production puro (sem sufixo) = todos (comportamento de sempre)', async () => {
    const f = fetchFalso({ candidatos: [contaNova(1), candidato(2)] });
    const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 2);
  });
  await caso('MODE=production: com sufixo errado ou vazio = NADA sai (fail-closed)', async () => {
    for (const modo of ['production:ativaçao, todos', 'production:', 'production:   ']) {
      const f = fetchFalso({ candidatos: [contaNova(1), candidato(2)] });
      const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: modo }, { fetchImpl: f.fetchImpl, now: () => AGORA });
      assert.equal(r.enfileirados, 0);
      assert.equal(r.decisoes.tipo_desligado, 2);
      assert.equal(f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email')).length, 0);
    }
    const g = fetchFalso({ candidatos: [contaNova(1)] });
    const r2 = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'staging:ativacao' }, { fetchImpl: g.fetchImpl, now: () => AGORA });
    assert.equal(r2.mode, 'off');
  });
  await caso('lista de candidatos acima de 32 KB (o que parou a régua em 06/10) é lida inteira', async () => {
    const cheios = Array.from({ length: 50 }, (_, i) => {
      const c = contaNova(i + 1);
      c.candidato.historico = { ativacao: [], cobranca: [], reengajamento: [] };
      c.candidato.preenchimento = 'x'.repeat(900); // ~1 KB por candidato, como em produção
      return c;
    });
    const f = fetchFalso({ candidatos: cheios });
    const tamanho = JSON.stringify(cheios).length;
    assert.ok(tamanho > 32 * 1024 && tamanho < 128 * 1024, `fixture deve ficar entre 32 e 128 KB, ficou ${tamanho}`);
    const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'ok');
    assert.equal(r.candidatos, 50);
  });
  await caso('Grátis ilimitado: 3, 5 ou 12 envios no mês não enfileiram e-mail nenhum', async () => {
    const f = fetchFalso({ candidatos: [gratisComEnvios(1, 3), gratisComEnvios(2, 5), gratisComEnvios(3, 12)] });
    const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 0);
    assert.equal(f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email')).length, 0);
    assert.equal(r.decisoes.assinatura_tipo_sem_email, 3);
  });
  await caso('teto diário do banco encerra a rodada', async () => {
    const f = fetchFalso({
      candidatos: [candidato(1), candidato(2)],
      respostasEnqueue: [{ enfileirado: false, motivo: 'teto_diario' }],
    });
    const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 0);
    assert.equal(r.banco.teto_diario, 1);
    assert.equal(f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email')).length, 1);
  });
  await caso('recusa do banco (duplicado/limite) não conta como enfileirado', async () => {
    const f = fetchFalso({
      candidatos: [candidato(1), candidato(2)],
      respostasEnqueue: [{ enfileirado: false, motivo: 'duplicado' }, { enfileirado: false, motivo: 'limite_semanal' }],
    });
    const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 0);
    assert.deepEqual(r.banco, { duplicado: 1, limite_semanal: 1 });
  });
  await caso('erro do banco vira resumo "falhou", sem lançar', async () => {
    const fetchImpl = async () => new Response('{}', { status: 500 });
    const r = await processarLembretesEmail(ENV, { fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'falhou');
    assert.equal(r.codigo, 'supabase_rpc_500');
  });
  // ─── BATIMENTO: cada rodada real deixa ini/fim em webhook_events (origem 'lembretes_cron') ───
  function falsoWebhookEvents({ quebrar = false } = {}) {
    const original = globalThis.fetch;
    const chamadas = [];
    globalThis.fetch = async (url, init = {}) => {
      if (quebrar) throw new Error('rede fora');
      const metodo = init.method || 'GET';
      const u = new URL(url);
      if (u.pathname.endsWith('/rest/v1/webhook_events')) {
        chamadas.push({ metodo, url: String(url), body: init.body ? JSON.parse(init.body) : null });
        return new Response('', { status: metodo === 'POST' ? 201 : 204 });
      }
      return new Response('{}', { status: 200 });
    };
    return { chamadas, restaurar: () => { globalThis.fetch = original; } };
  }
  await caso('batimento: rodada real grava ini ANTES e fim DEPOIS, só com contagens e rótulos', async () => {
    const w = falsoWebhookEvents();
    try {
      const f = fetchFalso({ candidatos: [contaNova(1), candidato(2)] });
      const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'production:ativacao' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
      assert.equal(r.enfileirados, 1);
      const posts = w.chamadas.filter((c) => c.metodo === 'POST').map((c) => c.body);
      assert.deepEqual(posts.map((b) => b.event_id), ['ini|2026-09-29T15', 'fim|2026-09-29T15']);
      assert.ok(posts.every((b) => b.origem === 'lembretes_cron'));
      assert.deepEqual(posts[1].payload, {
        modo: 'production', motivo: 'ok', codigo: null, candidatos: 2, enfileirados: 1, pixVence: 0,
        decisoes: { ativacao: 1, tipo_desligado: 1 }, banco: { enfileirado: 1 },
      });
      const texto = JSON.stringify(w.chamadas);
      assert.equal(texto.includes(U(1)), false);
      assert.equal(/@/.test(texto), false);
      assert.equal(w.chamadas.filter((c) => c.metodo === 'PATCH').length, 2);
    } finally { w.restaurar(); }
  });
  await caso('batimento: modo off ou fora da hora cheia NÃO grava nada', async () => {
    const w = falsoWebhookEvents();
    try {
      const f = fetchFalso({ candidatos: [contaNova(1)] });
      await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MODE: 'off' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
      await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => new Date(AGORA.getTime() + 30 * 60e3) });
      assert.equal(w.chamadas.length, 0);
    } finally { w.restaurar(); }
  });
  await caso('batimento: motivo de saída antes da seleção (descadastro) também aparece no fim', async () => {
    const w = falsoWebhookEvents();
    try {
      const f = fetchFalso({ candidatos: [] });
      await processarLembretesEmail({ ...ENV, EMAIL_DESCADASTRO_URL: '' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
      const fim = w.chamadas.find((c) => c.metodo === 'POST' && c.body.event_id.startsWith('fim|'));
      assert.equal(fim.body.payload.motivo, 'descadastro_nao_configurado');
    } finally { w.restaurar(); }
  });
  await caso('batimento: erro do banco vira fim "falhou" com o código; falha de gravação não muda o resultado', async () => {
    const w = falsoWebhookEvents();
    try {
      const fetchImpl = async () => new Response('{}', { status: 500 });
      const r = await processarLembretesEmail(ENV, { fetchImpl, now: () => AGORA });
      assert.equal(r.motivo, 'falhou');
      const fim = w.chamadas.find((c) => c.metodo === 'POST' && c.body.event_id.startsWith('fim|'));
      assert.equal(fim.body.payload.motivo, 'falhou');
      assert.equal(fim.body.payload.codigo, 'supabase_rpc_500');
      const patchFim = w.chamadas.find((c) => c.metodo === 'PATCH' && c.url.includes('fim'));
      assert.ok(patchFim);
    } finally { w.restaurar(); }
    const quebrado = falsoWebhookEvents({ quebrar: true });
    try {
      const f = fetchFalso({ candidatos: [candidato(1)] });
      const r = await processarLembretesEmail(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
      assert.equal(r.motivo, 'ok');
      assert.equal(r.enfileirados, 1);
    } finally { quebrado.restaurar(); }
  });
  await caso('log da rodada não tem id de conta nem e-mail', async () => {
    const texto = logs.join('\n');
    assert.ok(texto.includes('email_lembretes_rodada'));
    assert.equal(texto.includes(U(1)), false);
    assert.equal(/@/.test(texto), false);
  });
} finally {
  console.log = originalLog;
  console.error = originalError;
}

console.log(`\nPASSOU: ${ok} casos — rodada de lembretes por e-mail`);
