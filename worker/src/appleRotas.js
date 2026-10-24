/**
 * ASSINATURA PELA APP STORE — rotas do worker (StoreKit 2 + App Store Server Notifications v2). SEM SDK, SEM variável nova
 * (o worker está em 64/64): tudo que é público (bundle id, SKUs, raiz da Apple) mora em `appleIap.js`/`appleJws.js`.
 *
 *   GET  /apple/config        → { ok, ligado } — o app só oferece "Assinar" no iPhone com ligado=true
 *   POST /apple/verificar     → JWT do Supabase + { signedTransaction } (JWS do StoreKit 2, `purchaseToken` do expo-iap)
 *                               → { ok:true, estado, plano, vigenteAte } | 403 compra_de_outra_conta | 409 | 503
 *   POST /apple/notificacoes  → App Store Server Notifications v2 ({ signedPayload }); SEM login: a autenticidade é a
 *                               cadeia de certificados da Apple (appleJws.js). 200 = tratado; 500 = a Apple reenvia.
 *
 * KILL SWITCH: `APPLE_IAP_HABILITADO` (constante no código, hoje `false`) E `PLAY_BILLING_MODE === 'on'` (mesma vitrine das
 * lojas). Ligar o iOS exige PR + o "pode subir" do Igor; com `false` /apple/config diz `ligado:false` e /verificar
 * responde 503 `apple_desligado` — mas /notificacoes SEMPRE é lida e registrada (quem já pagou continua certo).
 *
 * QUEM É O DONO (fail-closed): `appAccountToken` da transação TEM de ser o `user.id` de quem chamou. Outro = 403 e nada é
 * gravado. Anti-replay: `apple_compras.original_transaction_id` é a chave; já ligada a OUTRA conta = 409 + alarme.
 * Sandbox (TestFlight/revisão da Apple) só libera para quem estiver em `PLAY_TESTE_PERMITIDOS` (a mesma lista do Play).
 *
 * ORDEM: JWS verificado → dono → decisão (`appleIap.js`) → `apple_compras` → `assinaturas`. Se a gravação falhar, 500/503
 * e a Apple/o app reenviam (nada de "processado" mentiroso). Convivência com Stripe/Pix/Play: igual ao Play — conceder sobre
 * plano vigente de OUTRA origem preserva o maior nível e a maior vigência; encerrar só com PROVA DE VÍNCULO
 * (`assinaturas.revenuecat_transacao_id` = `apple:<sha256>`). As colunas `revenuecat_*` são as mesmas do Play (decisão C4).
 *
 * LOG: nunca o JWS nem o payload; só os 12 primeiros chars do vínculo.
 */
import { capturarExcecao } from '../../src/services/sentryCaptura.ts';
import { verificarJwsApple, AppleJwsErro } from './appleJws.js';
import { donoDaTransacao, ehUuid, traduzirTransacaoApple, validarTransacao, vinculoApple } from './appleIap.js';
import { cabeNoTeto, checarLimite, deixaPassar, rateOkSensivel, textoCabeNoTeto } from './rateLimit.js';
import { marcarEvento, reivindicarEvento } from './webhookEvents.js';

export const APPLE_ROUTES = new Set(['/apple/config', '/apple/verificar', '/apple/notificacoes']);

/** Kill switch de CÓDIGO: o iOS só vende depois de um PR que vira isto para true (com ordem do Igor). */
export const APPLE_IAP_HABILITADO = false;

const NIVEL_PLANO = { gratis: 0, pro: 1, empresa: 2 };
const TETO_JWS_BYTES = 24 * 1024;
/** Idade máxima do signedDate: o StoreKit assina na hora (recente); a Apple reenvia notificação por dias. */
const IDADE_MAX_VERIFICAR_MS = 7 * 24 * 3600e3;
const IDADE_MAX_NOTIFICACAO_MS = 14 * 24 * 3600e3;
const TETO_NOTIFICACAO_BYTES = 64 * 1024;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const curto = (v) => String(v ?? '').slice(0, 12);
const ms = (v) => {
  const t = Date.parse(v ?? '');
  return Number.isFinite(t) ? t : null;
};

