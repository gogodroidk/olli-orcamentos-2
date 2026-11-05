/**
 * CONFIRMAÇÃO DE VÉSPERA — porta PÚBLICA /v/<token> (Onda I3, jogada 5).
 *
 * GET  /v/<token> → página com a MARCA do prestador, o dia e a hora da visita e os
 *                   botões [Confirmo] / [Preciso remarcar]. NÃO grava nada: o
 *                   WhatsApp busca a prévia do link com GET, e um GET que marcasse
 *                   "visto" mentiria para o prestador.
 * POST /v/<token> → grava a resposta (formulário da própria página, sem JS).
 *
 * O que a página mostra: o nome/logo/cor do prestador, o dia e a hora da visita
 * (fuso de Brasília) e o nome curto do serviço. NADA do cliente (nome, endereço,
 * telefone, valor). O token (64 hex, gerado pelo banco no RPC
 * `pedir_confirmacao_visita`) é a única credencial e expira 2 h depois do início.
 *
 * Três estados honestos:
 *  - link válido → os botões (e, se já respondeu, a resposta atual, que pode mudar
 *    até o link expirar);
 *  - expirado → "Este link expirou" + WhatsApp do prestador (se houver);
 *  - inexistente/revogado/malformado → página genérica (não vaza se existiu);
 *  - banco fora → "Não consegui carregar agora" (nunca "visita cancelada").
 *
 * A visita CANCELADA ou excluída na agenda do prestador (quando a linha da agenda
 * já está na nuvem) mostra "Esta visita foi alterada", sem botões.
 *
 * Rate limit: o roteador (index.js) aplica o LINK_RL por IP antes de chegar aqui,
 * como no /o/ e no /q/. CSP restritiva, sem script.
 */

import { linkWaMe, numeroWhatsAppBR } from './telefoneWhatsapp.js';
import { FONTES_CSS } from './fontesProprias.js';
import { lerCorpoLimitado } from './bodyLimit.js';
import { corMarcaNoPapel } from '../../src/utils/coresMarca.ts';

const ACCENT = '#0B6FCE';
const RESPOSTA_MAX_BYTES = 1024;
const COLUNAS = 'id,user_id,agendamento_id,ocorrencia_dia,inicio,servico,status,respondido_em,expira_em,revogado_em';

// ─── peças puras (testadas em worker/scripts/teste-confirmacao-visita.js) ────

/** Token do RPC: exatamente 64 hex minúsculos. Qualquer outra coisa nem toca o banco. */
export function tokenConfirmacaoValido(t) {
  return typeof t === 'string' && /^[a-f0-9]{64}$/.test(t);
}

/** 'confirmo' → 'confirmada'; 'remarcar' → 'remarcar'; resto → null. */
export function respostaParaStatus(v) {
  if (v === 'confirmo') return 'confirmada';
  if (v === 'remarcar') return 'remarcar';
  return null;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logoSegura(prestador) {
  const uri = prestador && typeof prestador.logoUri === 'string' ? prestador.logoUri : '';
  if (!uri || uri.length > 350_000) return '';
  return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(uri) ? uri : '';
}

function nomeDoPrestador(prestador) {
  const n = prestador && typeof prestador.nome === 'string' ? prestador.nome.trim() : '';
  return n || 'Seu prestador de serviço';
}

function contatoDoPrestador(prestador) {
  return numeroWhatsAppBR((prestador && prestador.whatsapp) || '') ||
    numeroWhatsAppBR((prestador && prestador.telefone) || '');
}

/** YYYY-MM-DD do instante em Brasília (UTC−3 fixo, sem horário de verão desde 2019). */
function diaBrasilia(ms) {
  return new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * "amanhã, quinta-feira, 2 de outubro, às 14:00" — sempre no fuso de Brasília,
 * relativo a `agoraMs`. '' se a data for ilegível (a página então não afirma dia).
 */
export function quandoDaVisita(inicioIso, agoraMs = Date.now()) {
  const t = Date.parse(inicioIso);
  if (!Number.isFinite(t)) return '';
  const local = new Date(t - 3 * 3_600_000);
  const semana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const hora = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
  const dia = `${semana[local.getUTCDay()]}, ${local.getUTCDate()} de ${meses[local.getUTCMonth()]}`;
  const hoje = diaBrasilia(agoraMs);
  const amanha = diaBrasilia(agoraMs + 86_400_000);
  const alvo = diaBrasilia(t);
  const prefixo = alvo === hoje ? 'hoje, ' : alvo === amanha ? 'amanhã, ' : '';
  return `${prefixo}${dia}, às ${hora}`;
}

// ─── acesso ao Supabase (service role) ───────────────────────────────────────
function sbHeaders(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

/** Linha pelo token (não revogada). null = não existe; {error:true} = banco fora. */
async function lerPorToken(env, token) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/agendamentos_confirmacao?token=eq.${encodeURIComponent(token)}` +
        `&revogado_em=is.null&select=${COLUNAS}&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { error: true };
  }
}

/** Dados da empresa (marca + contato). {} em qualquer falha. */
async function lerPrestador(env, userId) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/empresa?user_id=eq.${encodeURIComponent(userId)}&select=dados&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return {};
    const arr = await r.json().catch(() => null);
    const dados = Array.isArray(arr) && arr[0] && typeof arr[0].dados === 'object' ? arr[0].dados : {};
    return dados || {};
  } catch {
    return {};
  }
}

