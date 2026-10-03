/**
 * Ferramentas de conta do painel admin (ações sobre UM usuário).
 *
 *   POST /admin/api/user/creditos?id=        { delta, motivo, requestId }  → adicionar/remover créditos
 *   POST /admin/api/user/sessoes/revogar?id= { motivo, requestId }         → desconectar de todos os aparelhos
 *   POST /admin/api/user/email/confirmar?id= { motivo, requestId }         → marcar e-mail como confirmado
 *   POST /admin/api/user/acesso/enviar?id=   { motivo, requestId }         → mandar e-mail de acesso (código/link)
 *   POST /admin/api/user/nota?id=            { texto, requestId }          → nota interna (vai para a trilha)
 *   GET  /admin/api/cnpj?cnpj=               → dados públicos da Receita (BrasilAPI, grátis)
 *   POST /admin/api/export/registrar         { motivo, linhas, filtro }    → registra exportação CSV
 *
 * Toda escrita exige motivo e deixa linha em admin_audit_log. Créditos usam o
 * livro-razão imutável (credit_ledger) com origem 'ajuste' — nunca editam saldo.
 */

import { lancarCreditos, saldoCreditos } from './creditos.js';
import { empresaAtiva, tresEstados } from './util.js';

export const CREDITOS_AJUSTE_MAX = 5000;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function svc(env, extra = {}) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra };
}

function motivoValido(v, max = 500) {
  const texto = typeof v === 'string' ? v.trim() : '';
  return texto.length >= 3 && texto.length <= max ? texto : null;
}

function idValido(id) {
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
}

function requestIdDe(body) {
  return typeof body.requestId === 'string' && body.requestId.length >= 16
    ? body.requestId.slice(0, 128)
    : crypto.randomUUID();
}

async function lerUsuarioAuth(env, id) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, { headers: svc(env) });
    if (r.status === 404) return { ausente: true };
    if (!r.ok) return { erro: true };
    const u = await r.json().catch(() => null);
    return u && u.id ? { user: u } : { erro: true };
  } catch {
    return { erro: true };
  }
}

/**
 * Adiciona (delta > 0) ou remove (delta < 0) créditos. Remover além do saldo é
 * recusado: o saldo nunca fica negativo por ação manual. Saldo ilegível = recusa
 * (não sei ≠ zero).
 */
export async function ajustarCreditos(env, actor, id, body, { auditar }) {
  if (!idValido(id)) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  const delta = Number(body.delta);
  if (!motivo) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > CREDITOS_AJUSTE_MAX) {
    return json({ ok: false, erro: 'quantidade_invalida', max: CREDITOS_AJUSTE_MAX }, 400);
  }
  const antes = await saldoCreditos(env, id);
  if (antes === null) return json({ ok: false, erro: 'saldo_indisponivel' }, 503);
  if (antes + delta < 0) return json({ ok: false, erro: 'saldo_insuficiente', saldo: antes }, 409);
  const requestId = requestIdDe(body);
  const lancado = await lancarCreditos(env, {
    userId: id,
    delta,
    origem: 'ajuste',
    ref: `admin:${requestId}`,
    descricao: `Ajuste manual pelo painel: ${motivo}`.slice(0, 300),
  });
  if (!lancado.ok) return json({ ok: false, erro: 'falha_creditos' }, 502);
  const depois = lancado.duplicado ? antes : antes + delta;
  const auditoria = await auditar(env, actor, {
    acao: delta > 0 ? 'creditos_adicionados' : 'creditos_removidos',
    targetUserId: id,
    motivo,
    antes: { saldo: antes },
    depois: { saldo: depois, delta },
    requestId,
  });
  return json({ ok: true, saldo: depois, duplicado: lancado.duplicado, auditoria });
}

