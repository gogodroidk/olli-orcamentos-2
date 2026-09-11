const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

export const IA_ACTION_VERSION = '2026-09-06.v1';
export const IA_ACTION_MAX_BODY_BYTES = 32 * 1024;

const ROLE_SCOPES = Object.freeze({
  pessoal: new Set(['orcamento', 'cliente', 'produto', 'servico', 'agenda', 'empresa']),
  owner: new Set(['orcamento', 'cliente', 'produto', 'servico', 'agenda', 'empresa', 'equipe']),
  admin: new Set(['orcamento', 'cliente', 'agenda', 'equipe']),
  gestor: new Set(['orcamento', 'cliente', 'agenda']),
  tecnico: new Set(['orcamento', 'cliente', 'agenda']),
});

const STATUS_ORCAMENTO = new Set([
  'rascunho', 'enviado', 'visualizado', 'em_negociacao', 'aguardando_assinatura',
  'aprovado', 'recusado', 'expirado', 'cancelado', 'convertido',
]);
const STATUS_AGENDA = new Set(['agendado', 'concluido', 'cancelado']);
const PAPEIS_EQUIPE = new Set(['admin', 'gestor', 'tecnico']);
const NULLABLE_FIELDS = new Set([
  'validadeOrcamento', 'condicoesPagamento', 'garantia', 'informacoesAdicionais', 'laudoTecnico',
  'endereco', 'complemento', 'cidade', 'estado', 'cep', 'descricao', 'custo', 'marca', 'modelo',
  'fim', 'observacao', 'whatsapp', 'email', 'site', 'especialidade', 'slogan', 'corMarca',
]);

const SCOPES = Object.freeze({
  orcamento: {
    table: 'orcamentos', labelColumn: 'numero', blob: true,
    fields: new Set(['status', 'validadeOrcamento', 'condicoesPagamento', 'garantia', 'informacoesAdicionais', 'laudoTecnico']),
  },
  cliente: {
    table: 'clientes', labelColumn: 'nome',
    fields: new Set(['nome', 'telefone', 'endereco', 'complemento', 'cidade', 'estado', 'cep']),
  },
  produto: {
    table: 'produtos', labelColumn: 'nome',
    fields: new Set(['nome', 'descricao', 'preco', 'custo', 'unidade', 'marca', 'modelo']),
  },
  servico: {
    table: 'servicos', labelColumn: 'nome',
    fields: new Set(['nome', 'descricao', 'preco', 'custo', 'unidade']),
  },
  agenda: {
    table: 'agendamentos', labelColumn: 'titulo',
    fields: new Set(['titulo', 'inicio', 'fim', 'status', 'observacao', 'endereco']),
  },
  empresa: {
    table: 'empresa', labelColumn: 'nome', blob: true,
    fields: new Set(['nome', 'telefone', 'whatsapp', 'email', 'endereco', 'cidade', 'estado', 'site', 'especialidade', 'slogan', 'corMarca']),
  },
  equipe: {
    table: 'organizacao_membros', labelColumn: 'email', team: true,
    fields: new Set(['papel', 'ativo']),
  },
});

const COLUMN_BY_FIELD = Object.freeze({
  nome: 'nome', telefone: 'telefone', endereco: 'endereco', complemento: 'complemento',
  cidade: 'cidade', estado: 'estado', cep: 'cep', descricao: 'descricao', preco: 'preco',
  custo: 'custo', unidade: 'unidade', marca: 'marca', modelo: 'modelo', titulo: 'titulo',
  inicio: 'inicio', fim: 'fim', status: 'status', observacao: 'observacao', papel: 'papel', ativo: 'ativo',
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function safeText(value, limit, { required = true } = {}) {
  if (value === null && !required) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if ((required && !normalized) || normalized.length > limit) return null;
  return normalized;
}

function safeId(value, limit = 160) {
  const normalized = safeText(value, limit);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized) ? normalized : null;
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameTarget(left, right) {
  return String(left ?? '').trim().toLocaleLowerCase('pt-BR') === String(right ?? '').trim().toLocaleLowerCase('pt-BR');
}

function constantEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !env?.SUPABASE_URL || !env?.SUPABASE_ANON_KEY) return null;
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user?.id && isUuid(user.id) ? user : null;
  } catch {
    return null;
  }
}

