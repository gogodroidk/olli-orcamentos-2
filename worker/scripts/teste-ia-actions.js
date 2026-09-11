import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createPersistedAiActionDraft,
  handleIaActions,
  validateAiActionProposal,
} from '../src/iaActions.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ACTION_ID = '00000000-0000-4000-8000-000000000099';
const TOKEN = '00000000-0000-4000-8000-000000000077';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');
const ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'publishable-test-only',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-only',
  IA_RL: { limit: async () => ({ success: true }) },
};

assert.equal(validateAiActionProposal({
  escopo: 'orcamento', alvo: '00126', resumo: 'Aprovar orçamento',
  mudancas: [{ campo: 'status', proposto: 'aprovado' }],
}).ok, true);
assert.deepEqual(validateAiActionProposal({
  escopo: 'orcamento', alvo: '00126', resumo: 'Trocar usuário',
  mudancas: [{ campo: 'user_id', proposto: USER_ID }],
}), { ok: false, reason: 'field_not_allowed' });
assert.deepEqual(validateAiActionProposal({
  escopo: 'agenda', alvo: 'Visita João', resumo: 'Status inválido',
  mudancas: [{ campo: 'status', proposto: 'pago' }],
}), { ok: false, reason: 'value_invalid' });
assert.equal(validateAiActionProposal({
  escopo: 'produto', alvo: 'Disjuntor', resumo: 'Atualizar preço',
  mudancas: [{ campo: 'preco', proposto: 42.567 }],
}).changes[0].proposed, 42.57);
assert.deepEqual(validateAiActionProposal({
  escopo: 'orcamento', alvo: '00126', resumo: 'Validade impossível',
  mudancas: [{ campo: 'validadeOrcamento', proposto: '31/02/2026' }],
}), { ok: false, reason: 'value_invalid' });
assert.deepEqual(validateAiActionProposal({
  escopo: 'empresa', alvo: 'Minha empresa', resumo: 'Cor inválida',
  mudancas: [{ campo: 'corMarca', proposto: 'azul' }],
}), { ok: false, reason: 'value_invalid' });