/**
 * A visita na agenda do prestador ainda vale? 'cancelada' só com PROVA (linha
 * da nuvem cancelada/excluída). Linha ausente (ainda não sincronizou), erro de
 * leitura ou série recorrente = 'desconhecido' → a página segue normal.
 */
async function situacaoDaAgenda(env, linha) {
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/agendamentos?id=eq.${encodeURIComponent(linha.agendamento_id)}` +
        `&user_id=eq.${encodeURIComponent(linha.user_id)}&select=status,excluido_em,recorrencia&limit=1`,
      { headers: sbHeaders(env) },
    );
    if (!r.ok) return 'desconhecido';
    const arr = await r.json().catch(() => null);
    const a = Array.isArray(arr) ? arr[0] : null;
    if (!a) return 'desconhecido';
    if (a.excluido_em) return 'cancelada';
    if (!a.recorrencia && a.status === 'cancelado') return 'cancelada';
    return 'ok';
  } catch {
    return 'desconhecido';
  }
}

/** Grava a resposta. Devolve a linha nova, null (expirou/revogou no meio) ou {error:true}. */
async function gravarResposta(env, token, status) {
  const agora = new Date().toISOString();
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/agendamentos_confirmacao?token=eq.${encodeURIComponent(token)}` +
        `&revogado_em=is.null&expira_em=gt.${encodeURIComponent(agora)}&select=${COLUNAS}`,
      {
        method: 'PATCH',
        headers: sbHeaders(env, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ status, respondido_em: agora, atualizado_em: agora }),
      },
    );
    if (!r.ok) return { error: true };
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr)) return { error: true };
    return arr.length ? arr[0] : null;
  } catch {
    return { error: true };
  }
}

