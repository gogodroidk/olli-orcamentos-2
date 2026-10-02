/**
 * Crédito de troca ("Vim de outro app") — lado do PAINEL ADMIN.
 *
 *   GET  /admin/api/creditos-troca[?status=pendente]   → lista de pedidos
 *   GET  /admin/api/creditos-troca/comprovante?id=     → URL assinada (5 min) do print
 *   POST /admin/api/creditos-troca/decidir             → aprovar (1..3 meses) ou recusar com motivo
 *
 * O prestador pede pelo app (src/screens/VimDeOutroAppScreen.tsx → RPC
 * `solicitar_credito_troca`); quem confere é GENTE, aqui. A decisão inteira
 * (concessão + estado do pedido + trilha `admin_audit_log`) é UMA transação na RPC
 * `admin_decidir_credito_troca` (migration 20261002153417_creditos_troca.sql). A
 * concessão usa o override administrativo (o mesmo do "Conceder Pro" do painel),
 * com as regras de guarda do `concederPlanoPeriodo` do Pix: nunca rebaixa nível,
 * nunca encurta vigência. Não grava como pagamento — não é venda.
 *
 * Aviso ao prestador quando aprovado: e-mail transacional (best-effort; e-mail
 * desligado/falho NÃO desfaz a concessão) + o próprio app, que mostra o estado do
 * pedido na tela "Vim de outro app" e no atalho de Planos.
 *
 * Três estados em tudo que é leitura: falha de leitura vira 503 "indisponível",
 * nunca lista vazia — "não sei" não pode parecer "não tem pedido".
 */

import { enviarEmail } from './email.js';

/** Paridade com src/services/limitesComerciais.ts (teste-credito-troca.ts confere). */
export const CREDITO_TROCA_MESES_MAX = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAVE = /^olli-documentos\/([0-9a-f-]{36})\/anexo\/[A-Za-z0-9._-]{1,120}$/;
const STATUS = new Set(['pendente', 'aprovado', 'recusado']);
const CAMPOS_LISTA = 'id,user_id,app_anterior,vence_em,observacao,status,meses_concedidos,concedido_ate,motivo_recusa,decidido_em,aviso_email_em,criado_em';

/** Erros de negócio da RPC → HTTP. O resto é 502 (falha nossa, não do pedido). */
const ERROS_RPC = {
  pedido_ja_decidido: 409,
  pedido_inexistente: 404,
  meses_invalidos: 400,
  motivo_invalido: 400,
  papel_sem_permissao: 403,
  autoaprovacao_proibida: 403,
  request_id_invalido: 400,
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function svc(env, extra = {}) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
}

function motivoValido(v) {
  const texto = typeof v === 'string' ? v.trim() : '';
  return texto.length >= 3 && texto.length <= 500 ? texto : null;
}

/** Valida o corpo da decisão. Puro (testável sem rede). */
export function validarDecisao(body = {}) {
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!UUID.test(id)) return { ok: false, erro: 'sem_id' };
  if (typeof body.aprovar !== 'boolean') return { ok: false, erro: 'decisao_invalida' };
  const motivo = motivoValido(body.motivo);
  if (!motivo) return { ok: false, erro: 'motivo_invalido' };
  let meses = null;
  if (body.aprovar) {
    meses = Number(body.meses);
    if (!Number.isInteger(meses) || meses < 1 || meses > CREDITO_TROCA_MESES_MAX) return { ok: false, erro: 'meses_invalidos' };
  }
  const requestId = typeof body.requestId === 'string' && body.requestId.length >= 16
    ? body.requestId.slice(0, 128)
    : crypto.randomUUID();
  return { ok: true, id, aprovar: body.aprovar, meses, motivo, requestId };
}

/**
 * Meses sugeridos para o admin a partir do vencimento informado do outro app:
 * o que falta até lá, arredondado para cima, entre 1 e o teto. Sem data → teto.
 */
export function mesesSugeridos(venceEm, agoraMs = Date.now()) {
  if (typeof venceEm !== 'string' || !venceEm) return CREDITO_TROCA_MESES_MAX;
  const t = Date.parse(`${venceEm.slice(0, 10)}T23:59:59-03:00`);
  if (!Number.isFinite(t)) return CREDITO_TROCA_MESES_MAX;
  const meses = Math.ceil((t - agoraMs) / (30 * 86400000));
  return Math.min(CREDITO_TROCA_MESES_MAX, Math.max(1, meses));
}