async function testDraftCreation() {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/organizacao_membros?')) return Response.json([]);
    if (String(url).includes('/orcamentos?')) {
      return Response.json([{ id: ACTION_ID, user_id: USER_ID, numero: '00126', dados: { status: 'enviado' }, atualizado_em: '2026-09-05T12:00:00.000Z' }]);
    }
    if (String(url).endsWith('/ia_action_drafts')) return new Response(null, { status: 201 });
    if (String(url).includes('/ia_action_events?')) return new Response(null, { status: 201 });
    throw new Error(`url_inesperada:${url}`);
  };
  try {
    const result = await createPersistedAiActionDraft(ENV, { id: USER_ID }, {
      escopo: 'orcamento', alvo: '00126', resumo: 'Aprovar orçamento',
      mudancas: [{ campo: 'status', proposto: 'aprovado' }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.draft.targetLabel, '00126');
    assert.deepEqual(result.draft.changes, [{ field: 'status', before: 'enviado', after: 'aprovado' }]);
    const stored = JSON.parse(calls.find((call) => call.url.endsWith('/ia_action_drafts')).init.body);
    assert.equal(stored.before_state.status, 'enviado');
    assert.equal(stored.after_state.status, 'aprovado');
    assert.match(stored.confirmation_token_hash, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(stored, 'confirmationToken'), false);
    assert.equal(Object.hasOwn(stored, 'target_label'), false);
    assert.equal(JSON.stringify(stored).includes('Aprovar orçamento'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testWildcardTargetDoesNotSelectOnlyRow() {
  const originalFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST' || init.method === 'PATCH') writes += 1;
    if (String(url).includes('/organizacao_membros?')) return Response.json([]);
    if (String(url).includes('/clientes?')) {
      return Response.json([{ id: ACTION_ID, user_id: USER_ID, nome: 'Cliente Real', telefone: '11999999999', atualizado_em: '2026-09-05T12:00:00.000Z' }]);
    }
    throw new Error(`url_inesperada:${url}`);
  };
  try {
    const result = await createPersistedAiActionDraft(ENV, { id: USER_ID }, {
      escopo: 'cliente', alvo: '%', resumo: 'Alterar telefone',
      mudancas: [{ campo: 'telefone', proposto: '11888888888' }],
    });
    assert.deepEqual(result, { ok: false, reason: 'target_not_found' });
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function storedDraft(status = 'aguardando_confirmacao') {
  return {
    id: ACTION_ID,
    tenant_user_id: USER_ID,
    org_id: null,
    actor_user_id: USER_ID,
    actor_role: 'pessoal',
    scope: 'orcamento',
    record_id: ACTION_ID,
    summary: 'Alterar status em orcamento',
    status,
    confirmation_token_hash: TOKEN_HASH,
    before_state: { status: 'enviado' },
    after_state: { status: 'aprovado' },
    rollback_state: { status: 'enviado' },
    expires_at: '2099-09-05T12:00:00.000Z',
  };
}

async function testConfirmation() {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    calls.push({ url: address, init });
    if (address.endsWith('/auth/v1/user')) return Response.json({ id: USER_ID });
    if (address.includes('/ia_action_drafts?') && (!init.method || init.method === 'GET')) return Response.json([storedDraft()]);
    if (address.includes('/organizacao_membros?')) return Response.json([]);
    if (address.includes('/orcamentos?') && (!init.method || init.method === 'GET')) {
      return Response.json([{ id: ACTION_ID, user_id: USER_ID, numero: '00126', dados: { status: 'enviado', clienteNome: 'Cliente' }, atualizado_em: '2026-09-05T12:00:00.000Z' }]);
    }
    if (address.includes('/orcamentos?') && init.method === 'PATCH') return Response.json([{ id: ACTION_ID }]);
    if (address.includes('/ia_action_drafts?') && init.method === 'PATCH') return Response.json([{ id: ACTION_ID }]);
    if (address.includes('/ia_action_events?')) return new Response(null, { status: 201 });
    throw new Error(`url_inesperada:${url}`);
  };
  try {
    const request = new Request('https://diagnostico.olliorcamentos.online/ia/acoes/confirmar', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-test-only', 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId: ACTION_ID, confirmationToken: TOKEN }),
    });
    const response = await handleIaActions(request, ENV, new URL(request.url));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'aplicada');
    const businessPatch = calls.find((call) => call.url.includes('/orcamentos?') && call.init.method === 'PATCH');
    assert.match(businessPatch.url, /atualizado_em=eq\.2026-09-05T12%3A00%3A00\.000Z/);
    const payload = JSON.parse(businessPatch.init.body);
    assert.equal(payload.status, 'aprovado');
    assert.equal(payload.dados.status, 'aprovado');
    assert.equal(payload.dados.clienteNome, 'Cliente');
    assert.equal(calls.filter((call) => call.url.includes('/ia_action_events?')).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testInvalidToken() {
  const originalFetch = globalThis.fetch;
  let mutations = 0;
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (init.method === 'PATCH' || init.method === 'POST') mutations += 1;
    if (address.endsWith('/auth/v1/user')) return Response.json({ id: USER_ID });
    if (address.includes('/ia_action_drafts?')) return Response.json([storedDraft()]);
    throw new Error(`url_inesperada:${url}`);
  };
  try {
    const request = new Request('https://diagnostico.olliorcamentos.online/ia/acoes/confirmar', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-test-only', 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionId: ACTION_ID, confirmationToken: 'token-errado' }),
    });
    const response = await handleIaActions(request, ENV, new URL(request.url));
    assert.equal(response.status, 403);
    assert.equal(mutations, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await testDraftCreation();
await testWildcardTargetDoesNotSelectOnlyRow();
await testConfirmation();
await testInvalidToken();

const migration = readFileSync(new URL('../../supabase/migrations/20260906021103_ia_actions_safe_runtime.sql', import.meta.url), 'utf8');
assert.match(migration, /force row level security/gi);
assert.match(migration, /revoke all on table public\.ia_action_drafts from public, anon, authenticated/i);
assert.match(migration, /grant select, insert, update on table public\.ia_action_drafts to service_role/i);
assert.match(migration, /confirmation_token_hash/);
assert.match(migration, /interval '30 days'/);
assert.match(migration, /purge_expired_ia_actions/);
assert.doesNotMatch(migration, /security definer/i);

console.log('PASSOU: ações IA — allowlist, prévia persistida, confirmação, espelho, auditoria e retenção');