// ─── HTTP ────────────────────────────────────────────────────────────────────
function htmlResp(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      // Página estática sem <script>; img só data: (a logo do prestador);
      // form-action 'self' para os dois botões.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; font-src https://olliorcamentos.online; img-src data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

export async function renderConfirmacao(token, env) {
  if (!tokenConfirmacaoValido(token)) return htmlResp(pageInvalida(), 404);
  const linha = await lerPorToken(env, token);
  if (linha && linha.error) return htmlResp(pageErro(), 503);
  if (!linha) return htmlResp(pageInvalida(), 404);
  const [prestador, agenda] = await Promise.all([lerPrestador(env, linha.user_id), situacaoDaAgenda(env, linha)]);
  if (Date.parse(linha.expira_em) <= Date.now()) return htmlResp(pageExpirada(prestador), 410);
  if (agenda === 'cancelada') return htmlResp(pageAlterada(prestador), 410);
  return htmlResp(pageConfirmacao(linha, prestador, token));
}

export async function responderConfirmacao(token, env, request) {
  if (!tokenConfirmacaoValido(token)) return htmlResp(pageInvalida(), 404);
  const { grande, raw } = await lerCorpoLimitado(request, RESPOSTA_MAX_BYTES);
  if (grande) return htmlResp(pageInvalida(), 413);
  const campos = Object.fromEntries(new URLSearchParams(raw || ''));
  const status = respostaParaStatus(campos.resposta);

  const linha = await lerPorToken(env, token);
  if (linha && linha.error) return htmlResp(pageErro(), 503);
  if (!linha) return htmlResp(pageInvalida(), 404);
  const prestador = await lerPrestador(env, linha.user_id);
  if (Date.parse(linha.expira_em) <= Date.now()) return htmlResp(pageExpirada(prestador), 410);
  if (!status) return htmlResp(pageConfirmacao(linha, prestador, token, 'Escolha uma das opções abaixo.'), 400);
  if ((await situacaoDaAgenda(env, linha)) === 'cancelada') return htmlResp(pageAlterada(prestador), 410);

  const nova = await gravarResposta(env, token, status);
  if (nova && nova.error) {
    return htmlResp(pageConfirmacao(linha, prestador, token, 'Não consegui registrar sua resposta agora. Tente de novo em instantes.'), 503);
  }
  if (!nova) return htmlResp(pageExpirada(prestador), 410);
  return htmlResp(pageRespondida(nova, prestador));
}

// ─── páginas ─────────────────────────────────────────────────────────────────
function shell(inner, accentRaw) {
  // Cabeçalho com texto branco. Marca clara escurece só até 4,5:1; #123ABC fica.
  const accent = corMarcaNoPapel(accentRaw, ACCENT);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Confirmação de visita</title>
<style>${FONTES_CSS}</style>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;background:#EEF1F5;color:#1A2230;-webkit-font-smoothing:antialiased;padding:24px 16px 48px}
  .wrap{max-width:440px;margin:0 auto}
  .card{background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(10,37,64,.12);animation:sobe .42s cubic-bezier(.2,.8,.2,1) both}
  @keyframes sobe{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion: reduce){.card{animation:none}}
  .hd{background:linear-gradient(140deg,${accent},#0A2540);padding:22px;color:#fff;display:flex;align-items:center;gap:12px}
  .hd-logo{width:46px;height:46px;border-radius:13px;background:#fff;object-fit:contain;padding:4px}
  .hd-ini{width:46px;height:46px;border-radius:13px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px}
  .hd-nome{font-size:18px;font-weight:800;line-height:1.2}
  .hd-tag{font-size:12.5px;color:rgba(255,255,255,.82);margin-top:2px}
  .body{padding:22px}
  .eyebrow{font-size:11.5px;font-weight:800;color:#6B7686;letter-spacing:.4px}
  .titulo{font-size:21px;font-weight:800;margin-top:6px;line-height:1.3}
  .quando{margin-top:16px;background:#F5F7FA;border:1px solid #E8ECF1;border-radius:16px;padding:16px}
  .quando-v{font-size:17px;font-weight:800;line-height:1.35}
  .quando-s{font-size:13px;color:#5A6575;margin-top:4px}
  .estado{margin-top:14px;border-radius:12px;padding:11px 13px;font-size:13.5px;font-weight:700;line-height:1.4}
  .estado-ok{background:#E7F8F1;color:#0B7A51}
  .estado-rem{background:#FEF4E6;color:#9A5B0A}
  .erro{margin-top:14px;background:#FDECEA;color:#A93226;border-radius:12px;padding:11px 13px;font-size:13px;font-weight:600}
  form{margin:0}
  .acoes{margin-top:18px;display:flex;flex-direction:column;gap:10px}
  .btn{width:100%;border:none;border-radius:15px;padding:16px;font-family:inherit;font-size:16px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;transition:transform .12s ease}
  .btn:active{transform:scale(.98)}
  .btn-ok{background:#12A867;color:#fff;box-shadow:0 8px 20px rgba(18,168,103,.26)}
  .btn-rem{background:#fff;color:#1A2230;border:1.5px solid #D5DBE3}
  .btn-zap{background:#15B66E;color:#fff}
  .nota{margin-top:16px;font-size:11.5px;color:#8A93A2;line-height:1.5}
  .msg{background:#fff;border-radius:24px;padding:40px 24px;text-align:center;box-shadow:0 18px 50px rgba(10,37,64,.12)}
  .msg-ic{font-size:40px}
  .msg-t{font-size:19px;font-weight:800;margin-top:12px}
  .msg-s{font-size:14px;color:#5A6575;margin-top:8px;line-height:1.55}
  .msg .acoes{margin-top:22px}
</style>
</head>
<body><div class="wrap">${inner}</div></body>
</html>`;
}

function cabecalho(prestador) {
  const nome = nomeDoPrestador(prestador);
  const logo = logoSegura(prestador);
  const tag = prestador && typeof prestador.especialidade === 'string' ? prestador.especialidade.trim() : '';
  const marca = logo
    ? `<img class="hd-logo" src="${logo}" alt="${esc(nome)}"/>`
    : `<div class="hd-ini" aria-hidden="true">${esc(nome.charAt(0).toUpperCase())}</div>`;
  return `<div class="hd">${marca}<div><div class="hd-nome">${esc(nome)}</div>${tag ? `<div class="hd-tag">${esc(tag)}</div>` : ''}</div></div>`;
}

function botaoZap(prestador, texto, mensagem) {
  const num = contatoDoPrestador(prestador);
  if (!num) return '';
  return `<a class="btn btn-zap" href="${esc(linkWaMe(num, mensagem))}" target="_blank" rel="noopener noreferrer">💬 ${esc(texto)}</a>`;
}

function pageConfirmacao(linha, prestador, token, erro) {
  const quando = quandoDaVisita(linha.inicio);
  const servico = typeof linha.servico === 'string' ? linha.servico.trim() : '';
  const respondeu = linha.status === 'confirmada' || linha.status === 'remarcar';
  const estado = linha.status === 'confirmada'
    ? '<div class="estado estado-ok">✓ Você já confirmou esta visita. Se mudou de ideia, é só tocar abaixo.</div>'
    : linha.status === 'remarcar'
      ? '<div class="estado estado-rem">Você pediu para remarcar. Se der para manter o horário, toque em Confirmo.</div>'
      : '';
  const acao = `/v/${esc(encodeURIComponent(token))}`;
  const inner = `<div class="card">
    ${cabecalho(prestador)}
    <div class="body">
      <div class="eyebrow">CONFIRMAÇÃO DE VISITA</div>
      <div class="titulo">${respondeu ? 'Sua visita' : 'Você confirma a visita?'}</div>
      <div class="quando">
        <div class="quando-v">${quando ? esc(quando.charAt(0).toUpperCase() + quando.slice(1)) : 'Dia e horário combinados com o prestador'}</div>
        ${servico ? `<div class="quando-s">${esc(servico)}</div>` : ''}
      </div>
      ${estado}
      ${erro ? `<div class="erro" role="alert">${esc(erro)}</div>` : ''}
      <div class="acoes">
        <form method="post" action="${acao}"><input type="hidden" name="resposta" value="confirmo"/><button class="btn btn-ok" type="submit">✓ Confirmo</button></form>
        <form method="post" action="${acao}"><input type="hidden" name="resposta" value="remarcar"/><button class="btn btn-rem" type="submit">Preciso remarcar</button></form>
      </div>
      <div class="nota">Sua resposta vai só para ${esc(nomeDoPrestador(prestador))}. Esta página mostra apenas o dia, o horário e o serviço da visita: nada de endereço, telefone ou valores.</div>
    </div>
  </div>`;
  return shell(inner, prestador && prestador.corMarca);
}

function pageRespondida(linha, prestador) {
  const nome = nomeDoPrestador(prestador);
  const quando = quandoDaVisita(linha.inicio);
  if (linha.status === 'confirmada') {
    return shell(`<div class="msg">
      <div class="msg-ic">✅</div>
      <div class="msg-t">Visita confirmada</div>
      <div class="msg-s">Sua confirmação${quando ? ` para ${esc(quando)}` : ''} foi registrada e aparece para <strong>${esc(nome)}</strong> na agenda. Até lá!</div>
    </div>`, prestador && prestador.corMarca);
  }
  const zap = botaoZap(prestador, `Combinar novo horário com ${nome}`, 'Olá! Pedi para remarcar a visita pelo link. Qual outro horário fica bom?');
  return shell(`<div class="msg">
    <div class="msg-ic">📅</div>
    <div class="msg-t">Pedido de remarcação registrado</div>
    <div class="msg-s">Seu pedido aparece para <strong>${esc(nome)}</strong> na agenda.${zap ? ' Para combinar o novo horário mais rápido, chame no WhatsApp.' : ''}</div>
    ${zap ? `<div class="acoes">${zap}</div>` : ''}
  </div>`, prestador && prestador.corMarca);
}

function pageExpirada(prestador) {
  const nome = nomeDoPrestador(prestador);
  const zap = botaoZap(prestador, `Falar com ${nome}`, 'Olá! Recebi o link de confirmação da visita, mas ele já expirou.');
  return shell(`<div class="msg">
    <div class="msg-ic">⏳</div>
    <div class="msg-t">Este link expirou</div>
    <div class="msg-s">O horário desta visita já passou ou foi trocado. Para qualquer ajuste, fale direto com <strong>${esc(nome)}</strong>.</div>
    ${zap ? `<div class="acoes">${zap}</div>` : ''}
  </div>`, prestador && prestador.corMarca);
}

function pageAlterada(prestador) {
  const nome = nomeDoPrestador(prestador);
  const zap = botaoZap(prestador, `Falar com ${nome}`, 'Olá! Abri o link da visita e ele diz que a visita foi alterada. Podemos conferir?');
  return shell(`<div class="msg">
    <div class="msg-ic">🗓️</div>
    <div class="msg-t">Esta visita foi alterada</div>
    <div class="msg-s"><strong>${esc(nome)}</strong> cancelou ou mudou esta visita na agenda. Fale com ele para combinar.</div>
    ${zap ? `<div class="acoes">${zap}</div>` : ''}
  </div>`, prestador && prestador.corMarca);
}

function pageInvalida() {
  return shell(`<div class="msg">
    <div class="msg-ic">🔗</div>
    <div class="msg-t">Link inválido</div>
    <div class="msg-s">Este link de confirmação não existe ou foi substituído por um novo. Confira a última mensagem que você recebeu.</div>
  </div>`);
}

function pageErro() {
  return shell(`<div class="msg">
    <div class="msg-ic">🔌</div>
    <div class="msg-t">Não consegui carregar agora</div>
    <div class="msg-s">Tente de novo em alguns instantes.</div>
  </div>`);
}
