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

function candidato(n, usados = 3) {
  return {
    candidato: {
      userId: U(n),
      confirmadoEm: new Date(AGORA.getTime() - 60 * 24 * H).toISOString(),
      orcamentos: usados + 1,
      membroDeEquipe: false,
      donoDoTenant: true,
      assinatura: null,
      oferta: {
        plano_efetivo: 'gratis', limite_envios: 5, envios_usados: usados, envios_restantes: 5 - usados,
        trial_estado: 'ended', trial_termina_em: null, trial_dias: 14,
      },
      historico: { ativacao: [], cobranca: [] },
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
    assert.equal(enq[0].body.p_idempotency_key, `lembrete:assinatura:${U(1)}:cota_quase:2026-09`);
    assert.equal(enq[0].body.p_teto_diario, 40);
    assert.deepEqual(enq[0].body.p_template_dados, { tipo: 'cota_quase', limite: 5, usados: 3, restantes: 2 });
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