async function contextForUser(env, userId) {
  try {
    const memberResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizacao_membros?user_id=eq.${encodeURIComponent(userId)}` +
      '&ativo=eq.true&select=org_id,papel&order=criado_em.asc&limit=1',
      { headers: sbHeaders(env) },
    );
    if (!memberResponse.ok) return { ok: false, reason: 'context_unavailable' };
    const members = await memberResponse.json().catch(() => null);
    if (!Array.isArray(members)) return { ok: false, reason: 'context_unavailable' };
    if (!members.length) return { ok: true, tenantUserId: userId, orgId: null, role: 'pessoal' };

    const member = members[0];
    if (!isUuid(member.org_id) || !ROLE_SCOPES[member.papel]) return { ok: false, reason: 'context_invalid' };
    const orgResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizacoes?id=eq.${encodeURIComponent(member.org_id)}` +
      '&select=owner_user_id&limit=1',
      { headers: sbHeaders(env) },
    );
    if (!orgResponse.ok) return { ok: false, reason: 'context_unavailable' };
    const organizations = await orgResponse.json().catch(() => null);
    const ownerUserId = Array.isArray(organizations) ? organizations[0]?.owner_user_id : null;
    if (!isUuid(ownerUserId)) return { ok: false, reason: 'context_invalid' };
    return { ok: true, tenantUserId: ownerUserId, orgId: member.org_id, role: member.papel };
  } catch {
    return { ok: false, reason: 'context_unavailable' };
  }
}

function normalizedValue(scope, field, value) {
  if (field === 'ativo') return typeof value === 'boolean' ? value : undefined;
  if (field === 'preco' || field === 'custo') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000_000
      ? Math.round(value * 100) / 100
      : undefined;
  }
  if (field === 'status' && scope === 'orcamento') return STATUS_ORCAMENTO.has(value) ? value : undefined;
  if (field === 'status' && scope === 'agenda') return STATUS_AGENDA.has(value) ? value : undefined;
  if (field === 'papel') return PAPEIS_EQUIPE.has(value) ? value : undefined;
  if (field === 'fim' && value === null) return null;
  if (field === 'inicio' || field === 'fim') {
    if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return undefined;
    return new Date(value).toISOString();
  }
  if (field === 'validadeOrcamento') {
    if (value === null) return null;
    if (typeof value !== 'string') return undefined;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match) return undefined;
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? value.trim()
      : undefined;
  }
  if (value === null) return NULLABLE_FIELDS.has(field) ? null : undefined;
  const max = field === 'informacoesAdicionais' || field === 'laudoTecnico' ? 4000 : 500;
  const text = safeText(value, max, { required: !['complemento', 'descricao', 'garantia', 'informacoesAdicionais', 'laudoTecnico', 'observacao'].includes(field) });
  if (text === null) return undefined;
  if (field === 'estado' && text && !/^[A-Za-z]{2}$/.test(text)) return undefined;
  if (field === 'cep' && text && !/^\d{5}-?\d{3}$/.test(text)) return undefined;
  if (field === 'email' && text && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text)) return undefined;
  if (field === 'corMarca' && text && !/^#[0-9a-fA-F]{6}$/.test(text)) return undefined;
  return field === 'estado' && text ? text.toUpperCase() : text;
}

export function validateAiActionProposal(value) {
  const input = plainObject(value);
  if (!input) return { ok: false, reason: 'proposal_invalid' };
  const scope = safeText(input.escopo, 40);
  const config = scope ? SCOPES[scope] : null;
  const target = safeText(input.alvo, 160);
  const summary = safeText(input.resumo, 240);
  if (!config || !target || !summary || !Array.isArray(input.mudancas) || input.mudancas.length < 1 || input.mudancas.length > 6) {
    return { ok: false, reason: 'proposal_invalid' };
  }
  const fields = new Set();
  const changes = [];
  for (const rawChange of input.mudancas) {
    const change = plainObject(rawChange);
    const field = change ? safeText(change.campo, 80) : null;
    if (!field || fields.has(field) || !config.fields.has(field)) return { ok: false, reason: 'field_not_allowed' };
    const proposed = normalizedValue(scope, field, change.proposto);
    if (proposed === undefined) return { ok: false, reason: 'value_invalid' };
    fields.add(field);
    changes.push(Object.freeze({ field, proposed }));
  }
  return { ok: true, scope, target, summary, changes: Object.freeze(changes) };
}

