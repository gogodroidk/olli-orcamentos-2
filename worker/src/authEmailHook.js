/**
 * POST /auth/email-hook — Send Email Hook do Supabase Auth, entregue pela Resend.
 *
 * POR QUE: o projeto do Supabase não tem SMTP próprio, e o SMTP padrão só entrega
 * para membros da equipe, ~2 por hora. Confirmação de cadastro, "esqueci a senha"
 * e login por código simplesmente não chegavam ao cliente. Com o hook ligado, o
 * Auth deixa de mandar e-mail e chama esta rota; nós renderizamos em pt-BR e
 * mandamos pela mesma Resend (e pelo mesmo adapter) dos e-mails transacionais.
 *
 * Contrato dos links (compartilhado com o painel e o app):
 *   https://app.olliorcamentos.online/auth/confirm?token_hash=…&type=…&next=…
 * e o CÓDIGO de 6 dígitos em destaque, para quem digita em outro aparelho.
 *
 * Tudo aqui é FAIL-CLOSED: sem segredo, sem chave da Resend, com assinatura
 * errada ou limitador fora do ar, a resposta é erro — e o Supabase mostra erro ao
 * usuário em vez de fingir que mandou. Nenhum log carrega e-mail, código,
 * token_hash ou link.
 *
 * Idempotência: a Idempotency-Key da Resend deriva do token emitido (hash), não
 * do id da entrega. Se o Supabase reenviar a mesma chamada — ou as duas pontas de
 * uma troca de e-mail forem refeitas depois de uma falha parcial —, a Resend
 * devolve o envio original em vez de mandar outro (janela de 24 h da Resend).
 */

import { capturarExcecao } from '../../src/services/sentryCaptura.ts';
import { criarResendTransactionalAdapter } from './resendTransactionalAdapter.js';
import { renderizarEmailAuth, AUTH_EMAIL_TEMPLATE_VERSION } from './authEmailTemplate.js';
import { verificarStandardWebhook } from './standardWebhooks.js';
import { checarLimite, cabeNoTeto, textoCabeNoTeto, TETO } from './rateLimit.js';
import { lerJsonLimitado, sinalTimeout } from './emailRpc.js';

export const AUTH_EMAIL_HOOK_VERSION = '2026-09-30.v1';
export const AUTH_EMAIL_HOOK_ROTA = '/auth/email-hook';

// O Supabase espera a resposta do hook por poucos segundos; a Resend costuma
// responder em centenas de ms. Estourar aqui vira 503 e o usuário pede de novo.
const RESEND_TIMEOUT_MS = 4_000;
const PURPOSE = 'account_access';
const LOG = '[olli-auth-email]';

/** Próximo passo depois de confirmar a recuperação (contrato de links). */
export const NEXT_RECUPERACAO = '/auth/nova-senha';

/**
 * email_action_type suportado → template e `type` do link (o mesmo que o
 * `verifyOtp({ token_hash, type })` do painel usa). `email` é o OTP genérico do
 * GoTrue: confere token de cadastro OU de magic link, por isso o link leva
 * type=email em vez de fingir que é um dos dois.
 */
const TIPOS = Object.freeze({
  signup: Object.freeze({ template: 'auth_signup', tipoLink: 'signup' }),
  invite: Object.freeze({ template: 'auth_invite', tipoLink: 'invite' }),
  magiclink: Object.freeze({ template: 'auth_magiclink', tipoLink: 'magiclink' }),
  email: Object.freeze({ template: 'auth_magiclink', tipoLink: 'email' }),
  recovery: Object.freeze({ template: 'auth_recovery', tipoLink: 'recovery' }),
  email_change: Object.freeze({ template: null, tipoLink: 'email_change' }),
  reauthentication: Object.freeze({ template: 'auth_reauthentication', tipoLink: null }),
});

export const AUTH_EMAIL_TIPOS_SUPORTADOS = Object.freeze(Object.keys(TIPOS));

function falhaHook(codigo) {
  const erro = new Error(codigo);
  erro.codigo = codigo;
  return erro;
}

function exigir(condicao, codigo) {
  if (!condicao) throw falhaHook(codigo);
}

function texto(valor, limite) {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= limite ? valor.trim() : '';
}

