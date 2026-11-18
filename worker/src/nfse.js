/**
 * NFS-e (nota de serviço) a partir do orçamento aprovado — FASE 1, atrás de flag.
 *
 *   GET  /nfse/config   → { ok, nfse:boolean }  (o app só mostra "Emitir nota" se vier true; sem auth, sem dado)
 *   POST /nfse/emitir   → emite (idempotente por conta+orçamento). Corpo: ver validacao.js
 *   GET  /nfse/status?orcamento=ID → estado da nota; se 'processando', consulta o provedor e atualiza
 *
 * ═══ FLAG ═══
 * `NFSE_ENABLED=1` (string "1"). Qualquer outra coisa = desligado: /config diz false, /emitir e /status respondem 503
 * e NADA toca banco ou provedor. Hoje: "0" no wrangler.jsonc.
 *
 * ═══ PLANO ═══
 * Só Empresa (R$ 99), decidido pelo servidor com o mesmo `derivarEntitlement` do resto do sistema. O app esconder o
 * botão é conforto; quem barra é aqui (403 plano_insuficiente).
 *
 * ═══ PROVEDOR ═══
 * `NFSE_PROVEDOR`: "mock" (padrão) ou "focus" (só homologação — ver nfse/provedorFocus.js). Esta fase NÃO emite nota real.
 *
 * ═══ BANCO ═══
 * Tabelas `perfil_fiscal` e `nota_fiscal` (supabase/migrations/20261118120000_nfse_f1.sql — ARQUIVO, NÃO APLICADO).
 * Com a flag ligada e a migration ausente, as rotas respondem 503 'banco_indisponivel' (não 500, não inventam nota).
 *
 * ═══ LGPD ═══
 * CPF/CNPJ e e-mail do tomador entram só para a nota; nunca vão para log. Erros do provedor viram códigos nossos.
 */
import { derivarEntitlement } from './entitlement.js';
import { criarProvedor } from './nfse/provedor.js';
import { faltaNoPerfil, referencia, validarPedido } from './nfse/validacao.js';
import { getAssinatura } from './stripe.js';

export const NFSE_ROUTES = new Set(['/nfse/config', '/nfse/emitir', '/nfse/status']);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

export function nfseLigado(env) {
  return !!env && env.NFSE_ENABLED === '1';
}

async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch {
    return null;
  }
}

// ─── banco (REST do Supabase com a service role; o dono é sempre o user_id validado pelo JWT) ───
const sb = (env, extra = {}) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function rest(env, caminho, init = {}) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, { ...init, headers: sb(env, init.headers) });
    const corpo = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, corpo };
  } catch {
    return { ok: false, status: 0, corpo: null };
  }
}

const eq = (v) => encodeURIComponent(v);
const COLUNAS_NOTA = 'orcamento_id,status,numero,chave,pdf_url,xml_url,erro,ambiente,provedor,criada_em';

/** Nota → formato público (nunca devolve documento do tomador nem ref interna). */
function publica(n) {
  return {
    orcamentoId: n.orcamento_id,
    status: n.status,
    numero: n.numero || null,
    chave: n.chave || null,
    pdfUrl: n.pdf_url || null,
    xmlUrl: n.xml_url || null,
    erro: n.erro || null,
    ambiente: n.ambiente || null,
  };
}

const lerNota = (env, userId, orcamentoId) =>
  rest(env, `nota_fiscal?user_id=eq.${eq(userId)}&orcamento_id=eq.${eq(orcamentoId)}&select=${COLUNAS_NOTA},ref&limit=1`);