function selectForScope(scope, fields) {
  const config = SCOPES[scope];
  if (config.blob) return config.table === 'empresa' ? 'user_id,dados,atualizado_em' : `id,user_id,${config.labelColumn},dados,atualizado_em`;
  if (config.team) return 'user_id,org_id,papel,ativo';
  const columns = fields.map((field) => COLUMN_BY_FIELD[field]).filter(Boolean);
  return ['id', 'user_id', config.labelColumn, 'atualizado_em', ...columns].filter((field, index, all) => all.indexOf(field) === index).join(',');
}

async function fetchRows(env, path) {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(env, { Accept: 'application/json' }) });
    if (!response.ok) return { ok: false, rows: [] };
    const rows = await response.json().catch(() => null);
    return Array.isArray(rows) ? { ok: true, rows } : { ok: false, rows: [] };
  } catch {
    return { ok: false, rows: [] };
  }
}

async function resolveTarget(env, context, proposal) {
  const config = SCOPES[proposal.scope];
  const fields = proposal.changes.map((change) => change.field);
  if (config.table === 'empresa') {
    const result = await fetchRows(
      env,
      `empresa?user_id=eq.${encodeURIComponent(context.tenantUserId)}&select=${encodeURIComponent(selectForScope(proposal.scope, fields))}&limit=1`,
    );
    if (!result.ok) return { ok: false, reason: 'target_unavailable' };
    if (result.rows.length !== 1) return { ok: false, reason: 'target_not_found' };
    return { ok: true, row: result.rows[0], recordId: context.tenantUserId, label: result.rows[0]?.dados?.nome || 'Meu negócio' };
  }

  if (config.team) {
    if (!context.orgId) return { ok: false, reason: 'organization_required' };
    const filter = isUuid(proposal.target)
      ? `user_id=eq.${encodeURIComponent(proposal.target)}`
      : `email=ilike.${encodeURIComponent(proposal.target)}`;
    const result = await fetchRows(
      env,
      `organizacao_membros_perfil?org_id=eq.${encodeURIComponent(context.orgId)}&${filter}&select=user_id,org_id,papel,ativo,nome,email&limit=20`,
    );
    if (!result.ok) return { ok: false, reason: 'target_unavailable' };
    const exactRows = isUuid(proposal.target)
      ? result.rows
      : result.rows.filter((row) => sameTarget(row.email, proposal.target));
    if (exactRows.length !== 1) return { ok: false, reason: exactRows.length ? 'target_ambiguous' : 'target_not_found' };
    const row = exactRows[0];
    if (row.papel === 'owner') return { ok: false, reason: 'owner_protected' };
    return { ok: true, row, recordId: row.user_id, label: row.nome || row.email || 'Membro da equipe' };
  }

  const filter = isUuid(proposal.target)
    ? `id=eq.${encodeURIComponent(proposal.target)}`
    : `${config.labelColumn}=ilike.${encodeURIComponent(proposal.target)}`;
  const result = await fetchRows(
    env,
    `${config.table}?user_id=eq.${encodeURIComponent(context.tenantUserId)}&excluido_em=is.null&${filter}` +
    `&select=${encodeURIComponent(selectForScope(proposal.scope, fields))}&limit=20`,
  );
  if (!result.ok) return { ok: false, reason: 'target_unavailable' };
  const exactRows = isUuid(proposal.target)
    ? result.rows
    : result.rows.filter((row) => sameTarget(row[config.labelColumn], proposal.target));
  if (exactRows.length !== 1) return { ok: false, reason: exactRows.length ? 'target_ambiguous' : 'target_not_found' };
  return { ok: true, row: exactRows[0], recordId: exactRows[0].id, label: String(exactRows[0][config.labelColumn] || proposal.target) };
}

function projectState(scope, row, fields) {
  const config = SCOPES[scope];
  const source = config.blob ? plainObject(row.dados) || {} : row;
  const state = {};
  for (const field of fields) {
    const column = config.blob ? field : COLUMN_BY_FIELD[field];
    state[field] = source[column] ?? null;
  }
  return state;
}