/** Código de erro conhecido dentro da resposta de erro do PostgREST. */
function codigoErroRpc(corpo) {
  const msg = String((corpo && (corpo.message || corpo.hint || corpo.details)) || '');
  return Object.keys(ERROS_RPC).find((c) => msg.includes(c)) || null;
}

export async function listarPedidosTroca(env, { status, listarUsuarios } = {}) {
  const filtro = STATUS.has(status) ? `&status=eq.${status}` : '';
  let linhas;
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/creditos_troca?select=${CAMPOS_LISTA}${filtro}&order=criado_em.desc&limit=200`,
      { headers: svc(env) },
    );
    if (!r.ok) {
      return json({ ok: false, erro: r.status === 404 ? 'credito_troca_sem_migration' : 'credito_troca_indisponivel' }, 503);
    }
    linhas = await r.json().catch(() => undefined);
    if (!Array.isArray(linhas)) return json({ ok: false, erro: 'credito_troca_indisponivel' }, 503);
  } catch {
    return json({ ok: false, erro: 'credito_troca_indisponivel' }, 503);
  }
  // E-mail é só rótulo de apoio: se a listagem de usuários falhar, o pedido aparece
  // com o id (o estado do pedido, que é o dado de negócio, já foi lido acima).
  const usuarios = typeof listarUsuarios === 'function' ? await listarUsuarios().catch(() => []) : [];
  const emails = new Map((Array.isArray(usuarios) ? usuarios : []).map((u) => [u.id, u.email || '']));
  return json({
    ok: true,
    mesesMax: CREDITO_TROCA_MESES_MAX,
    pedidos: linhas.map((p) => ({
      ...p,
      email: emails.get(p.user_id) || '',
      mesesSugeridos: mesesSugeridos(p.vence_em),
    })),
  });
}

export async function urlComprovante(env, id) {
  if (!UUID.test(String(id || ''))) return json({ ok: false, erro: 'sem_id' }, 400);
  let chave;
  try {
    // A chave vem do BANCO (nunca do navegador): o admin só assina o arquivo do pedido.
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/creditos_troca?id=eq.${encodeURIComponent(id)}&select=comprovante_chave,user_id&limit=1`,
      { headers: svc(env) },
    );
    if (!r.ok) return json({ ok: false, erro: 'credito_troca_indisponivel' }, 503);
    const rows = await r.json().catch(() => null);
    if (!Array.isArray(rows)) return json({ ok: false, erro: 'credito_troca_indisponivel' }, 503);
    if (!rows.length) return json({ ok: false, erro: 'pedido_inexistente' }, 404);
    chave = String(rows[0].comprovante_chave || '');
    const m = chave.match(CHAVE);
    if (!m || m[1] !== rows[0].user_id || chave.includes('..')) return json({ ok: false, erro: 'comprovante_invalido' }, 422);
  } catch {
    return json({ ok: false, erro: 'credito_troca_indisponivel' }, 503);
  }
  const caminho = chave.slice('olli-documentos/'.length).split('/').map(encodeURIComponent).join('/');
  try {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/olli-documentos/${caminho}`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!r.ok) return json({ ok: false, erro: r.status === 404 || r.status === 400 ? 'comprovante_ausente' : 'storage_indisponivel' }, r.status === 404 || r.status === 400 ? 404 : 503);
    const j = await r.json().catch(() => null);
    const rel = j && (j.signedURL || j.signedUrl);
    if (typeof rel !== 'string' || !rel) return json({ ok: false, erro: 'storage_indisponivel' }, 503);
    const url = /^https:\/\//i.test(rel) ? rel : `${env.SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
    return json({ ok: true, url, expiraEmSegundos: 300 });
  } catch {
    return json({ ok: false, erro: 'storage_indisponivel' }, 503);
  }
}

function escaparHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NOME_PLANO = { pro: 'Pro', empresa: 'Empresa' };

