/**
 * WhatsApp Cloud API MULTI-NÚMERO (07/10/2026).
 *
 *   GET  /whatsapp/webhook    verificação da Meta (hub.verify_token → devolve hub.challenge)
 *   POST /whatsapp/webhook    mensagens e status; valida X-Hub-Signature-256 com o app secret ANTES de ler
 *   POST /whatsapp/enviar     envio interno (Bearer wa_envio_token) — passa pelo guarda do banco
 *   GET  /whatsapp/fila       fila de entrada do atendimento (Bearer wa_envio_token)
 *   POST /whatsapp/fila/atualizar   marca em_atendimento/resolvido (Bearer wa_envio_token)
 *   POST /whatsapp/aprovar    OK HUMANO do primeiro contato (Bearer wa_aprovacao_token — outro token)
 *
 * Roteamento: cada mensagem traz `metadata.phone_number_id`; o banco (`wa_numeros`) diz se o número existe,
 * está ativo e qual marca é. Número desconhecido/inativo = ignorado (200, para a Meta não reenviar) e contado.
 * 1 número hoje, N amanhã: é só inserir linha em `wa_numeros`; nenhum código muda.
 *
 * SEGREDOS: ficam no Supabase Vault (o Workers Free está em 64/64 variáveis). Lidos por RPC de service_role
 * e guardados 60 s na memória do isolate. Segredo ausente = rota DESLIGADA (503), nunca aberta.
 *
 * REGRAS DE ENVIO (verdade única no banco, supabase/migrations/20261007110000_whatsapp_cloud_multinumero.sql):
 * SAIR/opt-out, primeiro contato só com OK humano, fora da janela de 24 h só template, intervalo entre
 * templates, teto diário. Aqui o worker só traduz a decisão em HTTP e fala com a Graph API.
 *
 * LOG: só contagens e rótulos. NUNCA telefone, nome, texto da mensagem, token nem corpo de resposta da Meta.
 */
import { lerCorpoLimitado } from './bodyLimit.js';
import { chamarRpcServico } from './emailRpc.js';

export const WHATSAPP_CLOUD_VERSION = '2026-10-07.v1';
export const GRAPH_VERSAO = 'v23.0';
export const WEBHOOK_MAX_BYTES = 1024 * 1024;
export const ENVIO_MAX_BYTES = 16 * 1024;
const SEGREDOS_TTL_MS = 60_000;
/** Limites das funções do banco (wa_registrar_entradas ≤ 100 itens, wa_registrar_statuses ≤ 200). */
export const LOTE_ENTRADAS = 100;
export const LOTE_STATUS = 200;
/** Teto de chamadas ao banco por webhook (o Workers Free dá 50 subrequests por invocação). */
export const MAX_LOTES_POR_WEBHOOK = 40;
const TEXTO_MAX = 1600;

function resposta(corpo, status = 200, extra = {}) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

function log(evento, dados) {
  console.log(JSON.stringify({ event: evento, ...dados }));
}

// ─── Criptografia: comparação em tempo constante e assinatura da Meta ────────────

const enc = new TextEncoder();

async function hmac(chave, dado) {
  const k = await crypto.subtle.importKey('raw', enc.encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof dado === 'string' ? enc.encode(dado) : dado));
}