async function insertEvent(env, actionId, revision, eventType, actorUserId) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/ia_action_events?on_conflict=action_id,revision`, {
    method: 'POST',
    headers: sbHeaders(env, {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    }),
    body: JSON.stringify({ action_id: actionId, revision, event_type: eventType, actor_user_id: actorUserId }),
  });
  return response.ok;
}

async function insertDraft(env, draft) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/ia_action_drafts`, {
    method: 'POST',
    headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(draft),
  });
  return response.ok;
}

export async function createPersistedAiActionDraft(env, user, rawProposal) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY || !isUuid(user?.id)) {
    return { ok: false, reason: 'persistence_unavailable' };
  }
  const proposal = validateAiActionProposal(rawProposal);
  if (!proposal.ok) return proposal;
  const context = await contextForUser(env, user.id);
  if (!context.ok) return context;
  if (!ROLE_SCOPES[context.role]?.has(proposal.scope)) return { ok: false, reason: 'role_not_allowed' };

  const target = await resolveTarget(env, context, proposal);
  if (!target.ok) return target;
  if (proposal.scope === 'equipe' && target.recordId === user.id) return { ok: false, reason: 'self_membership_protected' };
  const fields = proposal.changes.map((change) => change.field);
  const beforeState = projectState(proposal.scope, target.row, fields);
  const afterState = { ...beforeState };
  for (const change of proposal.changes) afterState[change.field] = change.proposed;
  if (sameJson(beforeState, afterState)) return { ok: false, reason: 'no_change' };

  const actionId = crypto.randomUUID();
  const confirmationToken = crypto.randomUUID();
  const tokenHash = await sha256(confirmationToken);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const draft = {
    id: actionId,
    version: IA_ACTION_VERSION,
    tenant_user_id: context.tenantUserId,
    org_id: context.orgId,
    actor_user_id: user.id,
    actor_role: context.role,
    scope: proposal.scope,
    record_id: target.recordId,
    summary: `Alterar ${fields.join(', ')} em ${proposal.scope}`.slice(0, 240),
    status: 'aguardando_confirmacao',
    confirmation_token_hash: tokenHash,
    before_state: beforeState,
    after_state: afterState,
    rollback_state: beforeState,
    created_at: now,
    updated_at: now,
    expires_at: expiresAt,
  };
  if (!(await insertDraft(env, draft))) return { ok: false, reason: 'persistence_failed' };
  if (!(await insertEvent(env, actionId, 1, 'rascunho_criado', user.id))) return { ok: false, reason: 'audit_failed' };

  return {
    ok: true,
    draft: Object.freeze({
      id: actionId,
      confirmationToken,
      scope: proposal.scope,
      targetLabel: safeText(target.label, 160) || proposal.target,
      summary: proposal.summary,
      changes: Object.freeze(proposal.changes.map((change) => Object.freeze({
        field: change.field,
        before: beforeState[change.field],
        after: afterState[change.field],
      }))),
      status: 'aguardando_confirmacao',
    }),
  };
}

async function loadDraft(env, actionId, actorUserId) {
  const result = await fetchRows(
    env,
    `ia_action_drafts?id=eq.${encodeURIComponent(actionId)}&actor_user_id=eq.${encodeURIComponent(actorUserId)}` +
    '&select=id,tenant_user_id,org_id,actor_user_id,actor_role,scope,record_id,summary,status,confirmation_token_hash,before_state,after_state,rollback_state,expires_at&limit=1',
  );
  if (!result.ok) return { ok: false, reason: 'persistence_unavailable' };
  return result.rows.length === 1 ? { ok: true, draft: result.rows[0] } : { ok: false, reason: 'draft_not_found' };
}