function dataBr(iso) {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Texto do aviso de aprovação. Puro (o teste confere que não promete o que não existe). */
export function montarEmailAprovado({ plano, ate, appAnterior }) {
  const nome = NOME_PLANO[plano] || 'Pro';
  const ateTxt = ate ? dataBr(ate) : null;
  const periodo = ateTxt ? `até ${ateTxt}` : 'sem data para acabar';
  const app = String(appAnterior || 'outro app').replace(/[\r\n]+/g, ' ').trim().slice(0, 60);
  const assunto = `Crédito de troca aprovado: OLLI ${nome} liberado`;
  // Só fala em "fim do período" quando há data: concessão sem data final (um plano
  // manual maior que já existia e foi preservado) não "acaba" sozinha. E não promete
  // "volta para o Grátis": quem tiver assinatura paga continua no plano pago.
  const fim = ate
    ? 'Quando o período acabar, o acesso liberado termina sozinho, sem cobrança, e todos os seus dados continuam na conta.'
    : null;
  const texto = [
    'Seu crédito de troca foi aprovado.',
    '',
    `Conferimos o comprovante do ${app} e liberamos o OLLI ${nome} ${periodo}.`,
    'Não é uma assinatura: não há cobrança, nem renovação automática.',
    ...(fim ? [fim] : []),
    '',
    'É só abrir o app: o acesso já está liberado.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#F6F8FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border:1px solid #E6EAEF;border-radius:16px;padding:32px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0B6FCE;letter-spacing:.02em">CRÉDITO DE TROCA</p>
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0E1726">OLLI ${escaparHtml(nome)} liberado ${escaparHtml(periodo)}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#4A5568">
        Conferimos o comprovante do <strong>${escaparHtml(app)}</strong> e o seu acesso já está valendo. É só abrir o app.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#4A5568">
        Não é uma assinatura: não há cobrança nem renovação automática.${fim ? ` ${escaparHtml(fim)}` : ''}
      </p>
    </div>
  </div>
</body></html>`;
  return { assunto, texto, html };
}

async function emailDoUsuario(env, userId) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: svc(env) });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    const email = j && (j.email || (j.user && j.user.email));
    return typeof email === 'string' && email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

/** Avisa o prestador. Nunca lança e nunca desfaz a concessão. */
async function avisarAprovado(env, resultado) {
  const pedido = resultado && resultado.pedido;
  if (!pedido || !pedido.id || !pedido.user_id) return 'falha';
  const para = await emailDoUsuario(env, pedido.user_id);
  if (!para) return 'sem_email';
  const msg = montarEmailAprovado({
    plano: resultado.plano_efetivo_override,
    ate: resultado.override_ate,
    appAnterior: pedido.app_anterior,
  });
  const envio = await enviarEmail(env, {
    para,
    assunto: msg.assunto,
    html: msg.html,
    texto: msg.texto,
    // Reenvio do mesmo pedido não duplica a mensagem no provider.
    idempotencyKey: `credito-troca:${pedido.id}`,
  });
  if (!envio.ok) return envio.motivo === 'desligado' ? 'desligado' : 'falha';
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/creditos_troca?id=eq.${encodeURIComponent(pedido.id)}`, {
      method: 'PATCH',
      headers: svc(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ aviso_email_em: new Date().toISOString() }),
    });
  } catch {
    // Só a marcação do aviso falhou; o e-mail saiu.
  }
  return 'enviado';
}

export async function decidirPedidoTroca(env, actor, body = {}) {
  const v = validarDecisao(body);
  if (!v.ok) return json({ ok: false, erro: v.erro }, 400);
  let resultado;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_decidir_credito_troca`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_actor: actor.id,
        p_actor_role: actor.papel,
        p_pedido: v.id,
        p_aprovar: v.aprovar,
        p_meses: v.meses,
        p_motivo: v.motivo,
        p_request_id: v.requestId,
      }),
    });
    if (!r.ok) {
      const corpo = await r.json().catch(() => null);
      const codigo = codigoErroRpc(corpo);
      if (codigo) return json({ ok: false, erro: codigo }, ERROS_RPC[codigo]);
      return json({ ok: false, erro: r.status === 404 ? 'credito_troca_sem_migration' : 'falha_credito_troca' }, 502);
    }
    resultado = await r.json().catch(() => null);
  } catch {
    return json({ ok: false, erro: 'falha_credito_troca' }, 502);
  }
  if (!resultado || !resultado.pedido) return json({ ok: false, erro: 'falha_credito_troca' }, 502);
  const aviso = v.aprovar ? await avisarAprovado(env, resultado) : null;
  return json({
    ok: true,
    pedido: {
      id: resultado.pedido.id,
      status: resultado.pedido.status,
      meses_concedidos: resultado.pedido.meses_concedidos ?? null,
      concedido_ate: resultado.pedido.concedido_ate ?? null,
      motivo_recusa: resultado.pedido.motivo_recusa ?? null,
    },
    planoEfetivo: resultado.plano_efetivo_override ?? null,
    acessoAte: resultado.override_ate ?? null,
    aviso: aviso ? { email: aviso } : null,
  });
}