/** Igualdade em tempo constante (HMAC dos dois lados com chave fixa → compara bytes sem curto-circuito). */
export async function igualConstante(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) return false;
  const [x, y] = await Promise.all([hmac('olli.wa.igual', a), hmac('olli.wa.igual', b)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length && i < y.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

function hex(bytes) {
  return [...bytes].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(app secret, corpo CRU). Sem segredo/cabeçalho = inválida. */
export async function verificarAssinaturaMeta(rawBody, cabecalho, appSecret) {
  if (typeof appSecret !== 'string' || appSecret.length < 8) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(typeof cabecalho === 'string' ? cabecalho.trim() : '');
  if (!m) return false;
  const esperado = hex(await hmac(appSecret, rawBody));
  return igualConstante(esperado, m[1].toLowerCase());
}

// ─── Segredos (Vault) ───────────────────────────────────────────────────────────

let cacheSegredos = { ate: 0, chave: '', valor: null };

export function limparCacheSegredos() {
  cacheSegredos = { ate: 0, chave: '', valor: null };
}

function configSupabase(env) {
  const supabaseUrl = typeof env?.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim().replace(/\/+$/, '') : '';
  const serviceRoleKey = typeof env?.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  if (!/^https:\/\/[^/]+/.test(supabaseUrl) || serviceRoleKey.length < 20) return null;
  return { supabaseUrl, serviceRoleKey };
}

async function carregarSegredos(config, fetchImpl, agora) {
  if (cacheSegredos.valor && cacheSegredos.chave === config.supabaseUrl && cacheSegredos.ate > agora) return cacheSegredos.valor;
  const s = await chamarRpcServico(config, fetchImpl, 'wa_segredos', {});
  const limpo = {
    verify_token: typeof s?.verify_token === 'string' ? s.verify_token : null,
    app_secret: typeof s?.app_secret === 'string' ? s.app_secret : null,
    envio_token: typeof s?.envio_token === 'string' ? s.envio_token : null,
    aprovacao_token: typeof s?.aprovacao_token === 'string' ? s.aprovacao_token : null,
  };
  cacheSegredos = { ate: agora + SEGREDOS_TTL_MS, chave: config.supabaseUrl, valor: limpo };
  return limpo;
}

// ─── Normalização do payload da Meta (pura, testável) ───────────────────────────

const TIPOS_IGNORADOS = new Set(['reaction', 'system', 'ephemeral', 'unsupported']);

function textoDaMensagem(m) {
  if (m?.type === 'text') return typeof m.text?.body === 'string' ? m.text.body : null;
  if (m?.type === 'button') return typeof m.button?.text === 'string' ? m.button.text : null;
  if (m?.type === 'interactive') {
    const t = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
    return typeof t === 'string' ? t : null;
  }
  return null;
}

/** Fatia em lotes de no máximo `n` itens, sem descartar nenhum. */
export function emLotes(lista, n) {
  const saida = [];
  for (let i = 0; i < lista.length; i += n) saida.push(lista.slice(i, i + n));
  return saida;
}

/** Inteiro >= 0 ou lança: resposta vazia/estranha do banco NÃO é "zero", é "não sei" (a Meta reenvia). */
function contagem(valor, campo) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw Object.assign(new Error('resposta_invalida'), { codigo: `resposta_invalida_${campo}` });
  }
  return valor;
}

/**
 * Agrupa o que importa por phone_number_id. Devolve só dado já saneado:
 * { porNumero: Map<string, item[]>, statuses: item[], ignoradas: number }
 */
export function normalizarWebhook(payload) {
  const porNumero = new Map();
  const statuses = [];
  let ignoradas = 0;
  if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return { porNumero, statuses, ignoradas: 0, valido: false };
  }
  for (const entry of payload.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      const v = change.value || {};
      const phoneNumberId = typeof v.metadata?.phone_number_id === 'string' ? v.metadata.phone_number_id : null;
      if (!phoneNumberId || !/^[0-9]{5,20}$/.test(phoneNumberId)) {
        ignoradas += (Array.isArray(v.messages) ? v.messages.length : 0) + (Array.isArray(v.statuses) ? v.statuses.length : 0);
        continue;
      }
      const perfis = new Map();
      for (const c of Array.isArray(v.contacts) ? v.contacts : []) {
        if (typeof c?.wa_id === 'string' && typeof c?.profile?.name === 'string') perfis.set(c.wa_id, c.profile.name);
      }
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        const tipo = typeof m?.type === 'string' ? m.type.toLowerCase() : 'desconhecido';
        if (TIPOS_IGNORADOS.has(tipo) || typeof m?.id !== 'string' || typeof m?.from !== 'string') {
          ignoradas += 1;
          continue;
        }
        const lista = porNumero.get(phoneNumberId) || [];
        lista.push({
          id: m.id,
          telefone: m.from,
          perfil: perfis.get(m.from) ?? null,
          tipo,
          texto: textoDaMensagem(m),
          ts: typeof m.timestamp === 'string' || typeof m.timestamp === 'number' ? String(m.timestamp) : null,
        });
        porNumero.set(phoneNumberId, lista);
      }
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
        if (typeof s?.id !== 'string' || typeof s?.status !== 'string') {
          ignoradas += 1;
          continue;
        }
        const cod = s.errors?.[0]?.code;
        statuses.push({ id: s.id, estado: s.status, codigo: cod === undefined ? null : String(cod).slice(0, 40) });
      }
    }
  }
  return { porNumero, statuses, ignoradas, valido: true };
}