async function loadTargetById(env, draft) {
  const config = SCOPES[draft.scope];
  const fields = Object.keys(draft.before_state || {});
  if (!config) return { ok: false, reason: 'scope_invalid' };
  if (config.table === 'empresa') {
    const result = await fetchRows(env, `empresa?user_id=eq.${encodeURIComponent(draft.tenant_user_id)}&select=${encodeURIComponent(selectForScope(draft.scope, fields))}&limit=1`);
    return result.ok && result.rows.length === 1 ? { ok: true, row: result.rows[0] } : { ok: false, reason: 'target_unavailable' };
  }
  if (config.team) {
    const result = await fetchRows(
      env,
      `organizacao_membros?org_id=eq.${encodeURIComponent(draft.org_id)}&user_id=eq.${encodeURIComponent(draft.record_id)}` +
      `&select=${encodeURIComponent(selectForScope(draft.scope, fields))}&limit=1`,
    );
    if (!result.ok || result.rows.length !== 1) return { ok: false, reason: 'target_unavailable' };
    if (result.rows[0].papel === 'owner') return { ok: false, reason: 'owner_protected' };
    return { ok: true, row: result.rows[0] };
  }
  const result = await fetchRows(
    env,
    `${config.table}?id=eq.${encodeURIComponent(draft.record_id)}&user_id=eq.${encodeURIComponent(draft.tenant_user_id)}` +
    `&excluido_em=is.null&select=${encodeURIComponent(selectForScope(draft.scope, fields))}&limit=1`,
  );
  return result.ok && result.rows.length === 1 ? { ok: true, row: result.rows[0] } : { ok: false, reason: 'target_unavailable' };
}

async function patchTarget(env, draft, row, state) {
  const config = SCOPES[draft.scope];
  const now = new Date().toISOString();
  let path;
  let payload;
  if (config.table === 'empresa') {
    if (typeof row.atualizado_em !== 'string') return false;
    path = `empresa?user_id=eq.${encodeURIComponent(draft.tenant_user_id)}&atualizado_em=eq.${encodeURIComponent(row.atualizado_em)}`;
    payload = { dados: { ...(plainObject(row.dados) || {}), ...state, atualizadoEm: now }, atualizado_em: now };
  } else if (config.team) {
    path = `organizacao_membros?org_id=eq.${encodeURIComponent(draft.org_id)}&user_id=eq.${encodeURIComponent(draft.record_id)}` +
      `&papel=eq.${encodeURIComponent(String(row.papel))}&ativo=eq.${encodeURIComponent(String(row.ativo))}`;
    payload = Object.fromEntries(Object.entries(state).map(([field, value]) => [COLUMN_BY_FIELD[field], value]));
  } else if (config.blob) {
    if (typeof row.atualizado_em !== 'string') return false;
    path = `${config.table}?id=eq.${encodeURIComponent(draft.record_id)}&user_id=eq.${encodeURIComponent(draft.tenant_user_id)}` +
      `&excluido_em=is.null&atualizado_em=eq.${encodeURIComponent(row.atualizado_em)}`;
    payload = { dados: { ...(plainObject(row.dados) || {}), ...state, atualizadoEm: now }, atualizado_em: now };
    if (draft.scope === 'orcamento' && Object.hasOwn(state, 'status')) payload.status = state.status;
  } else {
    if (typeof row.atualizado_em !== 'string') return false;
    path = `${config.table}?id=eq.${encodeURIComponent(draft.record_id)}&user_id=eq.${encodeURIComponent(draft.tenant_user_id)}` +
      `&excluido_em=is.null&atualizado_em=eq.${encodeURIComponent(row.atualizado_em)}`;
    payload = Object.fromEntries(Object.entries(state).map(([field, value]) => [COLUMN_BY_FIELD[field], value]));
    payload.atualizado_em = now;
  }
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) return false;
  const rows = await response.json().catch(() => null);
  return Array.isArray(rows) && rows.length === 1;
}