const gravarResultado = (env, userId, orcamentoId, r) =>
  rest(env, `nota_fiscal?user_id=eq.${eq(userId)}&orcamento_id=eq.${eq(orcamentoId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: r.status,
      numero: r.numero || null,
      chave: r.chave || null,
      pdf_url: r.pdfUrl || null,
      xml_url: r.xmlUrl || null,
      erro: r.status === 'erro' ? r.mensagem || 'Erro ao emitir.' : null,
      ambiente: r.ambiente,
      atualizada_em: new Date().toISOString(),
    }),
  });

async function exigirContaEmpresa(env, user) {
  const a = await getAssinatura(env, user.id);
  if (a?.error) return { erro: json({ ok: false, erro: 'falha_conferir_plano' }, 502) };
  if (derivarEntitlement(a).plano !== 'empresa') return { erro: json({ ok: false, erro: 'plano_insuficiente' }, 403) };
  return { ok: true };
}

async function emitir(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  const plano = await exigirContaEmpresa(env, user);
  if (plano.erro) return plano.erro;

  const v = validarPedido(await request.json().catch(() => null));
  if (!v.ok) return json({ ok: false, erro: 'pedido_invalido', campos: v.erros }, 400);
  const { pedido } = v;

  let provedor;
  try {
    provedor = criarProvedor(env);
  } catch {
    return json({ ok: false, erro: 'provedor_indisponivel' }, 503);
  }

  // Idempotência: já existe nota deste orçamento? Devolve o estado dela (e deixa "erro" tentar de novo).
  const atual = await lerNota(env, user.id, pedido.orcamentoId);
  if (!atual.ok) return json({ ok: false, erro: 'banco_indisponivel' }, 503);
  const existente = Array.isArray(atual.corpo) ? atual.corpo[0] : null;
  if (existente && existente.status !== 'erro') return json({ ok: true, nota: publica(existente), repetida: true });

  const perfilR = await rest(env, `perfil_fiscal?user_id=eq.${eq(user.id)}&select=*&limit=1`);
  if (!perfilR.ok) return json({ ok: false, erro: 'banco_indisponivel' }, 503);
  const perfil = Array.isArray(perfilR.corpo) ? perfilR.corpo[0] : null;
  const falta = faltaNoPerfil(perfil);
  if (falta.length) return json({ ok: false, erro: 'perfil_fiscal_incompleto', campos: falta }, 409);

  const ref = referencia(user.id, pedido.orcamentoId);
  const linha = { user_id: user.id, orcamento_id: pedido.orcamentoId, ref, status: 'processando', provedor: provedor.nome, ambiente: provedor.ambiente, erro: null };
  const gravou = existente
    ? await rest(env, `nota_fiscal?user_id=eq.${eq(user.id)}&orcamento_id=eq.${eq(pedido.orcamentoId)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'processando', erro: null }) })
    : await rest(env, 'nota_fiscal', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(linha) });
  if (gravou.status === 409) return json({ ok: true, repetida: true, nota: { orcamentoId: pedido.orcamentoId, status: 'processando' } });
  if (!gravou.ok) return json({ ok: false, erro: 'banco_indisponivel' }, 503);

  let r;
  try {
    r = await provedor.emitir({ ref, prestador: perfil, tomador: pedido.tomador, servico: pedido.servico });
  } catch (e) {
    console.error('[olli-nfse] provedor falhou:', e?.message ? e.message : 'desconhecido');
    r = { status: 'erro', mensagem: 'O serviço de notas não respondeu. Tente de novo em instantes.', ambiente: provedor.ambiente };
  }
  await gravarResultado(env, user.id, pedido.orcamentoId, r);
  return json({ ok: true, nota: publica({ orcamento_id: pedido.orcamentoId, status: r.status, numero: r.numero, chave: r.chave, pdf_url: r.pdfUrl, xml_url: r.xmlUrl, erro: r.mensagem, ambiente: r.ambiente }) });
}

async function status(request, env, url) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);
  const plano = await exigirContaEmpresa(env, user);
  if (plano.erro) return plano.erro;
  const orcamentoId = url.searchParams.get('orcamento') || '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(orcamentoId)) return json({ ok: false, erro: 'orcamento_invalido' }, 400);

  const r = await lerNota(env, user.id, orcamentoId);
  if (!r.ok) return json({ ok: false, erro: 'banco_indisponivel' }, 503);
  const nota = Array.isArray(r.corpo) ? r.corpo[0] : null;
  if (!nota) return json({ ok: true, nota: null });
  if (nota.status !== 'processando') return json({ ok: true, nota: publica(nota) });

  try {
    const res = await criarProvedor(env).consultar(nota.ref);
    if (res.status !== 'processando') await gravarResultado(env, user.id, orcamentoId, res);
    return json({ ok: true, nota: publica({ ...nota, status: res.status, numero: res.numero, chave: res.chave, pdf_url: res.pdfUrl, xml_url: res.xmlUrl, erro: res.mensagem, ambiente: res.ambiente }) });
  } catch {
    return json({ ok: true, nota: publica(nota) }); // provedor fora do ar: segue "processando", app tenta depois
  }
}

export async function handleNfse(request, env, url) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/nfse/config' && request.method === 'GET') return json({ ok: true, nfse: nfseLigado(env) });
  if (!nfseLigado(env)) return json({ ok: false, erro: 'nfse_desligada' }, 503);
  if (url.pathname === '/nfse/emitir' && request.method === 'POST') return emitir(request, env);
  if (url.pathname === '/nfse/status' && request.method === 'GET') return status(request, env, url);
  return json({ ok: false, erro: 'metodo_nao_suportado' }, 405);
}
