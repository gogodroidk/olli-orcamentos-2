/**
 * Descadastro de lembretes por e-mail — rota pública ASSINADA.
 *
 *   GET  /email/descadastrar?u=<userId>&e=lembretes&a=<assinatura>
 *        → página com o botão "Parar de receber lembretes". GET NÃO grava nada:
 *          antivírus e pré-visualização de e-mail abrem links sozinhos, e um GET
 *          que descadastra tiraria gente da lista sem ela pedir.
 *   POST /email/descadastrar?u=…&e=…&a=…
 *        → registra a supressão. É o alvo do botão da página e do
 *          `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) que o
 *          Gmail/Outlook usam no "Cancelar inscrição" nativo.
 *
 * A assinatura é HMAC-SHA256 de `descadastro:v1:<userId>:lembretes`. A chave é o
 * secret EMAIL_DESCADASTRO_SECRET quando existir; sem ele, é DERIVADA do
 * SUPABASE_SERVICE_ROLE_KEY com rótulo próprio (HMAC(chave, rótulo)), então o
 * link nunca carrega nem permite recuperar a chave do banco. Trocar qualquer uma
 * das duas invalida os links antigos — o pior caso é o link pedir para descadastrar
 * de novo pelo próximo e-mail, nunca descadastrar a pessoa errada.
 *
 * Escopos (o `e=` do link, dentro da assinatura — trocar o escopo invalida o link):
 *   - `lembretes` → suprime os lembretes (ativação/assinatura) e, por tabela, o resumo;
 *   - `resumo`    → desliga SÓ o resumo diário do dinheiro parado (preferência em
 *                   `public.email_preferencias`); os lembretes continuam.
 * E-mail de segurança/conta não tem descadastro.
 */

import { chamarRpcServico } from './emailRpc.js';

export const EMAIL_DESCADASTRO_VERSION = '2026-09-29.v1';
export const EMAIL_DESCADASTRO_PATH = '/email/descadastrar';
export const EMAIL_DESCADASTRO_ESCOPO = 'lembretes';
export const EMAIL_DESCADASTRO_ESCOPO_RESUMO = 'resumo';
const ESCOPOS = new Set([EMAIL_DESCADASTRO_ESCOPO, EMAIL_DESCADASTRO_ESCOPO_RESUMO]);

const ROTULO_DERIVACAO = 'olli.email.descadastro.v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ASSINATURA_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_FORM_BYTES = 2048;

function texto(valor, limite) {
  return typeof valor === 'string' ? valor.trim().slice(0, limite) : '';
}

function base64Url(bytes) {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(chaveBytes, mensagem) {
  const chave = await crypto.subtle.importKey(
    'raw',
    chaveBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(mensagem)));
}

/**
 * Chave de assinatura ou `null` (sem nenhum segredo confiável → sem descadastro →
 * quem chama NÃO pode mandar lembrete).
 */
export async function chaveDescadastro(env) {
  const propria = texto(env?.EMAIL_DESCADASTRO_SECRET, 512);
  if (propria.length >= 32) return new TextEncoder().encode(propria);
  const base = texto(env?.SUPABASE_SERVICE_ROLE_KEY, 4096);
  if (base.length < 20) return null;
  return hmac(new TextEncoder().encode(base), ROTULO_DERIVACAO);
}

function mensagemAssinada(userId, escopo) {
  return `descadastro:v1:${userId}:${escopo}`;
}

/** Monta a URL assinada. `baseUrl` precisa ser https e terminar no path da rota. */
export async function linkDescadastro({ baseUrl, userId, chave, escopo = EMAIL_DESCADASTRO_ESCOPO }) {
  if (!ESCOPOS.has(escopo)) {
    throw Object.assign(new Error('descadastro_escopo_invalido'), { codigo: 'descadastro_escopo_invalido' });
  }
  const id = texto(userId, 64).toLowerCase();
  if (!UUID_RE.test(id)) throw Object.assign(new Error('descadastro_user_invalido'), { codigo: 'descadastro_user_invalido' });
  if (!(chave instanceof Uint8Array) || chave.byteLength < 16) {
    throw Object.assign(new Error('descadastro_chave_ausente'), { codigo: 'descadastro_chave_ausente' });
  }
  let url;
  try { url = new URL(baseUrl); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.pathname !== EMAIL_DESCADASTRO_PATH) {
    throw Object.assign(new Error('descadastro_url_invalida'), { codigo: 'descadastro_url_invalida' });
  }
  const assinatura = base64Url(await hmac(chave, mensagemAssinada(id, escopo)));
  url.search = '';
  url.searchParams.set('u', id);
  url.searchParams.set('e', escopo);
  url.searchParams.set('a', assinatura);
  return url.toString();
}

function compararConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** `{ userId, escopo }` quando os parâmetros são autênticos; senão `null`. */
export async function verificarDescadastroComEscopo(params, chave) {
  const userId = texto(params?.u, 64).toLowerCase();
  const escopo = texto(params?.e, 20);
  const assinatura = texto(params?.a, 64);
  if (!UUID_RE.test(userId) || !ESCOPOS.has(escopo) || !ASSINATURA_RE.test(assinatura)) return null;
  if (!(chave instanceof Uint8Array)) return null;
  const esperada = base64Url(await hmac(chave, mensagemAssinada(userId, escopo)));
  return compararConstante(esperada, assinatura) ? { userId, escopo } : null;
}

/** Devolve o userId quando os parâmetros são autênticos (qualquer escopo); senão `null`. */
export async function verificarDescadastro(params, chave) {
  const valido = await verificarDescadastroComEscopo(params, chave);
  return valido ? valido.userId : null;
}

/** Texto da página de cada escopo. */
const POR_ESCOPO = Object.freeze({
  [EMAIL_DESCADASTRO_ESCOPO]: Object.freeze({
    pergunta: 'Parar de receber lembretes?',
    explica: 'Você deixará de receber os lembretes por e-mail da OLLI Orçamentos (primeiros passos, avisos de plano e o resumo diário). Avisos essenciais da sua conta continuam chegando.',
    botao: 'Parar de receber lembretes',
    pronto: 'Pronto, lembretes desligados',
    prontoTexto: 'Você não vai mais receber lembretes por e-mail da OLLI Orçamentos. Avisos essenciais da conta continuam chegando.',
  }),
  [EMAIL_DESCADASTRO_ESCOPO_RESUMO]: Object.freeze({
    pergunta: 'Parar de receber o resumo diário?',
    explica: 'Você deixará de receber o resumo diário do dinheiro parado. Dá para religar quando quiser no app ou no painel. Avisos essenciais da sua conta continuam chegando.',
    botao: 'Parar de receber o resumo',
    pronto: 'Pronto, resumo desligado',
    prontoTexto: 'Você não vai mais receber o resumo diário por e-mail. Para religar, use o app ou o painel da OLLI Orçamentos.',
  }),
});