// ─── Webhook ────────────────────────────────────────────────────────────────────

export async function handleWhatsappWebhook(request, env, dependencias = {}) {
  const fetchImpl = dependencias.fetchImpl || fetch;
  const agora = (dependencias.now || Date.now)();
  const config = configSupabase(env);
  if (!config) return resposta({ ok: false, erro: 'nao_configurado' }, 503);

  let segredos;
  try {
    segredos = await carregarSegredos(config, fetchImpl, agora);
  } catch {
    log('whatsapp_webhook', { resultado: 'segredos_indisponiveis' });
    return resposta({ ok: false, erro: 'indisponivel' }, 503);
  }

  if (request.method === 'GET') {
    const u = new URL(request.url);
    const modo = u.searchParams.get('hub.mode');
    const token = u.searchParams.get('hub.verify_token');
    const desafio = u.searchParams.get('hub.challenge') || '';
    if (!segredos.verify_token) return resposta({ ok: false, erro: 'nao_configurado' }, 503);
    if (modo !== 'subscribe' || !(await igualConstante(token || '', segredos.verify_token))) {
      return resposta({ ok: false, erro: 'verificacao_recusada' }, 403);
    }
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(desafio)) return resposta({ ok: false, erro: 'desafio_invalido' }, 400);
    return new Response(desafio, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'POST') return resposta({ ok: false, erro: 'metodo_nao_suportado' }, 405);

  if (!segredos.app_secret) return resposta({ ok: false, erro: 'nao_configurado' }, 503);
  const declarado = Number(request.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > WEBHOOK_MAX_BYTES) return resposta({ ok: false, erro: 'payload_grande' }, 413);
  const corpo = await lerCorpoLimitado(request, WEBHOOK_MAX_BYTES);
  if (corpo.grande) return resposta({ ok: false, erro: 'payload_grande' }, 413);

  if (!(await verificarAssinaturaMeta(corpo.raw, request.headers.get('x-hub-signature-256'), segredos.app_secret))) {
    log('whatsapp_webhook', { resultado: 'assinatura_invalida' });
    return resposta({ ok: false, erro: 'assinatura_invalida' }, 403);
  }

  let payload;
  try {
    payload = JSON.parse(corpo.raw);
  } catch {
    return resposta({ ok: false, erro: 'payload_invalido' }, 400);
  }
  const n = normalizarWebhook(payload);
  if (!n.valido) return resposta({ ok: true, ignorado: true });

  const total = { registradas: 0, duplicadas: 0, saiu: 0, ignoradas: n.ignoradas, status: 0 };
  const lotesEntrada = [];
  for (const [phoneNumberId, itens] of n.porNumero) {
    for (const lote of emLotes(itens, LOTE_ENTRADAS)) lotesEntrada.push({ phoneNumberId, lote });
  }
  const lotesStatus = emLotes(n.statuses, LOTE_STATUS);
  try {
    // Mais chamadas do que o Workers Free aguenta: processa o que cabe e devolve 500 — a Meta reenvia e, como
    // a gravação é idempotente, cada nova tentativa avança (nada é descartado nem fica em laço sem progresso).
    if (lotesEntrada.length + lotesStatus.length > MAX_LOTES_POR_WEBHOOK) total.excedeu = true;
    let restante = MAX_LOTES_POR_WEBHOOK;
    for (const { phoneNumberId, lote } of lotesEntrada) {
      if (restante <= 0) break;
      restante -= 1;
      const r = await chamarRpcServico(config, fetchImpl, 'wa_registrar_entradas', { p_phone_number_id: phoneNumberId, p_itens: lote });
      total.registradas += contagem(r?.registradas, 'registradas');
      total.duplicadas += contagem(r?.duplicadas, 'duplicadas');
      total.saiu += contagem(r?.saiu, 'saiu');
      total.ignoradas += contagem(r?.ignoradas, 'ignoradas');
    }
    for (const lote of lotesStatus) {
      if (restante <= 0) break;
      restante -= 1;
      total.status += contagem(await chamarRpcServico(config, fetchImpl, 'wa_registrar_statuses', { p_itens: lote }), 'status');
    }
  } catch (erro) {
    // 500 faz a Meta reenviar; a gravação é idempotente por wa_message_id, então reenviar é seguro.
    log('whatsapp_webhook', { resultado: 'falha_ao_gravar', codigo: String(erro?.codigo || 'erro').slice(0, 40) });
    return resposta({ ok: false, erro: 'falha_ao_gravar' }, 500);
  }
  if (total.excedeu) {
    log('whatsapp_webhook', { resultado: 'excedeu_lotes', ...total });
    return resposta({ ok: false, erro: 'excedeu_lotes' }, 500);
  }
  log('whatsapp_webhook', { resultado: 'ok', ...total });
  return resposta({ ok: true, ...total });
}