/** A venda no iPhone está ligada? (constante de código + vitrine das lojas + banco configurado) */
export function appleLigado(env) {
  return APPLE_IAP_HABILITADO === true && env?.PLAY_BILLING_MODE === 'on' && !!env?.SUPABASE_URL && !!env?.SUPABASE_SERVICE_ROLE_KEY;
}

function testadoresPermitidos(env) {
  const bruto = typeof env?.PLAY_TESTE_PERMITIDOS === 'string' ? env.PLAY_TESTE_PERMITIDOS : '';
  return new Set(bruto.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => ehUuid(s)));
}

// ─── auth do usuário (mesmo padrão do play.js) ───────────────
async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
      ...(typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(10 * 1000) } : {}),
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && ehUuid(u.id) ? u : null;
  } catch {
    return null;
  }
}

// ─── Supabase (service role) ─────────────────────────────────
const sb = (env, extra = {}) => ({ apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...extra });
const COLUNAS = 'user_id,plano,status,current_period_end,revenuecat_transacao_id,revenuecat_vigencia_ate,revenuecat_evento_em';

/** Linha de `assinaturas`: null (não tem), a linha, ou { erro:true }. */
async function lerAssinatura(env, userId) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}&select=${COLUNAS}&limit=1`, { headers: sb(env, { Accept: 'application/json' }) });
    if (!r.ok) return { erro: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { erro: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { erro: true };
  }
}
async function gravarConcessao(env, userId, patch) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/assinaturas?on_conflict=user_id`, {
      method: 'POST',
      headers: sb(env, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ user_id: userId, ...patch, atualizado_em: new Date().toISOString() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
/** UPDATE só se a linha ainda aponta para ESTA compra Apple. */
async function atualizarVinculada(env, userId, transacaoId, patch) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/assinaturas?user_id=eq.${encodeURIComponent(userId)}&revenuecat_transacao_id=eq.${encodeURIComponent(transacaoId)}`, {
      method: 'PATCH',
      headers: sb(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ ...patch, atualizado_em: new Date().toISOString() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
const ativa = (linha, agora) => {
  const fim = ms(linha?.current_period_end);
  return !!linha && fim !== null && fim > agora && linha.status !== 'canceled';
};

/** Compra Apple já registrada: { user_id, ... } | null | { erro:true }. */
async function lerCompra(env, originalId) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/apple_compras?original_transaction_id=eq.${encodeURIComponent(originalId)}&select=user_id,produto_id,ambiente,estado,expiry,evento_em&limit=1`, { headers: sb(env, { Accept: 'application/json' }) });
    if (!r.ok) return { erro: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { erro: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { erro: true };
  }
}
/** Registra/atualiza a compra. `user_id` só entra na criação (imutável: nada transfere compra de conta). */
async function gravarCompra(env, reg) {
  try {
    const existente = await lerCompra(env, reg.original_transaction_id);
    if (existente?.erro) return false;
    if (!existente) {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/apple_compras`, {
        method: 'POST',
        headers: sb(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify(reg),
      });
      return r.ok;
    }
    // Evento mais velho que o já gravado não desfaz o novo (a guarda de ordem de `assinaturas` não cobre esta tabela).
    if (ms(existente.evento_em) !== null && ms(reg.evento_em) !== null && ms(reg.evento_em) < ms(existente.evento_em)) return true;
    const { user_id: _u, original_transaction_id: _o, ...resto } = reg;
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/apple_compras?original_transaction_id=eq.${encodeURIComponent(reg.original_transaction_id)}`, {
      method: 'PATCH',
      headers: sb(env, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ ...resto, atualizado_em: new Date().toISOString() }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Aplica a decisão em `assinaturas`. Devolve { http, corpo, marca }.
 * conceder: preserva maior nível/vigência de OUTRA origem; fora de ordem (leitura mais velha da MESMA compra) é ignorada.
 * encerrar: só com prova de vínculo (a linha tem de apontar para esta compra Apple).
 */
export async function aplicarDecisaoApple(env, d, { agora = Date.now() } = {}) {
  if (d.acao === 'invalido' || d.acao === 'registrar') return { http: 200, corpo: { ok: true, acao: d.acao, motivo: d.motivo }, marca: 'processado' };
  if (d.acao === 'alarme') {
    console.error('[olli-apple] ALARME: decisão não aplicada —', d.motivo);
    return { http: 200, corpo: { ok: true, acao: 'alarme', motivo: d.motivo }, marca: 'falhou', erro: d.motivo };
  }
  const atual = await lerAssinatura(env, d.userId);
  if (atual?.erro) return { http: 503, corpo: { erro: 'indisponivel' }, marca: 'falhou', erro: 'leitura' };
  if (atual && atual.revenuecat_transacao_id === d.transacaoId && ms(atual.revenuecat_evento_em) && ms(d.eventoEm) && ms(atual.revenuecat_evento_em) > ms(d.eventoEm)) {
    return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'fora_de_ordem' }, marca: 'processado' };
  }
  if (d.acao === 'conceder') {
    let plano = d.plano;
    let status = d.status;
    let vigencia = d.acessoAte || d.vigenciaAte;
    const eraApple = typeof atual?.revenuecat_transacao_id === 'string' && atual.revenuecat_transacao_id.startsWith('apple:');
    if (atual && ativa(atual, agora) && !eraApple) {
      if ((NIVEL_PLANO[atual.plano] || 0) > (NIVEL_PLANO[plano] || 0)) plano = atual.plano;
      if ((ms(atual.current_period_end) || 0) > Date.parse(vigencia)) vigencia = atual.current_period_end;
      if (atual.status === 'active') status = 'active';
    }
    const ok = await gravarConcessao(env, d.userId, {
      plano, status, current_period_end: vigencia,
      revenuecat_transacao_id: d.transacaoId, revenuecat_produto_id: d.produtoId,
      revenuecat_vigencia_ate: d.vigenciaAte, revenuecat_evento_em: d.eventoEm,
    });
    if (!ok) return { http: 500, corpo: { erro: 'falha_persistencia' }, marca: 'falhou', erro: 'gravacao' };
    return { http: 200, corpo: { ok: true, acao: 'conceder', plano, vigenteAte: vigencia }, marca: 'processado' };
  }
  // encerrar: prova de vínculo
  if (!atual) return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'sem_assinatura' }, marca: 'processado' };
  if (atual.revenuecat_transacao_id !== d.transacaoId) return { http: 200, corpo: { ok: true, acao: 'ignorar', motivo: 'sem_vinculo' }, marca: 'processado' };
  // Convivência: se o acesso gravado vai ALÉM da vigência da própria Apple (+folga), quem sustenta é Stripe/Pix/Play (o conceder
  // mesclou o maior). Encerrar a Apple então só atualiza os campos da Apple; nunca corta o que foi pago por fora.
  const FOLGA = 3 * 3600e3;
  const sustentadaPorOutra = ms(atual.current_period_end) !== null && ms(atual.revenuecat_vigencia_ate) !== null && ms(atual.current_period_end) > ms(atual.revenuecat_vigencia_ate) + FOLGA && ms(atual.current_period_end) > Date.parse(d.vigenciaAte) + FOLGA;
  const patch = sustentadaPorOutra
    ? { revenuecat_vigencia_ate: d.vigenciaAte, revenuecat_evento_em: d.eventoEm }
    : { status: 'canceled', current_period_end: d.vigenciaAte, revenuecat_vigencia_ate: d.vigenciaAte, revenuecat_evento_em: d.eventoEm };
  const ok = await atualizarVinculada(env, d.userId, d.transacaoId, patch);
  if (!ok) return { http: 500, corpo: { erro: 'falha_persistencia' }, marca: 'falhou', erro: 'gravacao' };
  return { http: 200, corpo: { ok: true, acao: 'encerrar', ...(sustentadaPorOutra ? { motivo: 'sustentada_por_outra_origem' } : {}) }, marca: 'processado' };
}

const estadoDaDecisao = (d) => (d.acao === 'conceder' ? 'ativa' : d.acao === 'encerrar' ? 'encerrada' : 'registrada');

// ─── GET /apple/config ───────────────────────────────────────
function config(ligado) {
  return json({ ok: true, ligado });
}

// ─── POST /apple/verificar ───────────────────────────────────
async function verificar(request, env, ver, ligado) {
  const user = await getUser(request, env);
  if (!user) return json({ erro: 'nao_autorizado' }, 401);
  if (!ligado) return json({ erro: 'apple_desligado' }, 503);
  if (!(await rateOkSensivel(env, env.ABACATE_RL, `apple:${user.id}`))) return json({ erro: 'muitas_requisicoes' }, 429);
  const teto = cabeNoTeto(request, TETO_JWS_BYTES);
  if (!teto.ok) return json({ erro: 'payload_grande' }, 413);
  const bruto = await request.text();
  if (!textoCabeNoTeto(bruto, TETO_JWS_BYTES)) return json({ erro: 'payload_grande' }, 413);
  let corpo = {};
  try {
    corpo = JSON.parse(bruto);
  } catch {}
  const jws = corpo && typeof corpo.signedTransaction === 'string' ? corpo.signedTransaction : '';
  let tx;
  try {
    tx = await ver(jws, { maxIdadeMs: IDADE_MAX_VERIFICAR_MS });
  } catch (e) {
    if (e instanceof AppleJwsErro) return json({ ok: false, erro: 'jws_invalido', motivo: e.codigo }, 400);
    capturarExcecao(e, { origem: 'apple_verificar' });
    return json({ erro: 'indisponivel' }, 503);
  }
  const v = validarTransacao(tx);
  if (!v.ok) return json({ ok: false, erro: v.acao === 'alarme' ? 'transacao_recusada' : 'transacao_invalida', motivo: v.motivo }, 400);
  if (donoDaTransacao(tx) !== user.id) {
    console.error('[olli-apple] transação de outra conta recusada —', curto(await vinculoApple(tx.originalTransactionId)));
    return json({ ok: false, erro: 'compra_de_outra_conta' }, 403);
  }
  const compra = await lerCompra(env, tx.originalTransactionId);
  if (compra?.erro) return json({ erro: 'indisponivel' }, 503);
  if (compra && compra.user_id !== user.id) {
    console.error('[olli-apple] ALARME: compra já ligada a outra conta —', curto(await vinculoApple(tx.originalTransactionId)));
    return json({ ok: false, erro: 'token_de_outra_conta' }, 409);
  }
  const transacaoId = await vinculoApple(tx.originalTransactionId);
  // LÁPIDE: uma notificação (REFUND/REVOKE/EXPIRED) que chegou ANTES deste /verificar já encerrou a compra; um JWS assinado antes
  // dela não pode reabrir o acesso (fraude: comprar, pedir reembolso e só então chamar /verificar com o JWS antigo).
  if (compra && compra.estado === 'encerrada' && ms(compra.evento_em) !== null && ms(compra.evento_em) >= (Number.isFinite(tx.signedDate) ? tx.signedDate : 0)) {
    return json({ ok: true, estado: 'encerrada', plano: null, vigenteAte: null, motivo: 'compra_ja_encerrada' });
  }
  const d = traduzirTransacaoApple(tx, { userId: user.id, transacaoId, sandboxPermitido: testadoresPermitidos(env).has(user.id) });
  const gravou = await gravarCompra(env, {
    original_transaction_id: tx.originalTransactionId, user_id: user.id, produto_id: v.produto.produtoId, ambiente: tx.environment,
    estado: estadoDaDecisao(d), expiry: Number.isFinite(tx.expiresDate) ? new Date(tx.expiresDate).toISOString() : null,
    evento_em: new Date(Number.isFinite(tx.signedDate) ? tx.signedDate : Date.now()).toISOString(),
  });
  if (!gravou) return json({ erro: 'falha_persistencia' }, 500);
  const r = await aplicarDecisaoApple(env, d);
  return json({ ok: r.http === 200, estado: estadoDaDecisao(d), plano: r.corpo?.plano ?? d.plano ?? null, vigenteAte: r.corpo?.vigenteAte ?? d.acessoAte ?? null, ...(r.http === 200 ? {} : r.corpo) }, r.http);
}

// ─── POST /apple/notificacoes (App Store Server Notifications v2) ──
async function notificacoes(request, env, ver) {
  // Teto por IP ANTES de parsear/verificar (rota pública). NÃO é fail-closed: 429 só faz a Apple reenviar e limitador fora
  // não pode derrubar o canal de dinheiro (mesmo critério do webhook do AbacatePay).
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  if (env?.ABACATEHOOK_RL && !deixaPassar(await checarLimite(env.ABACATEHOOK_RL, `applehook:${ip}`), { sensivel: false })) return json({ erro: 'muitas_requisicoes' }, 429);
  const teto = cabeNoTeto(request, TETO_NOTIFICACAO_BYTES);
  if (!teto.ok) return json({ erro: 'payload_grande' }, 413);
  const bruto = await request.text();
  if (!textoCabeNoTeto(bruto, TETO_NOTIFICACAO_BYTES)) return json({ erro: 'payload_grande' }, 413);
  let signedPayload = '';
  try {
    signedPayload = JSON.parse(bruto)?.signedPayload;
  } catch {
    return json({ erro: 'payload_invalido' }, 400);
  }
  let n;
  try {
    n = await ver(signedPayload, { maxIdadeMs: IDADE_MAX_NOTIFICACAO_MS });
  } catch (e) {
    if (e instanceof AppleJwsErro) return json({ erro: 'jws_invalido', motivo: e.codigo }, 400);
    capturarExcecao(e, { origem: 'apple_notificacao' });
    return json({ erro: 'indisponivel' }, 503);
  }
  const uuid = typeof n.notificationUUID === 'string' ? n.notificationUUID : '';
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return json({ erro: 'notificacao_sem_uuid' }, 400);
  // TEST, CONSUMPTION_REQUEST etc. não trazem transação: 200 (a Apple só quer saber que recebemos).
  if (!n.data?.signedTransactionInfo) return json({ ok: true, acao: 'ignorar', motivo: 'sem_transacao', tipo: String(n.notificationType || '').slice(0, 40) });
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) return json({ erro: 'indisponivel' }, 503);

  const claim = await reivindicarEvento(env, { origem: 'apple_notif', eventId: uuid, tipo: String(n.notificationType || '').slice(0, 40) });
  if (claim.duplicado) return json({ ok: true, duplicado: true });
  if (!claim.ok) return json({ erro: 'idempotencia_indisponivel' }, 500);

  try {
    let tx;
    let renovacao = null;
    try {
      tx = await ver(n.data?.signedTransactionInfo, { maxIdadeMs: IDADE_MAX_NOTIFICACAO_MS });
      if (n.data?.signedRenewalInfo) renovacao = await ver(n.data.signedRenewalInfo, { maxIdadeMs: IDADE_MAX_NOTIFICACAO_MS }).catch(() => null);
      if (renovacao && renovacao.originalTransactionId !== tx.originalTransactionId) renovacao = null; // renovação de OUTRA assinatura não vale aqui
    } catch (e) {
      if (e instanceof AppleJwsErro) {
        await marcarEvento(env, { origem: 'apple_notif', eventId: uuid, status: 'processado', erro: `jws_interno_${e.codigo}` });
        return json({ ok: true, acao: 'ignorar', motivo: 'jws_interno_invalido' });
      }
      throw e;
    }
    const v = validarTransacao(tx);
    if (!v.ok) {
      await marcarEvento(env, { origem: 'apple_notif', eventId: uuid, status: 'processado', erro: v.motivo });
      return json({ ok: true, acao: v.acao, motivo: v.motivo });
    }
    const compra = await lerCompra(env, tx.originalTransactionId);
    if (compra?.erro) throw new Error('leitura_compra');
    let userId = compra?.user_id ?? null;
    if (!userId) {
      // Notificação ANTES do /verificar. Não libera plano, mas se for REFUND/REVOKE/EXPIRED deixa uma LÁPIDE na compra
      // (user_id = appAccountToken; se esse usuário não existir a FK recusa e nada é gravado), que o /verificar respeita.
      const dono = donoDaTransacao(tx);
      const fim = ['REFUND', 'REVOKE', 'EXPIRED', 'GRACE_PERIOD_EXPIRED'].includes(n.notificationType) || Number.isFinite(tx.revocationDate);
      if (dono && fim) {
        const lapide = await gravarCompra(env, {
          original_transaction_id: tx.originalTransactionId, user_id: dono, produto_id: v.produto.produtoId, ambiente: tx.environment,
          estado: 'encerrada', expiry: Number.isFinite(tx.expiresDate) ? new Date(tx.expiresDate).toISOString() : null,
          evento_em: new Date(Number.isFinite(tx.signedDate) ? tx.signedDate : Date.now()).toISOString(),
        });
        await marcarEvento(env, { origem: 'apple_notif', eventId: uuid, status: 'processado', erro: lapide ? 'lapide_gravada' : 'compra_ainda_nao_registrada' });
        return json({ ok: true, acao: 'registrar', motivo: lapide ? 'lapide_gravada' : 'compra_ainda_nao_registrada' });
      }
      await marcarEvento(env, { origem: 'apple_notif', eventId: uuid, status: 'processado', erro: 'compra_ainda_nao_registrada' });
      return json({ ok: true, acao: 'registrar', motivo: 'compra_ainda_nao_registrada' });
    }
    const transacaoId = await vinculoApple(tx.originalTransactionId);
    const d = traduzirTransacaoApple(tx, {
      userId, transacaoId, tipoNotificacao: n.notificationType ?? null, renovacao, sandboxPermitido: testadoresPermitidos(env).has(userId),
    });
    const gravou = await gravarCompra(env, {
      original_transaction_id: tx.originalTransactionId, user_id: userId, produto_id: v.produto.produtoId, ambiente: tx.environment,
      estado: estadoDaDecisao(d), expiry: Number.isFinite(tx.expiresDate) ? new Date(tx.expiresDate).toISOString() : null,
      evento_em: new Date(Number.isFinite(tx.signedDate) ? tx.signedDate : Date.now()).toISOString(),
    });
    if (!gravou) throw new Error('gravar_compra');
    const r = await aplicarDecisaoApple(env, d);
    await marcarEvento(env, { origem: 'apple_notif', eventId: uuid, status: r.marca, erro: r.erro });
    return json(r.corpo, r.http);
  } catch (e) {
    console.error('[olli-apple] notificação falhou —', e && (e.message || e));
    capturarExcecao(e, { origem: 'apple_notificacao', rota: '/apple/notificacoes' });
    await marcarEvento(env, { origem: 'apple_notif', eventId: uuid, status: 'falhou', erro: e && (e.message || String(e)) });
    return json({ erro: 'falha_interna' }, 500);
  }
}

/** `opcoes.verificarJws`/`opcoes.ligado` só existem para o TESTE (cadeia de mentira, kill switch aberto); produção chama com 3 argumentos. */
export async function handleApple(request, env, url, opcoes = {}) {
  const p = url.pathname;
  const ver = opcoes.verificarJws ?? ((jws, o) => verificarJwsApple(jws, o));
  const ligado = opcoes.ligado ?? appleLigado(env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (p === '/apple/config' && request.method === 'GET') return config(ligado);
  if (p === '/apple/verificar' && request.method === 'POST') return verificar(request, env, ver, ligado);
  if (p === '/apple/notificacoes' && request.method === 'POST') return notificacoes(request, env, ver);
  if (APPLE_ROUTES.has(p)) return json({ erro: 'metodo_nao_suportado' }, 405);
  return json({ erro: 'nao_encontrado' }, 404);
}
