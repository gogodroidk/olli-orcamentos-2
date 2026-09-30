/**
 * Teste da RODADA do resumo diário (`src/resumoDinheiroJob.js`) com fetch falso.
 *
 *     node scripts/teste-resumo-dinheiro-job.js   (de dentro de worker/)
 *
 * Protege os portões (modo, dispatch real, janela das 7h, descadastro configurado),
 * a rodada certa e os tetos passados ao banco, o teto por rodada, a parada no teto
 * diário, a chave de idempotência por conta + dia, "nada acionável" sem enqueue,
 * uma conta ilegível que não derruba a rodada e o log sem PII.
 */
import assert from 'node:assert/strict';
import { configResumo, processarResumoDinheiro } from '../src/resumoDinheiroJob.js';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const AGORA = new Date('2026-09-30T10:20:00.000Z'); // quarta, 7h20 em Brasília → rodada 2
const D = 864e5;
const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
  WELCOME_DISPATCH_MODE: 'production',
  EMAIL_RESUMO_MODE: 'production',
  EMAIL_RESUMO_MAX_POR_RODADA: '2',
  EMAIL_DESCADASTRO_URL: 'https://diagnostico.olliorcamentos.online/email/descadastrar',
});

function dadosCom(valor) {
  return {
    orcamentos: valor > 0
      ? [{ id: 'o1', status: 'aprovado', valor_total: valor, atualizado_em: new Date(AGORA - 5 * D).toISOString(), dados: { clienteNome: 'Maria Silva' } }]
      : [],
    recibos: [], clientes: [], agendamentos: [], osConcluidas: [], adiados: {}, lembrados: {}, verticais: null, truncado: false,
  };
}