// ─── Rotas internas ─────────────────────────────────────────────────────────────

async function autenticar(request, config, fetchImpl, agora, qual) {
  const m = /^Bearer\s+(\S{16,300})$/.exec(request.headers.get('authorization') || '');
  if (!m) return { ok: false, resp: resposta({ ok: false, erro: 'nao_autorizado' }, 401) };
  let segredos;
  try {
    segredos = await carregarSegredos(config, fetchImpl, agora);
  } catch {
    return { ok: false, resp: resposta({ ok: false, erro: 'indisponivel' }, 503) };
  }
  const esperado = segredos[qual];
  if (!esperado) return { ok: false, resp: resposta({ ok: false, erro: 'nao_configurado' }, 503) }; // desligada, nunca aberta
  if (!(await igualConstante(m[1], esperado))) return { ok: false, resp: resposta({ ok: false, erro: 'nao_autorizado' }, 401) };
  return { ok: true };
}

async function lerJson(request, max) {
  const corpo = await lerCorpoLimitado(request, max);
  if (corpo.grande) return { erro: resposta({ ok: false, erro: 'payload_grande' }, 413) };
  try {
    const dados = JSON.parse(corpo.raw);
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('forma');
    return { dados };
  } catch {
    return { erro: resposta({ ok: false, erro: 'payload_invalido' }, 400) };
  }
}

async function resolverNumero(config, fetchImpl, dados) {
  const pid = typeof dados.phone_number_id === 'string' && /^[0-9]{5,20}$/.test(dados.phone_number_id) ? dados.phone_number_id : null;
  const marca = typeof dados.marca === 'string' && dados.marca.length >= 2 && dados.marca.length <= 60 ? dados.marca : null;
  if (!pid && !marca) return null;
  const r = await chamarRpcServico(config, fetchImpl, 'wa_numero_ativo', { p_phone_number_id: pid, p_marca: pid ? null : marca });
  return r && typeof r.phone_number_id === 'string' ? r : null;
}

function montarMensagem(dados, telefone) {
  if (dados.tipo === 'texto') {
    const texto = typeof dados.texto === 'string' ? dados.texto.trim() : '';
    if (!texto || texto.length > TEXTO_MAX) return null;
    return { messaging_product: 'whatsapp', recipient_type: 'individual', to: telefone, type: 'text', text: { body: texto, preview_url: false } };
  }
  const nome = typeof dados.template === 'string' ? dados.template : '';
  if (!/^[a-z0-9_]{1,100}$/.test(nome)) return null;
  const idioma = typeof dados.idioma === 'string' ? dados.idioma : 'pt_BR';
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(idioma)) return null;
  const template = { name: nome, language: { code: idioma } };
  if (dados.componentes !== undefined) {
    if (!Array.isArray(dados.componentes) || dados.componentes.length > 10 || JSON.stringify(dados.componentes).length > 4096) return null;
    template.components = dados.componentes;
  }
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to: telefone, type: 'template', template };
}