async function updateDraftStatus(env, actionId, currentStatus, payload) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ia_action_drafts?id=eq.${encodeURIComponent(actionId)}&status=eq.${encodeURIComponent(currentStatus)}`,
    {
      method: 'PATCH',
      headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
    },
  );
  if (!response.ok) return false;
  const rows = await response.json().catch(() => null);
  return Array.isArray(rows) && rows.length === 1;
}

async function authorizeRequest(request, env) {
  const user = await getUser(request, env);
  if (!user) return { ok: false, response: json({ ok: false, erro: 'nao_autorizado' }, 401) };
  if (!env?.IA_RL) return { ok: false, response: json({ ok: false, erro: 'limite_indisponivel' }, 503) };
  try {
    const limited = await env.IA_RL.limit({ key: user.id });
    if (!limited?.success) return { ok: false, response: json({ ok: false, erro: 'muitas_requisicoes' }, 429) };
  } catch {
    return { ok: false, response: json({ ok: false, erro: 'limite_indisponivel' }, 503) };
  }
  return { ok: true, user };
}

async function readBody(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > IA_ACTION_MAX_BODY_BYTES) return { ok: false, response: json({ ok: false, erro: 'payload_grande' }, 413) };
  try {
    const parsed = JSON.parse(raw);
    return plainObject(parsed) ? { ok: true, body: parsed } : { ok: false, response: json({ ok: false, erro: 'payload_invalido' }, 400) };
  } catch {
    return { ok: false, response: json({ ok: false, erro: 'payload_invalido' }, 400) };
  }
}

async function verifyDraftToken(draft, token) {
  const safeToken = safeId(token, 160);
  if (!safeToken) return false;
  return constantEqual(draft.confirmation_token_hash, await sha256(safeToken));
}

function draftExpired(draft) {
  const expiresAt = typeof draft.expires_at === 'string' ? new Date(draft.expires_at).getTime() : Number.NaN;
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

async function verifyCurrentContext(env, userId, draft) {
  const context = await contextForUser(env, userId);
  if (!context.ok) return false;
  if (context.tenantUserId !== draft.tenant_user_id || (context.orgId || null) !== (draft.org_id || null)) return false;
  return Boolean(ROLE_SCOPES[context.role]?.has(draft.scope));
}

async function confirmAction(env, user, body) {
  const actionId = safeId(body.actionId);
  if (!actionId || !isUuid(actionId)) return json({ ok: false, erro: 'acao_invalida' }, 400);
  const loaded = await loadDraft(env, actionId, user.id);
  if (!loaded.ok) return json({ ok: false, erro: loaded.reason }, loaded.reason === 'draft_not_found' ? 404 : 503);
  const draft = loaded.draft;
  if (draftExpired(draft)) return json({ ok: false, erro: 'acao_expirada' }, 410);
  if (!(await verifyDraftToken(draft, body.confirmationToken))) return json({ ok: false, erro: 'confirmacao_invalida' }, 403);
  if (!(await verifyCurrentContext(env, user.id, draft))) return json({ ok: false, erro: 'permissao_atual_invalida' }, 403);
  if (draft.scope === 'equipe' && draft.record_id === user.id) return json({ ok: false, erro: 'vinculo_proprio_protegido' }, 403);
  if (draft.status === 'aplicada') return json({ ok: true, status: 'aplicada', idempotente: true });
  if (draft.status !== 'aguardando_confirmacao') return json({ ok: false, erro: 'estado_invalido' }, 409);

  const target = await loadTargetById(env, draft);
  if (!target.ok) return json({ ok: false, erro: target.reason }, 503);
  const current = projectState(draft.scope, target.row, Object.keys(draft.before_state));
  if (sameJson(current, draft.after_state)) {
    const recoveredAt = new Date().toISOString();
    await updateDraftStatus(env, actionId, 'aguardando_confirmacao', {
      status: 'aplicada', confirmed_at: recoveredAt, applied_at: recoveredAt,
    });
    await insertEvent(env, actionId, 2, 'confirmacao_aceita', user.id);
    await insertEvent(env, actionId, 3, 'aplicacao_concluida', user.id);
    return json({ ok: true, status: 'aplicada', actionId, podeReverter: true, recuperada: true });
  }
  if (!sameJson(current, draft.before_state)) {
    await insertEvent(env, actionId, 2, 'conflito', user.id);
    return json({ ok: false, erro: 'registro_alterado_desde_previa' }, 409);
  }
  if (!(await patchTarget(env, draft, target.row, draft.after_state))) {
    await insertEvent(env, actionId, 2, 'falha', user.id);
    return json({ ok: false, erro: 'aplicacao_falhou' }, 503);
  }
  const now = new Date().toISOString();
  if (!(await updateDraftStatus(env, actionId, 'aguardando_confirmacao', {
    status: 'aplicada', confirmed_at: now, applied_at: now,
  }))) return json({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  await insertEvent(env, actionId, 2, 'confirmacao_aceita', user.id);
  await insertEvent(env, actionId, 3, 'aplicacao_concluida', user.id);
  return json({ ok: true, status: 'aplicada', actionId, podeReverter: true });
}

async function cancelAction(env, user, body) {
  const actionId = safeId(body.actionId);
  if (!actionId || !isUuid(actionId)) return json({ ok: false, erro: 'acao_invalida' }, 400);
  const loaded = await loadDraft(env, actionId, user.id);
  if (!loaded.ok) return json({ ok: false, erro: loaded.reason }, loaded.reason === 'draft_not_found' ? 404 : 503);
  const draft = loaded.draft;
  if (draftExpired(draft)) return json({ ok: false, erro: 'acao_expirada' }, 410);
  if (!(await verifyDraftToken(draft, body.confirmationToken))) return json({ ok: false, erro: 'confirmacao_invalida' }, 403);
  if (!(await verifyCurrentContext(env, user.id, draft))) return json({ ok: false, erro: 'permissao_atual_invalida' }, 403);
  if (draft.scope === 'equipe' && draft.record_id === user.id) return json({ ok: false, erro: 'vinculo_proprio_protegido' }, 403);
  if (draft.status === 'cancelada') return json({ ok: true, status: 'cancelada', idempotente: true });
  if (draft.status !== 'aguardando_confirmacao') return json({ ok: false, erro: 'estado_invalido' }, 409);
  const now = new Date().toISOString();
  if (!(await updateDraftStatus(env, actionId, 'aguardando_confirmacao', { status: 'cancelada', cancelled_at: now }))) {
    return json({ ok: false, erro: 'cancelamento_falhou' }, 503);
  }
  await insertEvent(env, actionId, 2, 'cancelada', user.id);
  return json({ ok: true, status: 'cancelada' });
}

async function revertAction(env, user, body) {
  const actionId = safeId(body.actionId);
  if (!actionId || !isUuid(actionId)) return json({ ok: false, erro: 'acao_invalida' }, 400);
  const loaded = await loadDraft(env, actionId, user.id);
  if (!loaded.ok) return json({ ok: false, erro: loaded.reason }, loaded.reason === 'draft_not_found' ? 404 : 503);
  const draft = loaded.draft;
  if (draftExpired(draft)) return json({ ok: false, erro: 'acao_expirada' }, 410);
  if (!(await verifyDraftToken(draft, body.confirmationToken))) return json({ ok: false, erro: 'confirmacao_invalida' }, 403);
  if (!(await verifyCurrentContext(env, user.id, draft))) return json({ ok: false, erro: 'permissao_atual_invalida' }, 403);
  if (draft.scope === 'equipe' && draft.record_id === user.id) return json({ ok: false, erro: 'vinculo_proprio_protegido' }, 403);
  if (draft.status === 'revertida') return json({ ok: true, status: 'revertida', idempotente: true });
  if (draft.status !== 'aplicada') return json({ ok: false, erro: 'estado_invalido' }, 409);

  const target = await loadTargetById(env, draft);
  if (!target.ok) return json({ ok: false, erro: target.reason }, 503);
  const current = projectState(draft.scope, target.row, Object.keys(draft.after_state));
  if (!sameJson(current, draft.after_state)) {
    await insertEvent(env, actionId, 4, 'conflito', user.id);
    return json({ ok: false, erro: 'registro_alterado_apos_aplicacao' }, 409);
  }
  if (!(await patchTarget(env, draft, target.row, draft.rollback_state))) {
    await insertEvent(env, actionId, 4, 'falha', user.id);
    return json({ ok: false, erro: 'reversao_falhou' }, 503);
  }
  if (!(await updateDraftStatus(env, actionId, 'aplicada', { status: 'revertida', reverted_at: new Date().toISOString() }))) {
    return json({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  }
  await insertEvent(env, actionId, 4, 'reversao_concluida', user.id);
  return json({ ok: true, status: 'revertida' });
}

export async function handleIaActions(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ ok: false, erro: 'metodo_nao_suportado' }, 405);
  const authorization = await authorizeRequest(request, env);
  if (!authorization.ok) return authorization.response;
  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;

  if (url.pathname === '/ia/acoes/confirmar') return confirmAction(env, authorization.user, parsed.body);
  if (url.pathname === '/ia/acoes/cancelar') return cancelAction(env, authorization.user, parsed.body);
  if (url.pathname === '/ia/acoes/reverter') return revertAction(env, authorization.user, parsed.body);
  return json({ ok: false, erro: 'nao_encontrado' }, 404);
}
