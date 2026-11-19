/**
 * Admin — códigos de cupom de influenciador (criar, desativar, ver a atribuição por código).
 * Só admin com AAL2 (gate em admin.js); toda mudança é AUDITADA antes de gravar. Guarda só o CÓDIGO:
 * nenhum nome, contato ou dado pessoal do influenciador. A atribuição devolve código + contagens.
 * Quem valida limites é o Postgres (cupom_criar); o worker espelha os tetos para dar erro claro.
 */
import { sbHeaders } from './creditos.js';
import { normalizarCodigoCupom } from './cupom.js';

// Espelho de src/services/limitesComerciais.ts (paridade em worker/scripts/teste-admin-cupom.js).
export const CUPOM_USOS_MAX = 500;
export const CUPOM_VALIDADE_DIAS_MAX = 90;

function resp(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function rpc(env, nome, args, fetchImpl) {
  try {
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
      method: 'POST', headers: sbHeaders(env, { 'Content-Type': 'application/json' }), body: JSON.stringify(args),
    });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, dados: await r.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0 };
  }
}

const reqId = (body) => (typeof body?.requestId === 'string' && body.requestId.length >= 16 ? body.requestId.slice(0, 128) : crypto.randomUUID());

/** GET /admin/api/cupons → [{ codigo, usos_max, valido_ate, ativo, reservados, pagos }] (sem dado pessoal). */
export async function rotaListarCupons(env, { fetchImpl = fetch } = {}) {
  const r = await rpc(env, 'cupom_atribuicao', {}, fetchImpl);
  if (!r.ok || !Array.isArray(r.dados)) return resp({ ok: false, erro: r.status === 404 ? 'cupom_sem_migration' : 'cupom_indisponivel' }, 503);
  return resp({ ok: true, cupons: r.dados });
}

/** POST /admin/api/cupons/criar { codigo, usosMax, validadeDias, motivo } */
export async function criarCupom(env, actor, body, { auditar, fetchImpl = fetch } = {}) {
  const codigo = normalizarCodigoCupom(body?.codigo);
  const usosMax = Number(body?.usosMax);
  const dias = Number(body?.validadeDias);
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
  if (!codigo) return resp({ ok: false, erro: 'codigo_invalido' }, 400);
  if (!Number.isInteger(usosMax) || usosMax < 1 || usosMax > CUPOM_USOS_MAX) return resp({ ok: false, erro: 'usos_invalido' }, 400);
  if (!Number.isInteger(dias) || dias < 1 || dias > CUPOM_VALIDADE_DIAS_MAX) return resp({ ok: false, erro: 'validade_invalida' }, 400);
  if (motivo.length < 3 || motivo.length > 200) return resp({ ok: false, erro: 'motivo_invalido' }, 400);
  const auditoria = await auditar(env, actor, { acao: 'cupom_criar', motivo, depois: { codigo, usosMax, validadeDias: dias }, requestId: reqId(body) });
  if (!auditoria) return resp({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  const r = await rpc(env, 'cupom_criar', { p_codigo: codigo, p_usos_max: usosMax, p_dias: dias }, fetchImpl);
  if (!r.ok || !r.dados) return resp({ ok: false, erro: r.status === 404 ? 'cupom_sem_migration' : 'cupom_indisponivel' }, 503);
  if (r.dados.status === 'existe') return resp({ ok: false, erro: 'codigo_existe' }, 409);
  if (r.dados.status !== 'ok') return resp({ ok: false, erro: 'codigo_invalido' }, 400);
  return resp({ ok: true, codigo });
}

/** POST /admin/api/cupons/desativar { codigo, motivo } */
export async function desativarCupom(env, actor, body, { auditar, fetchImpl = fetch } = {}) {
  const codigo = normalizarCodigoCupom(body?.codigo);
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
  if (!codigo) return resp({ ok: false, erro: 'codigo_invalido' }, 400);
  if (motivo.length < 3 || motivo.length > 200) return resp({ ok: false, erro: 'motivo_invalido' }, 400);
  const auditoria = await auditar(env, actor, { acao: 'cupom_desativar', motivo, depois: { codigo }, requestId: reqId(body) });
  if (!auditoria) return resp({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  const r = await rpc(env, 'cupom_desativar', { p_codigo: codigo }, fetchImpl);
  if (!r.ok) return resp({ ok: false, erro: r.status === 404 ? 'cupom_sem_migration' : 'cupom_indisponivel' }, 503);
  return resp({ ok: true, codigo, desativado: r.dados === true });
}

/** GET /admin/api/cupons/diferencas → descontos pagos em duplicidade (corrida), pendentes de diferença. Sem dado pessoal. */
export async function rotaListarDiferencas(env, { fetchImpl = fetch } = {}) {
  const r = await rpc(env, 'cupom_diferencas_listar', {}, fetchImpl);
  if (!r.ok || !Array.isArray(r.dados)) return resp({ ok: false, erro: r.status === 404 ? 'cupom_sem_migration' : 'cupom_indisponivel' }, 503);
  return resp({ ok: true, diferencas: r.dados });
}

/** POST /admin/api/cupons/diferencas/resolver { cobrancaId, motivo } — dá baixa depois de tratar a diferença. */
export async function resolverDiferenca(env, actor, body, { auditar, fetchImpl = fetch } = {}) {
  const cobrancaId = typeof body?.cobrancaId === 'string' ? body.cobrancaId.trim() : '';
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
  if (!cobrancaId || cobrancaId.length > 120) return resp({ ok: false, erro: 'cobranca_invalida' }, 400);
  if (motivo.length < 3 || motivo.length > 200) return resp({ ok: false, erro: 'motivo_invalido' }, 400);
  const auditoria = await auditar(env, actor, { acao: 'cupom_diferenca_resolver', motivo, depois: { cobrancaId }, requestId: reqId(body) });
  if (!auditoria) return resp({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  const r = await rpc(env, 'cupom_diferenca_resolver', { p_cobranca_id: cobrancaId }, fetchImpl);
  if (!r.ok) return resp({ ok: false, erro: r.status === 404 ? 'cupom_sem_migration' : 'cupom_indisponivel' }, 503);
  return resp({ ok: true, cobrancaId, baixada: r.dados === true });
}