export async function handleWhatsappEnviar(request, env, dependencias = {}) {
  const fetchImpl = dependencias.fetchImpl || fetch;
  const agora = (dependencias.now || Date.now)();
  if (request.method !== 'POST') return resposta({ ok: false, erro: 'metodo_nao_suportado' }, 405);
  const config = configSupabase(env);
  if (!config) return resposta({ ok: false, erro: 'nao_configurado' }, 503);
  const auth = await autenticar(request, config, fetchImpl, agora, 'envio_token');
  if (!auth.ok) return auth.resp;

  const lido = await lerJson(request, ENVIO_MAX_BYTES);
  if (lido.erro) return lido.erro;
  const dados = lido.dados;
  if (dados.tipo !== 'texto' && dados.tipo !== 'template') return resposta({ ok: false, erro: 'tipo_invalido' }, 400);

  try {
    const numero = await resolverNumero(config, fetchImpl, dados);
    if (!numero) return resposta({ ok: false, motivo: 'numero_inativo' }, 409);

    const userId = typeof dados.user_id === 'string' && /^[0-9a-f-]{36}$/i.test(dados.user_id) ? dados.user_id : null;
    const decisao = await chamarRpcServico(config, fetchImpl, 'wa_autorizar_envio', {
      p_phone_number_id: numero.phone_number_id,
      p_telefone: typeof dados.para === 'string' ? dados.para : '',
      p_tipo: dados.tipo,
      p_template: dados.tipo === 'template' ? (typeof dados.template === 'string' ? dados.template : null) : null,
      p_user_id: userId,
    });
    if (!decisao || decisao.pode !== true) {
      const motivo = typeof decisao?.motivo === 'string' ? decisao.motivo : 'recusado';
      log('whatsapp_envio', { resultado: 'bloqueado', motivo });
      if (motivo === 'aguarde') {
        const s = Math.max(1, Number(decisao.aguarde_s) || 1);
        return resposta({ ok: false, motivo, aguarde_s: s }, 429, { 'Retry-After': String(s) });
      }
      return resposta({ ok: false, motivo, detalhe: typeof decisao?.detalhe === 'string' ? decisao.detalhe : undefined }, 409);
    }

    const mensagem = montarMensagem(dados, decisao.telefone);
    const concluir = (waId, codigo) => chamarRpcServico(config, fetchImpl, 'wa_concluir_envio', {
      p_envio_id: decisao.envio_id, p_wa_message_id: waId, p_codigo_falha: codigo,
    }).catch(() => null);
    if (!mensagem) {
      await concluir(null, 'payload_invalido');
      return resposta({ ok: false, erro: 'payload_invalido' }, 400);
    }
    const token = await chamarRpcServico(config, fetchImpl, 'wa_token_numero', { p_phone_number_id: numero.phone_number_id });
    if (typeof token !== 'string' || token.length < 20) {
      await concluir(null, 'sem_token');
      log('whatsapp_envio', { resultado: 'falhou', motivo: 'sem_token' });
      return resposta({ ok: false, motivo: 'numero_sem_token' }, 503);
    }

    let r;
    try {
      r = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSAO}/${numero.phone_number_id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(mensagem),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      await concluir(null, 'rede');
      log('whatsapp_envio', { resultado: 'falhou', motivo: 'rede' });
      return resposta({ ok: false, motivo: 'meta_indisponivel' }, 502);
    }
    const corpo = await r.json().catch(() => null);
    const waId = corpo?.messages?.[0]?.id;
    if (!r.ok || typeof waId !== 'string') {
      const codigo = String(corpo?.error?.code ?? `http_${r.status}`).slice(0, 40);
      await concluir(null, codigo);
      log('whatsapp_envio', { resultado: 'falhou', motivo: 'meta_erro', codigo });
      return resposta({ ok: false, motivo: 'meta_erro', codigo }, 502);
    }
    await concluir(waId, null);
    log('whatsapp_envio', { resultado: 'enviado', tipo: dados.tipo });
    return resposta({ ok: true, envio_id: decisao.envio_id, wa_message_id: waId });
  } catch (erro) {
    log('whatsapp_envio', { resultado: 'erro_interno', codigo: String(erro?.codigo || 'erro').slice(0, 40) });
    return resposta({ ok: false, erro: 'indisponivel' }, 503);
  }
}

