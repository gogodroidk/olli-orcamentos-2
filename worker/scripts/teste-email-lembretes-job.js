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
  await caso('EMAIL_LEMBRETES_TIPOS=ativacao: sai a ativação, a cobrança fica desligada e não ocupa vaga do teto', async () => {
    const f = fetchFalso({ candidatos: [candidato(1), candidato(2), contaNova(3)] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_MAX_POR_RODADA: '1', EMAIL_LEMBRETES_TIPOS: 'ativacao' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 1);
    assert.equal(r.decisoes.tipo_desligado, 2);
    assert.equal(r.decisoes.teto_da_rodada, undefined);
    const enq = f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email'));
    assert.equal(enq.length, 1);
    assert.equal(enq[0].body.p_template, 'lembrete_ativacao');
  });
  await caso('EMAIL_LEMBRETES_TIPOS=assinatura: a ativação fica desligada', async () => {
    const f = fetchFalso({ candidatos: [contaNova(1), candidato(2)] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_TIPOS: 'assinatura' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 1);
    assert.equal(r.decisoes.tipo_desligado, 1);
    assert.equal(f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email'))[0].body.p_template, 'lembrete_assinatura');
  });
  await caso('EMAIL_LEMBRETES_TIPOS ausente ou vazio = todos (comportamento de sempre)', async () => {
    for (const valor of [undefined, '', '   ']) {
      const f = fetchFalso({ candidatos: [contaNova(1), candidato(2)] });
      const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_TIPOS: valor }, { fetchImpl: f.fetchImpl, now: () => AGORA });
      assert.equal(r.enfileirados, 2);
    }
  });
  await caso('EMAIL_LEMBRETES_TIPOS com erro de digitação = NADA sai (fail-closed)', async () => {
    const f = fetchFalso({ candidatos: [contaNova(1), candidato(2)] });
    const r = await processarLembretesEmail({ ...ENV, EMAIL_LEMBRETES_TIPOS: 'ativaçao, todos' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 0);
    assert.equal(r.decisoes.tipo_desligado, 2);
    assert.equal(f.calls.filter((c) => c.url.endsWith('/rpc/enqueue_lembrete_email')).length, 0);
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