function fetchFalso({ candidatos, dados = {}, respostasEnqueue = [] }) {
  const calls = [];
  const fila = [...respostasEnqueue];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith('/rpc/listar_candidatos_resumo_dinheiro')) return Response.json(candidatos.map((id) => ({ user_id: id })));
    if (url.endsWith('/rpc/dados_resumo_dinheiro')) {
      const d = dados[body.p_user_id];
      if (d === 'erro') return new Response('{}', { status: 500 });
      return Response.json(d ?? dadosCom(1000));
    }
    if (url.endsWith('/rpc/enqueue_resumo_dinheiro_email')) return Response.json(fila.shift() ?? { enfileirado: true, motivo: 'enfileirado' });
    throw new Error(`url_inesperada:${url}`);
  };
  return { calls, fetchImpl };
}
const rpc = (f, nome) => f.calls.filter((c) => c.url.endsWith(`/rpc/${nome}`));

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
  await caso('modo off (ou ausente) não chama rede', async () => {
    const f = fetchFalso({ candidatos: [] });
    for (const modo of ['off', undefined, 'staging']) {
      const r = await processarResumoDinheiro({ ...ENV, EMAIL_RESUMO_MODE: modo }, { fetchImpl: f.fetchImpl, now: () => AGORA });
      assert.equal(r.mode, 'off');
    }
    assert.equal(f.calls.length, 0);
  });

  await caso('sem dispatch em production não acumula fila', async () => {
    const f = fetchFalso({ candidatos: [] });
    const r = await processarResumoDinheiro({ ...ENV, WELCOME_DISPATCH_MODE: 'simulator' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'dispatch_nao_production');
    assert.equal(f.calls.length, 0);
  });

  await caso('fora da janela (7h05, 8h, 6h50, domingo) não chama rede', async () => {
    const f = fetchFalso({ candidatos: [] });
    for (const iso of ['2026-09-30T10:05:00Z', '2026-09-30T11:00:00Z', '2026-09-30T09:50:00Z', '2026-10-04T10:00:00Z']) {
      const r = await processarResumoDinheiro(ENV, { fetchImpl: f.fetchImpl, now: () => new Date(iso) });
      assert.equal(r.motivo, 'fora_da_rodada', iso);
    }
    assert.equal(f.calls.length, 0);
  });

  await caso('sem descadastro configurado não sai resumo', async () => {
    const f = fetchFalso({ candidatos: [] });
    const r = await processarResumoDinheiro({ ...ENV, EMAIL_DESCADASTRO_URL: 'https://outro.site/x' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'descadastro_nao_configurado');
    const r2 = await processarResumoDinheiro({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' }, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r2.motivo, 'supabase_nao_configurado');
    assert.equal(f.calls.length, 0);
  });

  await caso('rodada, tetos e chave vão ao banco; teto por rodada segura o resto', async () => {
    const f = fetchFalso({ candidatos: [U(1), U(2), U(3), U(1)] });
    const r = await processarResumoDinheiro(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    const [lista] = rpc(f, 'listar_candidatos_resumo_dinheiro');
    assert.deepEqual(lista.body, {
      p_now: AGORA.toISOString(), p_max_semana: 3, p_intervalo_min_horas: 44,
      p_rodada: 2, p_rodadas: 6, p_limit: 15,
    });
    const enq = rpc(f, 'enqueue_resumo_dinheiro_email');
    assert.equal(enq.length, 2);
    assert.equal(rpc(f, 'dados_resumo_dinheiro').length, 2); // a 3ª conta nem é lida
    assert.deepEqual(enq[0].body, {
      p_user_id: U(1),
      p_idempotency_key: `resumo:dinheiro:${U(1)}:2026-09-30`,
      p_template_dados: {
        data: '2026-09-30', aReceberCentavos: 100000, aReceberItens: 1, diasMaisAntigo: 5,
        semValor: 0, propostasParadas: 0, clientesParaLembrar: 0,
      },
      p_max_semana: 3, p_intervalo_min_horas: 44, p_teto_diario: 100, p_now: AGORA.toISOString(),
    });
    assert.equal(r.enfileirados, 2);
    assert.equal(r.candidatos, 3); // duplicado descartado
    assert.equal(r.decisoes.teto_da_rodada, 1);
  });

  await caso('nada acionável não enfileira; conta ilegível não derruba a rodada', async () => {
    const f = fetchFalso({
      candidatos: [U(1), U(2), U(3)],
      dados: { [U(1)]: dadosCom(0), [U(2)]: 'erro', [U(3)]: { ...dadosCom(500), truncado: true } },
    });
    const r = await processarResumoDinheiro(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(rpc(f, 'enqueue_resumo_dinheiro_email').length, 0);
    assert.deepEqual(r.decisoes, { nada_acionavel: 1, dados_erro: 1, dados_truncados: 1 });
    assert.equal(r.motivo, 'ok');
  });

  await caso('teto diário do banco para a rodada', async () => {
    const f = fetchFalso({
      candidatos: [U(1), U(2)],
      respostasEnqueue: [{ enfileirado: false, motivo: 'teto_diario' }],
    });
    const r = await processarResumoDinheiro(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(rpc(f, 'enqueue_resumo_dinheiro_email').length, 1);
    assert.equal(r.enfileirados, 0);
    assert.deepEqual(r.banco, { teto_diario: 1 });
  });

  await caso('idempotência: duplicado do banco não conta como enviado', async () => {
    const f = fetchFalso({ candidatos: [U(1)], respostasEnqueue: [{ enfileirado: false, motivo: 'duplicado' }] });
    const r = await processarResumoDinheiro(ENV, { fetchImpl: f.fetchImpl, now: () => AGORA });
    assert.equal(r.enfileirados, 0);
    assert.deepEqual(r.banco, { duplicado: 1 });
  });

  await caso('falha na listagem = rodada falha fechado, sem enqueue', async () => {
    const fetchImpl = async () => new Response('{}', { status: 503 });
    const r = await processarResumoDinheiro(ENV, { fetchImpl, now: () => AGORA });
    assert.equal(r.motivo, 'falhou');
    assert.equal(r.codigo, 'supabase_rpc_503');
  });

  await caso('configuração: padrões conservadores e limites', () => {
    assert.deepEqual({ ...configResumo({}) }, { maxSemana: 3, intervaloMinHoras: 44, tetoRodada: 8, maxAvaliacoes: 15, tetoDiario: 100 });
    assert.deepEqual({ ...configResumo({ EMAIL_RESUMO_MAX_SEMANA: '99', EMAIL_RESUMO_INTERVALO_MIN_HORAS: '1', EMAIL_RESUMO_MAX_POR_RODADA: 'x' }) },
      { maxSemana: 3, intervaloMinHoras: 44, tetoRodada: 8, maxAvaliacoes: 15, tetoDiario: 100 });
    assert.equal(configResumo({ EMAIL_RESUMO_MAX_SEMANA: '1' }).maxSemana, 1);
  });

  await caso('log sem PII (nem id de conta, nem nome, nem valor)', async () => {
    const texto = logs.join('\n');
    assert.equal(texto.includes(U(1)), false);
    assert.equal(/Maria|100000|R\$/.test(texto), false);
    assert.ok(texto.includes('email_resumo_dinheiro_rodada'));
  });
} finally {
  console.log = originalLog;
  console.error = originalError;
}

console.log(`\nPASSOU: ${ok} casos — rodada do resumo diário`);