function escaparHtml(valor) {
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function pagina(status, titulo, corpoHtml, extraHeaders = {}) {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escaparHtml(titulo)} — OLLI Orçamentos</title>
<style>
body{margin:0;background:#f2f5f7;color:#17212b;font-family:Arial,Helvetica,sans-serif}
main{max-width:520px;margin:48px auto;padding:32px 24px;background:#fff;border-radius:18px}
h1{font-size:24px;line-height:1.3;margin:0 0 16px}
p{font-size:16px;line-height:1.6;color:#344454;margin:0 0 16px}
button{min-height:44px;padding:0 24px;border:0;border-radius:10px;background:#075f5a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
a{color:#075f5a}
</style>
</head>
<body><main>
<h1>${escaparHtml(titulo)}</h1>
${corpoHtml}
</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      ...extraHeaders,
    },
  });
}

function paginaInvalida() {
  return pagina(
    400,
    'Link inválido',
    '<p>Este link de descadastro não é válido. Use o link "Parar de receber" do e-mail mais recente da OLLI Orçamentos.</p>',
  );
}

async function limitarPorIp(request, env) {
  if (!env?.LINK_RL) return true;
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    const { success } = await env.LINK_RL.limit({ key: `descadastro:${ip}` });
    return success;
  } catch {
    return true; // binding ausente/instável: a assinatura continua sendo a barreira
  }
}

async function paramsDoPost(request, url) {
  const daQuery = { u: url.searchParams.get('u'), e: url.searchParams.get('e'), a: url.searchParams.get('a') };
  let corpo = '';
  try {
    const bruto = await request.text();
    corpo = bruto.length <= MAX_FORM_BYTES ? bruto : '';
  } catch {
    corpo = '';
  }
  const form = new URLSearchParams(corpo);
  const oneClick = form.get('List-Unsubscribe') === 'One-Click';
  const params = daQuery.u || daQuery.a
    ? daQuery
    : { u: form.get('u'), e: form.get('e'), a: form.get('a') };
  return { params, oneClick };
}

/**
 * Handler da rota. `dependencias.fetchImpl` só existe para o teste.
 */
export async function handleDescadastroEmail(request, env, dependencias = {}) {
  const url = new URL(request.url);
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, erro: 'metodo_nao_suportado' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, POST', 'Cache-Control': 'no-store' },
    });
  }
  if (!(await limitarPorIp(request, env))) {
    return pagina(429, 'Muitas tentativas', '<p>Aguarde um minuto e tente de novo.</p>');
  }

  const chave = await chaveDescadastro(env);
  if (!chave) {
    return pagina(503, 'Descadastro indisponível', '<p>Não conseguimos processar agora. Tente de novo mais tarde.</p>');
  }

  if (request.method === 'GET') {
    const params = { u: url.searchParams.get('u'), e: url.searchParams.get('e'), a: url.searchParams.get('a') };
    const valido = await verificarDescadastroComEscopo(params, chave);
    if (!valido) return paginaInvalida();
    const t = POR_ESCOPO[valido.escopo];
    return pagina(
      200,
      t.pergunta,
      `<p>${escaparHtml(t.explica)}</p>
<form method="post" action="${escaparHtml(EMAIL_DESCADASTRO_PATH)}">
<input type="hidden" name="u" value="${escaparHtml(valido.userId)}">
<input type="hidden" name="e" value="${escaparHtml(valido.escopo)}">
<input type="hidden" name="a" value="${escaparHtml(texto(params.a, 64))}">
<button type="submit">${escaparHtml(t.botao)}</button>
</form>`,
    );
  }

  const { params, oneClick } = await paramsDoPost(request, url);
  const valido = await verificarDescadastroComEscopo(params, chave);
  if (!valido) return paginaInvalida();
  const { userId, escopo } = valido;
  const t = POR_ESCOPO[escopo];

  const supabaseUrl = texto(env?.SUPABASE_URL, 2048).replace(/\/+$/, '');
  const serviceRoleKey = texto(env?.SUPABASE_SERVICE_ROLE_KEY, 4096);
  if (!/^https:\/\/[^/]+/.test(supabaseUrl) || serviceRoleKey.length < 20) {
    return pagina(503, 'Descadastro indisponível', '<p>Não conseguimos registrar agora. Tente de novo mais tarde.</p>');
  }

  try {
    const config = { supabaseUrl, serviceRoleKey };
    const fetchImpl = dependencias.fetchImpl || fetch;
    const origem = oneClick ? 'one_click' : 'link_email';
    // `resumo` desliga só a preferência do resumo; `lembretes` grava a supressão.
    const resultado = escopo === EMAIL_DESCADASTRO_ESCOPO_RESUMO
      ? await chamarRpcServico(config, fetchImpl, 'desligar_resumo_dinheiro_email_servico', {
        p_user_id: userId,
        p_origem: origem,
      })
      : await chamarRpcServico(config, fetchImpl, 'registrar_supressao_email', {
        p_user_id: userId,
        p_motivo: 'descadastro',
        p_origem: origem,
      });
    if (!resultado || typeof resultado !== 'object' || typeof resultado.registrado !== 'boolean') {
      throw Object.assign(new Error('descadastro_resposta_invalida'), { codigo: 'descadastro_resposta_invalida' });
    }
  } catch (erro) {
    // Nunca dizer "pronto" sem ter gravado: a pessoa voltaria a receber.
    console.error(JSON.stringify({ event: 'email_descadastro_falhou', code: texto(erro?.codigo, 60) || 'erro' }));
    return pagina(503, 'Não deu certo agora', '<p>Não conseguimos registrar o seu pedido. Tente de novo em alguns minutos.</p>');
  }

  console.log(JSON.stringify({ event: 'email_descadastro_registrado', oneClick, escopo }));
  return pagina(200, t.pronto, `<p>${escaparHtml(t.prontoTexto)}</p>`);
}