export async function handleWhatsappFila(request, env, dependencias = {}) {
  const fetchImpl = dependencias.fetchImpl || fetch;
  const agora = (dependencias.now || Date.now)();
  const url = new URL(request.url);
  const atualizar = url.pathname === '/whatsapp/fila/atualizar';
  if (request.method !== (atualizar ? 'POST' : 'GET')) return resposta({ ok: false, erro: 'metodo_nao_suportado' }, 405);
  const config = configSupabase(env);
  if (!config) return resposta({ ok: false, erro: 'nao_configurado' }, 503);
  const auth = await autenticar(request, config, fetchImpl, agora, 'envio_token');
  if (!auth.ok) return auth.resp;
  try {
    if (!atualizar) {
      const limite = Math.max(1, Math.min(200, Number(url.searchParams.get('limite')) || 50));
      const itens = await chamarRpcServico(config, fetchImpl, 'wa_fila_entrada', { p_limit: limite }, { limiteBytes: 1024 * 1024 });
      // Fila vazia chega como `[]`. Corpo vazio/estranho = "não sei" → 503 (erro nunca vira lista vazia).
      if (!Array.isArray(itens)) return resposta({ ok: false, erro: 'indisponivel' }, 503);
      return resposta({ ok: true, itens });
    }
    const lido = await lerJson(request, 2048);
    if (lido.erro) return lido.erro;
    const { id, estado, atribuido_a: atribuidoA } = lido.dados;
    if (!Number.isInteger(id) || id < 1 || (estado !== 'em_atendimento' && estado !== 'resolvido')) {
      return resposta({ ok: false, erro: 'payload_invalido' }, 400);
    }
    const ok = await chamarRpcServico(config, fetchImpl, 'wa_fila_atualizar', {
      p_id: id, p_estado: estado, p_atribuido_a: typeof atribuidoA === 'string' ? atribuidoA : null,
    });
    if (ok === true) return resposta({ ok: true });
    if (ok === false) return resposta({ ok: false, erro: 'nao_encontrada' }, 404);
    return resposta({ ok: false, erro: 'indisponivel' }, 503); // corpo vazio/estranho = "não sei", não "não achou"
  } catch {
    return resposta({ ok: false, erro: 'indisponivel' }, 503);
  }
}

export async function handleWhatsappAprovar(request, env, dependencias = {}) {
  const fetchImpl = dependencias.fetchImpl || fetch;
  const agora = (dependencias.now || Date.now)();
  if (request.method !== 'POST') return resposta({ ok: false, erro: 'metodo_nao_suportado' }, 405);
  const config = configSupabase(env);
  if (!config) return resposta({ ok: false, erro: 'nao_configurado' }, 503);
  const auth = await autenticar(request, config, fetchImpl, agora, 'aprovacao_token');
  if (!auth.ok) return auth.resp;
  const lido = await lerJson(request, 2048);
  if (lido.erro) return lido.erro;
  const dados = lido.dados;
  try {
    const numero = await resolverNumero(config, fetchImpl, dados);
    if (!numero) return resposta({ ok: false, motivo: 'numero_inativo' }, 409);
    const r = await chamarRpcServico(config, fetchImpl, 'wa_aprovar_primeiro_contato', {
      p_phone_number_id: numero.phone_number_id,
      p_telefone: typeof dados.telefone === 'string' ? dados.telefone : '',
      p_por: typeof dados.por === 'string' ? dados.por : '',
    });
    log('whatsapp_aprovacao', { resultado: r?.ok === true ? 'aprovado' : 'recusado', motivo: r?.motivo ?? null });
    return resposta({ ok: r?.ok === true, motivo: r?.motivo }, r?.ok === true ? 200 : 400);
  } catch {
    return resposta({ ok: false, erro: 'indisponivel' }, 503);
  }
}

/** Despacho único para o index.js; devolve `null` se a rota não é do WhatsApp. */
export function rotearWhatsapp(request, env, dependencias = {}) {
  const { pathname } = new URL(request.url);
  if (pathname === '/whatsapp/webhook') return handleWhatsappWebhook(request, env, dependencias);
  if (pathname === '/whatsapp/enviar') return handleWhatsappEnviar(request, env, dependencias);
  if (pathname === '/whatsapp/fila' || pathname === '/whatsapp/fila/atualizar') return handleWhatsappFila(request, env, dependencias);
  if (pathname === '/whatsapp/aprovar') return handleWhatsappAprovar(request, env, dependencias);
  return null;
}