/** Derruba todas as sessões do usuário (todos os aparelhos). */
export async function revogarSessoesUsuario(env, actor, id, body, { auditar }) {
  if (!idValido(id)) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  if (!motivo) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  let encerradas = null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_revogar_sessoes`, {
      method: 'POST',
      headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_user: id }),
    });
    if (r.status === 404) return json({ ok: false, erro: 'sessoes_sem_migration' }, 503);
    if (!r.ok) return json({ ok: false, erro: 'falha_sessoes' }, 502);
    const n = await r.json().catch(() => null);
    encerradas = Number.isFinite(n) ? n : null;
  } catch {
    return json({ ok: false, erro: 'falha_sessoes' }, 502);
  }
  const auditoria = await auditar(env, actor, {
    acao: 'sessoes_usuario_revogadas',
    targetUserId: id,
    motivo,
    depois: { sessoesEncerradas: encerradas },
    requestId: requestIdDe(body),
  });
  return json({ ok: true, encerradas, auditoria });
}

/** Marca o e-mail como confirmado (quem não recebeu o e-mail de confirmação). */
export async function confirmarEmail(env, actor, id, body, { auditar }) {
  if (!idValido(id)) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  if (!motivo) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: svc(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ email_confirm: true }),
    });
    if (!r.ok) return json({ ok: false, erro: 'falha_auth' }, 502);
  } catch {
    return json({ ok: false, erro: 'falha_auth' }, 502);
  }
  const auditoria = await auditar(env, actor, {
    acao: 'email_confirmado_manual',
    targetUserId: id,
    motivo,
    depois: { emailConfirmado: true },
    requestId: requestIdDe(body),
  });
  return json({ ok: true, auditoria });
}

/**
 * Manda ao próprio usuário o e-mail de acesso sem senha (o mesmo do app: código
 * de 6 dígitos / link). O administrador nunca recebe o link — não é personificação.
 */
export async function enviarAcesso(env, actor, id, body, { auditar }) {
  if (!idValido(id)) return json({ ok: false, erro: 'sem_id' }, 400);
  const motivo = motivoValido(body.motivo);
  if (!motivo) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  const alvo = await lerUsuarioAuth(env, id);
  if (alvo.ausente) return json({ ok: false, erro: 'usuario_nao_encontrado' }, 404);
  if (alvo.erro || !alvo.user.email) return json({ ok: false, erro: 'auth_indisponivel' }, 502);
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: alvo.user.email, create_user: false }),
    });
    if (r.status === 429) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    if (!r.ok) return json({ ok: false, erro: 'falha_envio' }, 502);
  } catch {
    return json({ ok: false, erro: 'falha_envio' }, 502);
  }
  const auditoria = await auditar(env, actor, {
    acao: 'acesso_sem_senha_enviado',
    targetUserId: id,
    motivo,
    depois: { email: alvo.user.email },
    requestId: requestIdDe(body),
  });
  return json({ ok: true, email: alvo.user.email, auditoria });
}

/** Nota interna: fica na trilha append-only (não editável, não apagável). */
export async function notaInterna(env, actor, id, body, { auditar }) {
  if (!idValido(id)) return json({ ok: false, erro: 'sem_id' }, 400);
  const texto = motivoValido(body.texto);
  if (!texto) return json({ ok: false, erro: 'nota_invalida' }, 400);
  const auditoria = await auditar(env, actor, {
    acao: 'nota_interna',
    targetUserId: id,
    motivo: texto,
    requestId: requestIdDe(body),
  });
  if (!auditoria) return json({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  return json({ ok: true });
}

/** Registra a exportação de lista de usuários antes de o navegador gerar o CSV. */
export async function registrarExport(env, actor, body, { auditar }) {
  const motivo = motivoValido(body.motivo);
  if (!motivo) return json({ ok: false, erro: 'motivo_invalido' }, 400);
  const linhas = Number.isInteger(body.linhas) && body.linhas >= 0 ? body.linhas : null;
  const filtro = typeof body.filtro === 'string' ? body.filtro.slice(0, 120) : '';
  const auditoria = await auditar(env, actor, {
    acao: 'usuarios_exportados_csv',
    motivo,
    depois: { linhas, filtro },
    requestId: requestIdDe(body),
  });
  if (!auditoria) return json({ ok: false, erro: 'auditoria_indisponivel' }, 503);
  return json({ ok: true });
}

/**
 * CNPJ público na Receita via BrasilAPI (grátis, sem chave). Fallback OpenCNPJ
 * quando a BrasilAPI não responde. Sócios (dado pessoal) NÃO são devolvidos.
 * Três estados: ok | nao_encontrado | indisponivel.
 */
export async function consultarCnpj(cnpjBruto) {
  const cnpj = String(cnpjBruto || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return json({ ok: false, erro: 'cnpj_invalido' }, 400);
  let naoEncontradoBrasilApi = false;
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const d = await r.json().catch(() => null);
      if (d && typeof d === 'object') {
        return json({
          ok: true,
          fonte: 'Receita Federal via BrasilAPI',
          empresa: {
            cnpj,
            razaoSocial: String(d.razao_social || ''),
            nomeFantasia: String(d.nome_fantasia || ''),
            situacao: String(d.descricao_situacao_cadastral || ''),
            ativa: empresaAtiva(d),
            abertura: String(d.data_inicio_atividade || ''),
            cnae: [d.cnae_fiscal, d.cnae_fiscal_descricao].filter(Boolean).join(' · '),
            porte: String(d.porte || ''),
            naturezaJuridica: String(d.natureza_juridica || ''),
            mei: tresEstados(d.opcao_pelo_mei),
            simples: tresEstados(d.opcao_pelo_simples),
            municipio: String(d.municipio || ''),
            uf: String(d.uf || ''),
            telefone: String(d.ddd_telefone_1 || ''),
            email: String(d.email || ''),
          },
        });
      }
    } else if (r.status === 404) {
      naoEncontradoBrasilApi = true;
    }
  } catch { /* cai no fallback */ }
  try {
    const r = await fetch(`https://api.opencnpj.org/${cnpj}`, { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const d = await r.json().catch(() => null);
      if (d && typeof d === 'object') {
        const sit = String(d.situacao_cadastral || '');
        return json({
          ok: true,
          fonte: 'Receita Federal via OpenCNPJ',
          empresa: {
            cnpj,
            razaoSocial: String(d.razao_social || ''),
            nomeFantasia: String(d.nome_fantasia || ''),
            situacao: sit,
            ativa: sit ? sit.toUpperCase() === 'ATIVA' : null,
            abertura: String(d.data_inicio_atividade || ''),
            cnae: String(d.cnae_principal || ''),
            porte: String(d.porte_empresa || ''),
            naturezaJuridica: String(d.natureza_juridica || ''),
            mei: tresEstados(d.opcao_mei === 'S' ? true : d.opcao_mei === 'N' ? false : null),
            simples: tresEstados(d.opcao_simples === 'S' ? true : d.opcao_simples === 'N' ? false : null),
            municipio: String(d.municipio || ''),
            uf: String(d.uf || ''),
            telefone: '',
            email: String(d.email || ''),
          },
        });
      }
    }
    // Os dois disseram 404 = não existe. Só um disse = não sei.
    if (r.status === 404 && naoEncontradoBrasilApi) return json({ ok: false, erro: 'cnpj_nao_encontrado' }, 404);
  } catch { /* indisponível */ }
  return json({ ok: false, erro: 'consulta_indisponivel' }, 502);
}
