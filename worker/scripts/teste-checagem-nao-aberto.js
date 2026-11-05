/**
 * Checagem da régua `nao_aberto` (Z-52 / #247). Não envia e-mail.
 *
 *     node scripts/teste-checagem-nao-aberto.js   (de dentro de worker/)
 *
 * Prova, com a lista nesta branch e a palavra fora do wrangler:
 *   - `production` sem sufixo NÃO pede `listar_nao_abertos_email`;
 *   - o sufixo vivo de hoje, sem a palavra, também não pede;
 *   - o sufixo com a palavra exata chama a lista, e a chamada passa por
 *     `sufixoLigaNaoAberto` (não marca `nao_aberto_bloqueado`);
 *   - off, staging e palavra parecida não chamam.
 */
import assert from 'node:assert/strict';
import { processarLembretesEmail } from '../src/emailLembretesJob.js';
import {
  TIPOS_LEMBRETE,
  lerTiposPermitidos,
  sufixoLigaNaoAberto,
} from '../src/emailLembretesPolicy.js';

const AGORA = new Date('2026-10-26T15:00:00.000Z'); // 12:00 BRT, hora cheia
const SUFIXO_VIVO = 'ativacao,assinatura,reengajamento,pix_vence';
const SUFIXO_COM_PALAVRA = `${SUFIXO_VIVO},nao_aberto`;

const ENV = Object.freeze({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-test-only-123456',
  WELCOME_DISPATCH_MODE: 'production',
  EMAIL_LEMBRETES_MODE: 'production',
  EMAIL_LEMBRETES_MAX_POR_RODADA: '2',
  EMAIL_LEMBRETES_TETO_DIARIO: '40',
  EMAIL_DESCADASTRO_URL: 'https://diagnostico.olliorcamentos.online/email/descadastrar',
});

const originalLog = console.log;
console.log = () => {};
console.error = () => {};
// O batimento usa fetch global. Aqui ele não sai da máquina.
globalThis.fetch = async () => {
  throw new Error('fetch_global_inesperado');
};

let ok = 0;
async function caso(nome, fn) {
  await fn();
  ok += 1;
  originalLog(`  ok   ${nome}`);
}

function fetchFalso() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const rpc = url.split('/rpc/')[1];
    calls.push({ rpc, body: JSON.parse(init.body) });
    if (rpc === 'listar_candidatos_lembrete_email') return Response.json([]);
    if (rpc === 'listar_pix_vence_email') return Response.json([]);
    if (rpc === 'listar_nao_abertos_email') return Response.json([]);
    if (rpc === 'enqueue_lembrete_email') return Response.json({ enfileirado: true, motivo: 'enfileirado' });
    throw new Error(`url_inesperada:${rpc}`);
  };
  return { calls, fetchImpl };
}

await caso('nao_aberto é tipo conhecido e o sufixo vivo de hoje não o inclui', () => {
  assert.equal(TIPOS_LEMBRETE.has('nao_aberto'), true);
  assert.equal(lerTiposPermitidos(SUFIXO_VIVO).has('nao_aberto'), false);
  assert.equal(lerTiposPermitidos('nao_aberto').has('nao_aberto'), true);
  assert.equal(lerTiposPermitidos('nao_abertos').has('nao_aberto'), false);
  assert.equal(lerTiposPermitidos('nao-aberto').size, 0);
});

await caso('sufixoLigaNaoAberto só com production e a palavra exata', () => {
  assert.equal(sufixoLigaNaoAberto('production'), false);
  assert.equal(sufixoLigaNaoAberto('production:'), false);
  assert.equal(sufixoLigaNaoAberto(`production:${SUFIXO_VIVO}`), false);
  assert.equal(sufixoLigaNaoAberto('off'), false);
  assert.equal(sufixoLigaNaoAberto('staging:nao_aberto'), false);
  assert.equal(sufixoLigaNaoAberto('production:nao-aberto'), false);
  assert.equal(sufixoLigaNaoAberto('production:nao_aberto_extra'), false);
  assert.equal(sufixoLigaNaoAberto('production:nao_abertos'), false);
  assert.equal(sufixoLigaNaoAberto(undefined), false);
  assert.equal(sufixoLigaNaoAberto(null), false);
  assert.equal(sufixoLigaNaoAberto('production:nao_aberto'), true);
  assert.equal(sufixoLigaNaoAberto(' production:NAO_ABERTO '), true);
  assert.equal(sufixoLigaNaoAberto(`production:${SUFIXO_COM_PALAVRA}`), true);
  assert.equal(sufixoLigaNaoAberto('production:ativacao, nao_aberto'), true);
});

async function rodada(modo) {
  const f = fetchFalso();
  const r = await processarLembretesEmail(
    { ...ENV, EMAIL_LEMBRETES_MODE: modo },
    { fetchImpl: f.fetchImpl, now: () => AGORA },
  );
  return { f, r };
}

function naoPediuLista(f) {
  assert.equal(f.calls.some((c) => c.rpc === 'listar_nao_abertos_email'), false);
  assert.equal(f.calls.some((c) => c.body?.p_template_dados?.tipo === 'nao_aberto'), false);
}

await caso('production sem sufixo não chama a lista e não marca bloqueio', async () => {
  const { f, r } = await rodada('production');
  assert.equal(r.motivo, 'ok');
  naoPediuLista(f);
  assert.equal(r.decisoes.nao_aberto_bloqueado, undefined);
  assert.equal(f.calls.some((c) => c.rpc === 'listar_pix_vence_email'), false);
});

await caso('sufixo vivo de hoje, sem a palavra, não chama a lista', async () => {
  const { f, r } = await rodada(`production:${SUFIXO_VIVO}`);
  assert.equal(r.motivo, 'ok');
  naoPediuLista(f);
  assert.equal(r.decisoes.nao_aberto_bloqueado, undefined);
  assert.equal(f.calls.some((c) => c.rpc === 'listar_pix_vence_email'), true);
});

await caso('sufixo com nao_aberto chama a lista e não marca bloqueio', async () => {
  for (const modo of ['production:nao_aberto', `production:${SUFIXO_COM_PALAVRA}`, 'production:NAO_ABERTO']) {
    const { f, r } = await rodada(modo);
    assert.equal(r.motivo, 'ok', modo);
    assert.equal(r.decisoes.nao_aberto_bloqueado, undefined, modo);
    assert.equal(r.enfileirados, 0, modo);
    assert.equal(f.calls.some((c) => c.rpc === 'listar_nao_abertos_email'), true, modo);
    assert.equal(f.calls.some((c) => c.body?.p_template_dados?.tipo === 'nao_aberto'), false, modo);
  }
});

await caso('modo off e staging não chamam a lista', async () => {
  for (const modo of ['off', 'staging', 'staging:nao_aberto', '']) {
    const { f, r } = await rodada(modo);
    assert.equal(r.mode, 'off', modo);
    naoPediuLista(f);
    assert.equal(f.calls.length, 0, modo);
  }
});

await caso('palavra parecida não bloqueia nem chama a lista', async () => {
  const { f, r } = await rodada('production:nao-aberto');
  assert.equal(r.motivo, 'ok');
  assert.equal(r.decisoes.nao_aberto_bloqueado, undefined);
  naoPediuLista(f);
});

originalLog(`${ok} casos ok`);