function inteiro(valor, min, max) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function urlHttps(valor) {
  const bruto = texto(valor, 2048);
  if (!bruto) return null;
  try {
    const url = new URL(bruto);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/**
 * Formato de erro que o Supabase Auth lê de um hook HTTP. A mensagem é curta,
 * em pt-BR e sem dado nenhum do usuário — pode chegar à tela do app.
 */
function respostaErro(status, mensagem) {
  return new Response(JSON.stringify({ error: { http_code: status, message: mensagem } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function respostaOk() {
  return new Response('{}', {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const MSG_INDISPONIVEL = 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.';

/**
 * Configuração obrigatória. Qualquer peça ausente = rota desligada (503), com o
 * NOME do que falta no log — nunca o valor.
 */
export function configAuthEmail(env) {
  const faltando = [];
  const secret = texto(env?.SEND_EMAIL_HOOK_SECRET, 4096);
  if (!secret) faltando.push('SEND_EMAIL_HOOK_SECRET');
  const apiKey = texto(env?.RESEND_API_KEY, 512);
  if (!apiKey) faltando.push('RESEND_API_KEY');
  const from = texto(env?.WELCOME_FROM, 320);
  if (!from) faltando.push('WELCOME_FROM');
  const replyTo = texto(env?.WELCOME_REPLY_TO, 320);
  if (!replyTo) faltando.push('WELCOME_REPLY_TO');
  const confirmUrl = urlHttps(env?.AUTH_EMAIL_CONFIRM_URL);
  if (!confirmUrl) faltando.push('AUTH_EMAIL_CONFIRM_URL');
  const logoUrl = urlHttps(env?.WELCOME_LOGO_URL);
  if (!logoUrl) faltando.push('WELCOME_LOGO_URL');
  const supportUrl = urlHttps(env?.WELCOME_SUPPORT_URL);
  if (!supportUrl) faltando.push('WELCOME_SUPPORT_URL');
  // Tem de ser igual a mailer_otp_exp/60 no Supabase: é o que o e-mail promete.
  const validadeMinutos = inteiro(env?.AUTH_OTP_VALIDADE_MINUTOS, 1, 1440);
  if (validadeMinutos === null) faltando.push('AUTH_OTP_VALIDADE_MINUTOS');
  if (faltando.length) return Object.freeze({ ok: false, faltando: Object.freeze(faltando) });
  return Object.freeze({
    ok: true,
    secret,
    apiKey,
    from,
    replyTo,
    confirmUrl: confirmUrl.toString(),
    logoUrl: logoUrl.toString(),
    supportUrl: supportUrl.toString(),
    validadeMinutos,
  });
}

/**
 * `next` só sai de `redirect_to` quando ele aponta para o PRÓPRIO painel (mesma
 * origem do /auth/confirm) — nada de open redirect por um redirect_to forjado.
 * Deep link do app (esquema próprio) e outras origens caem fora: o app usa o
 * código, e o painel decide o destino padrão.
 */
export function nextDoRedirect(redirectTo, confirmUrl) {
  const destino = urlHttps(redirectTo);
  const base = urlHttps(confirmUrl);
  if (!destino || !base || destino.origin !== base.origin) return null;
  const caminho = `${destino.pathname}${destino.search}`;
  if (!caminho.startsWith('/') || caminho.startsWith('//') || caminho.length > 512) return null;
  if (destino.pathname === base.pathname) return null; // não aponta para o próprio /auth/confirm
  return caminho;
}

/** Link do contrato: /auth/confirm?token_hash=…&type=…[&next=…]. */
export function montarLinkConfirmacao(confirmUrl, { tokenHash, tipoLink, next }) {
  const url = new URL(confirmUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', tipoLink);
  if (next) url.searchParams.set('next', next);
  return url.toString();
}

function codigoValido(valor) {
  return typeof valor === 'string' && /^\d{6,10}$/.test(valor) ? valor : '';
}

function tokenHashValido(valor) {
  return typeof valor === 'string' && /^[A-Za-z0-9_-]{8,256}$/.test(valor) ? valor : '';
}

function emailValido(valor) {
  const email = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : '';
}

function objeto(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
}

/**
 * Payload do hook → lista de envios. Lança `falhaHook` com código estável em
 * qualquer coisa fora do contrato. Mapeamento da troca de e-mail conforme a doc
 * do Supabase (os nomes são trocados por compatibilidade):
 *   - e-mail ATUAL (user.email):     token     + token_hash_new
 *   - e-mail NOVO  (user.new_email): token_new + token_hash
 * Sem "troca segura", só a ponta nova existe.
 */
export function planejarEnvios(payload, config) {
  const raiz = objeto(payload);
  exigir(raiz, 'payload_invalido');
  const user = objeto(raiz.user);
  const dados = objeto(raiz.email_data);
  exigir(user && dados, 'payload_invalido');

  const acao = typeof dados.email_action_type === 'string' ? dados.email_action_type : '';
  const tipo = Object.hasOwn(TIPOS, acao) ? TIPOS[acao] : null;
  exigir(tipo, 'tipo_nao_suportado');

  const userId = texto(user.id, 64);
  exigir(userId, 'usuario_invalido');

  const recuperacao = acao === 'recovery';
  const next = recuperacao ? NEXT_RECUPERACAO : nextDoRedirect(dados.redirect_to, config.confirmUrl);

  const envio = (template, destinatarioBruto, codigoBruto, tokenHashBruto) => {
    const destinatario = emailValido(destinatarioBruto);
    exigir(destinatario, 'destinatario_invalido');
    const codigo = codigoValido(codigoBruto);
    exigir(codigo, 'codigo_invalido');
    let link = null;
    let tokenHash = '';
    if (tipo.tipoLink) {
      tokenHash = tokenHashValido(tokenHashBruto);
      exigir(tokenHash, 'token_hash_invalido');
      link = montarLinkConfirmacao(config.confirmUrl, { tokenHash, tipoLink: tipo.tipoLink, next });
    }
    return Object.freeze({ acao, template, destinatario, codigo, tokenHash, link, userId });
  };

  if (acao === 'email_change') {
    const envios = [];
    const temAtual = Boolean(dados.token) && Boolean(dados.token_hash_new);
    if (temAtual) {
      envios.push(envio('auth_email_change_atual', user.email, dados.token, dados.token_hash_new));
    }
    envios.push(envio('auth_email_change_novo', user.new_email, dados.token_new, dados.token_hash));
    return Object.freeze(envios);
  }

  return Object.freeze([envio(tipo.template, user.email, dados.token, dados.token_hash)]);
}

async function sha256Hex(valor) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valor));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Chave de idempotência do envio. Deriva do token emitido (que muda a cada novo
 * pedido do usuário) e da ponta; é um hash, então nem o código nem o token_hash
 * aparecem no painel da Resend.
 */
export async function chaveIdempotencia(envio) {
  const hash = await sha256Hex(JSON.stringify([
    'olli-auth-email',
    AUTH_EMAIL_TEMPLATE_VERSION,
    envio.template,
    envio.userId,
    envio.codigo,
    envio.tokenHash,
  ]));
  return Object.freeze({ eventId: `auth:${hash.slice(0, 32)}`, idempotencyKey: `auth-email:${hash.slice(0, 48)}` });
}

/** Chave do limitador por destinatário: hash, para o endereço não virar chave legível. */
export async function chaveLimite(destinatario) {
  return `auth-email:${(await sha256Hex(destinatario)).slice(0, 40)}`;
}

function criarTransporte(fetchImpl) {
  return async (request) => {
    const response = await fetchImpl(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: sinalTimeout(RESEND_TIMEOUT_MS),
    });
    const body = await lerJsonLimitado(response);
    return Object.freeze({
      status: response.status,
      body: body && typeof body === 'object' && !Array.isArray(body) ? body : null,
    });
  };
}

async function entregar(adapter, envio, agoraIso) {
  const ids = await chaveIdempotencia(envio);
  const mensagem = renderizarEmailAuth({
    template: envio.template,
    codigo: envio.codigo,
    link: envio.link,
    validadeMinutos: envio.validadeMinutos,
    logoUrl: envio.logoUrl,
    supportUrl: envio.supportUrl,
  });
  return adapter.entregar({
    claimedItem: {
      version: AUTH_EMAIL_HOOK_VERSION,
      eventId: ids.eventId,
      idempotencyKey: ids.idempotencyKey,
      template: envio.template,
      templateVersion: AUTH_EMAIL_TEMPLATE_VERSION,
      purpose: PURPOSE,
      recipient: envio.destinatario,
      attempts: 1,
      status: 'sending',
      nextAttemptAt: null,
      providerId: null,
      errorCode: null,
      createdAt: agoraIso,
      updatedAt: agoraIso,
    },
    message: {
      eventId: ids.eventId,
      template: envio.template,
      templateVersion: AUTH_EMAIL_TEMPLATE_VERSION,
      purpose: PURPOSE,
      kind: 'transactional',
      subject: mensagem.subject,
      html: mensagem.html,
      text: mensagem.text,
    },
  });
}

/**
 * Handler da rota. `dependencias` = { fetchImpl, nowMs, log } para teste; em
 * produção usa fetch/Date/console.
 */
export async function handleAuthEmailHook(request, env, dependencias = {}) {
  const log = dependencias.log || console;
  const fetchImpl = dependencias.fetchImpl || fetch;
  const nowMs = typeof dependencias.nowMs === 'number' ? dependencias.nowMs : Date.now();

  if (request.method !== 'POST') {
    const r = respostaErro(405, 'Método não suportado.');
    r.headers.set('Allow', 'POST');
    return r;
  }

  const config = configAuthEmail(env);
  if (!config.ok) {
    // Só nomes de variável; nunca valores.
    log.error(`${LOG} desligado: falta ${config.faltando.join(', ')}`);
    return respostaErro(503, MSG_INDISPONIVEL);
  }

  const teto = cabeNoTeto(request, TETO.WEBHOOK);
  if (!teto.ok) return respostaErro(413, 'Payload grande demais.');
  const rawBody = await request.text();
  if (!textoCabeNoTeto(rawBody, TETO.WEBHOOK)) return respostaErro(413, 'Payload grande demais.');

  const valido = await verificarStandardWebhook(rawBody, request.headers, config.secret, { prefixo: 'webhook', nowMs });
  if (!valido) {
    log.error(`${LOG} assinatura_invalida`);
    return respostaErro(401, 'Assinatura inválida.');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.error(`${LOG} payload_invalido`);
    return respostaErro(400, 'Payload inválido.');
  }

  let envios;
  try {
    envios = planejarEnvios(payload, config);
  } catch (erro) {
    const codigo = erro?.codigo || 'payload_invalido';
    // O tipo só vai para o log se for um dos conhecidos (valor controlado).
    const acao = payload?.email_data?.email_action_type;
    const acaoLog = typeof acao === 'string' && /^[a-z_]{1,64}$/.test(acao) ? acao : 'desconhecido';
    log.error(`${LOG} ${codigo} tipo=${acaoLog}`);
    return respostaErro(400, codigo === 'tipo_nao_suportado'
      ? 'Tipo de e-mail não suportado.'
      : 'Payload inválido.');
  }
  const acao = envios[0].acao;

  // Limite por destinatário ANTES de mandar qualquer ponta: ou vão todas, ou nenhuma.
  for (const envio of envios) {
    const estado = await checarLimite(env?.AUTH_EMAIL_RL, await chaveLimite(envio.destinatario));
    if (estado === 'negado') {
      log.error(`${LOG} limite_destinatario tipo=${acao}`);
      return respostaErro(429, 'Muitos e-mails pedidos para este endereço. Espere um minuto e tente de novo.');
    }
    if (estado !== 'permitido') {
      log.error(`${LOG} limitador_indisponivel tipo=${acao}`);
      return respostaErro(503, MSG_INDISPONIVEL);
    }
  }

  try {
    const adapter = criarResendTransactionalAdapter({
      apiKey: config.apiKey,
      from: config.from,
      replyTo: config.replyTo,
      transport: criarTransporte(fetchImpl),
    });
    const agoraIso = new Date(nowMs).toISOString();
    for (const envio of envios) {
      const resultado = await entregar(adapter, {
        ...envio,
        validadeMinutos: config.validadeMinutos,
        logoUrl: config.logoUrl,
        supportUrl: config.supportUrl,
      }, agoraIso);
      if (!resultado.ok) {
        log.error(`${LOG} resend_${resultado.code} tipo=${acao}`);
        return respostaErro(resultado.retryable ? 503 : 502, MSG_INDISPONIVEL);
      }
    }
  } catch (erro) {
    // Exceção aqui é bug de contrato (template/adapter), não falha da Resend.
    log.error(`${LOG} falha_interna ${erro?.codigo || 'sem_codigo'} tipo=${acao}`);
    capturarExcecao(falhaHook(erro?.codigo || 'auth_email_falha_interna'), { origem: 'webhook', rota: AUTH_EMAIL_HOOK_ROTA });
    return respostaErro(500, MSG_INDISPONIVEL);
  }

  log.log(`${LOG} enviado tipo=${acao} pontas=${envios.length}`);
  return respostaOk();
}
