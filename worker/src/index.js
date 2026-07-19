/**
 * OLLI — Worker de IA (Cloudflare) com Google Gemini.
 *
 * Endpoints (o app chama exatamente estes):
 *   POST /            → diagnóstico técnico (OLLI Técnica)
 *   POST /voz         → transcrição (texto) → itens de orçamento; ou conversa[]/historico[] → Tier B (pergunta/pronto)
 *   POST /voz/conversa → mesmo Tier B acima, rota dedicada (alias de /voz com conversa[])
 *   POST /transcrever → voz na nuvem: áudio → transcrição ou itens de orçamento
 *   POST /chat        → assistente conversacional
 *   GET  /            → health check
 *
 * Segurança:
 *   - GEMINI_API_KEY é SECRET do Worker (nunca vai pro app/APK; vai por header
 *     x-goog-api-key, nunca na query string, pra não vazar em log de proxy).
 *   - Exige JWT do Supabase (Authorization: Bearer <token>), validado em
 *     /auth/v1/user (com cache curto em memória do isolate).
 *   - CORS liberado (Access-Control-Allow-Origin: '*') — seguro aqui porque
 *     toda rota autenticada usa Bearer token, nunca cookie.
 *   - Toda rota de IA valida content-length (413 se exceder) e trunca/sanitiza
 *     cada campo antes de montar o prompt (proteção de custo + prompt injection).
 *
 * O diagnóstico (POST '/') é ATERRADO na base oficial HVAC (hvac_codigos +
 * hvac_chunks via full-text search no Supabase) antes de chamar o Gemini — ver
 * buscarBaseHvac/diagPrompt. `contextoBase` vindo do cliente é ignorado: era
 * um vetor de prompt injection e o aterramento agora é feito server-side.
 *
 * Sem a chave configurada → responde { ok:false, motivo:'ia_nao_configurada' }
 * e o app cai no fallback offline (base de 602 códigos). Nunca quebra.
 *
 * Também serve o LINK PÚBLICO do cliente (sem login):
 *   GET  /o/<token> → página do orçamento (aprovar/recusar/WhatsApp)
 *   POST /o/<token> → grava a resposta do cliente
 *
 * POST /voz também aceita um modo CONVERSA (Tier B, docs/ENXAME/OLLI_VOZ_CONVERSA.md):
 * corpo com `conversa: [{papel:'user'|'olli', texto}]` em vez de `transcript` →
 * a Olli pergunta de volta até ter cliente+item, então fecha com `pronto:true`
 * (ver handleVozConversa em ./voz.js). POST /voz/conversa é a mesma coisa numa
 * rota própria — o cliente pode usar qualquer uma das duas; ambas aceitam o
 * histórico como `conversa` OU `historico` (alias) e um `fechar:true` opcional
 * pra fechar sob pedido (não só no teto de turnos).
 */

import * as Sentry from '@sentry/cloudflare';
import { renderLinkPage, responderLink } from './link.js';
import { handleAdmin } from './admin.js';
import { handleStripe } from './stripe.js';
import { handleAbacate } from './abacate.js';
import { handleMercadoPago } from './mercadopago.js';
import { handleEquipe } from './equipe.js';
import { handleConta } from './conta.js';
import { renderEtiqueta, renderEtiquetaSvg } from './pmoc.js';
import { cabeNoTeto, checarLimite, deixaPassar } from './rateLimit.js';
import { handleEtaSaida } from './etaSaida.js';
import { handleCep, handleFeriados } from './brasil.js';
import { cobrarCreditoVoz } from './creditos.js';
import { gemini } from './gemini.js';
import { parseJsonBody, parseJsonLoose, cortar, tresEstados, empresaAtiva } from './util.js';
import { rotuloVertical, vozSystem, vozPrompt, VOZ_MAX, handleVoz, handleVozConversa } from './voz.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

// Limite de payload de entrada (bytes) para as rotas de IA autenticadas. Sem
// isto, request.json() aceita um body de MBs (transcript, mensagens[],
// contextoBase) que entra cru no prompt: custo direto de tokens Gemini e
// superfície de prompt injection. 64KB é folgado para qualquer uso legítimo
// (voz falada, chat, diagnóstico) e barato de validar antes do parse.
const MAX_BODY_BYTES = 65536;

// /transcrever recebe áudio em base64 (~33% maior que o binário original) —
// precisa de um teto bem maior que o das rotas de texto. 4MB cobre alguns
// minutos de fala num codec compacto (aac/ogg) com folga.
const MAX_AUDIO_BODY_BYTES = 4_194_304;

// /eta e /geocodificar recebem só coordenadas/endereço — corpo minúsculo por
// natureza. Mesmo teto (4KB) das outras rotas de payload pequeno (equipe.js, link.js).
const MAX_ETA_BODY_BYTES = 4096;

/**
 * Lê o corpo até `max` bytes e diz se passou do teto. NÃO confia em
 * content-length: uma requisição em Transfer-Encoding: chunked não traz esse
 * header (Number(null)=0) e escaparia do limite — mesma falha corrigida em
 * link.js/responderLink, replicada aqui para as rotas de custo (IA + Google).
 * Consome o body stream (só pode ser chamado 1x por request); quem chama
 * reaproveita `raw` para o parse — nunca lê a request de novo.
 *
 * Quem chama primeiro tenta `cabeNoTeto` (Content-Length) — corpo nem foi
 * lido, rejeita ANTES de bufferizar. Isto aqui é a segunda camada, obrigatória
 * porque chunked/sem header escapa da primeira (B1/O2-18, ver rateLimit.js).
 */
async function bodyMuitoGrande(request, max) {
  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return { grande: false, raw: '' };
  }
  return { grande: raw.length > max, raw };
}

// parseJsonBody/parseJsonLoose/cortar agora vivem em ./util.js (import no
// topo) — extraídos pra serem importáveis sem @sentry/cloudflare (ver o
// comentário desse arquivo).

// Cache em memória do worker (por isolate) da validação de token → user. Evita
// 1 round-trip a /auth/v1/user por CADA request de IA (chat manda 1 por
// mensagem). TTL curto: só reduz custo, nunca estende uma sessão revogada por
// mais que este intervalo.
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map(); // token -> { user, exp }

/** Valida o token do Supabase chamando /auth/v1/user. Retorna o user ou null. */
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const cached = userCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;

  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    const user = u && u.id ? u : null;
    if (user) {
      // Cache pequeno e saneado: evita crescimento sem limite no isolate.
      if (userCache.size > 500) userCache.clear();
      userCache.set(token, { user, exp: Date.now() + USER_CACHE_TTL_MS });
    }
    return user;
  } catch {
    return null;
  }
}

// gemini() agora vive em ./gemini.js (import no topo) — mesmo motivo do
// parseJsonBody/parseJsonLoose/cortar em ./util.js.

// Contrato de rotas de IA (POST autenticado + rate limit). É a ÚNICA fonte da
// verdade sobre quais paths POST caem na IA — o roteador (fetch) valida contra
// esta lista ANTES do rate limit. `'/'` também é o health check (GET, público);
// o método separa os dois usos: GET '/' = health sem auth, POST '/' = diagnóstico.
// Manter esta constante alinhada com os handlers no switch do fetch abaixo.
const IA_ROUTES = new Set(['/', '/voz', '/voz/conversa', '/chat', '/transcrever']);

// ─── DIAGNÓSTICO ─────────────────────────────────────────────
const DIAG_SYSTEM = `Você é a OLLI Técnica, especialista sênior em diagnóstico de ar-condicionado (split, multi-split, VRF) para técnicos de campo no Brasil.
REGRAS DE OURO (inquebráveis):
- Trabalhe com marca + modelo. Se faltarem, diga que precisa confirmar e reduza a confiança.
- NUNCA mande trocar/condenar uma peça (placa, compressor, sensor) sem antes eliminar alimentação, comunicação, sensor, cabo e mau contato com TESTES.
- Mostre o nível de confiança com honestidade (Alta / Média / Baixa).
- Fale direto, de técnico para técnico, em português do Brasil. Sem enrolação.
- Se houver "BASE OFICIAL HVAC" no caso, use-a PRIORITARIAMENTE sobre seu conhecimento geral; em "fontes" liste apenas os identificadores F1..Fn dos trechos realmente usados no seu raciocínio (nunca invente um identificador que não esteja listado).
Responda SOMENTE com JSON válido no formato pedido.`;

// Limites de sanitização de entrada do diagnóstico (defesa contra payload
// gigante/prompt injection — ver MAX_BODY_BYTES para o limite geral do body).
const DIAG_MAX = { marca: 80, codigo: 32, sintoma: 500, modelo: 80 };

// Remove os caracteres reservados do PostgREST (`,()*`) de um valor antes de
// usá-lo num filtro de query string, e então codifica para URL. Sem isto um
// valor do cliente poderia fechar o filtro `ilike.*valor*` e injetar outro
// parâmetro/operador PostgREST na query.
function sanitizarParaFiltro(v) {
  return encodeURIComponent(String(v || '').replace(/[,()*]/g, ''));
}

/** GET autenticado (service role) na REST do Supabase. [] em qualquer falha — nunca lança. */
async function supabaseRest(env, path, signal) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      signal,
    });
    if (!r.ok) return [];
    const j = await r.json().catch(() => []);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

/**
 * Aterramento HVAC: busca códigos exatos (hvac_codigos) e trechos de manuais
 * (hvac_chunks, full-text search) para injetar no prompt ANTES de chamar o
 * Gemini. Nunca lança — qualquer erro/timeout vira listas vazias e o
 * diagnóstico segue sem a base (fallback limpo, ver handleDiag).
 */
async function buscarBaseHvac(env, { marca, codigo, sintoma }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { codigos: [], chunks: [] };

  const m = sanitizarParaFiltro(marca);
  const c = sanitizarParaFiltro(codigo);
  const cols = 'marca,codigo,falha,causa,acao,severidade';

  async function lookupCodigos() {
    if (!c) return [];
    const filtroMarca = m ? `&marca=ilike.*${m}*` : '';
    // 1ª tentativa: código exato (normalizado). 2ª (só se vazio): código como
    // substring — cobre variações de digitação tipo 'E5' vs 'E-5' vs 'E 5'.
    const exato = await supabaseRest(
      env,
      `hvac_codigos?select=${cols}${filtroMarca}&codigo=ilike.${c}&limit=5`,
      abortSignal(4000),
    );
    if (exato.length) return exato;
    return supabaseRest(env, `hvac_codigos?select=${cols}${filtroMarca}&codigo=ilike.*${c}*&limit=5`, abortSignal(4000));
  }

  async function buscaChunks() {
    const termos = [marca, codigo, sintoma].filter(Boolean).join(' ').trim();
    if (!termos) return [];
    // Operador `wfts` (websearch_to_tsquery) na coluna tsvector `busca`: aceita
    // texto livre do usuário sem erro de sintaxe (diferente de `fts`/to_tsquery,
    // que quebra com aspas/operadores soltos). Sem RPC de ts_rank nesta v1 —
    // mitigado com limit=6 e, se vazio, um retry só com marca+código.
    const q = encodeURIComponent(termos);
    const r1 = await supabaseRest(
      env,
      `hvac_chunks?select=source_path,page,texto&busca=wfts(portuguese).${q}&limit=6`,
      abortSignal(4000),
    );
    if (r1.length) return r1;
    const termosCurtos = [marca, codigo].filter(Boolean).join(' ').trim();
    if (!termosCurtos || termosCurtos === termos) return [];
    return supabaseRest(
      env,
      `hvac_chunks?select=source_path,page,texto&busca=wfts(portuguese).${encodeURIComponent(termosCurtos)}&limit=6`,
      abortSignal(4000),
    );
  }

  const [codigosRes, chunksRes] = await Promise.allSettled([lookupCodigos(), buscaChunks()]);
  return {
    codigos: codigosRes.status === 'fulfilled' ? codigosRes.value : [],
    chunks: chunksRes.status === 'fulfilled' ? chunksRes.value : [],
  };
}

/**
 * AbortSignal com timeout — mesmo padrão do AbortController usado em gemini()
 * (setTimeout explícito em vez de AbortSignal.timeout, por compatibilidade
 * garantida com o runtime workerd).
 */
function abortSignal(ms) {
  // AbortSignal.timeout limpa o timer sozinho quando a operacao termina antes
  // do prazo (o setTimeout manual ficava pendurado ate disparar).
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // fallback: limpa o timer quando alguem consumir o abort (melhor esforco)
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller.signal;
}

function diagPrompt(input, base) {
  const codigos = (base && base.codigos) || [];
  const chunks = (base && base.chunks) || [];

  let blocoBase = '';
  if (codigos.length) {
    blocoBase += `\n\n### BASE OFICIAL HVAC — códigos\n${codigos
      .map((c) => `- [${c.marca || '?'}] ${c.codigo || '?'}: ${c.falha || ''} | causa: ${c.causa || ''} | ação: ${c.acao || ''} | severidade: ${c.severidade || ''}`)
      .join('\n')}`;
  }
  if (chunks.length) {
    blocoBase += `\n\n### TRECHOS DE MANUAIS\n${chunks
      .map((ch, i) => `[[F${i + 1}]] (fonte: ${ch.source_path || '?'}, pág. ${ch.page ?? '?'}) ${String(ch.texto || '').slice(0, 700)}`)
      .join('\n')}`;
  }

  return `Caso do técnico:
- marca: ${input.marca || '(não informada)'}
- modelo: ${input.modelo || '(não informado)'}
- código no display/LED: ${input.codigo || '(não informado)'}
- sintoma relatado: ${input.sintoma || '(não informado)'}${blocoBase}

Gere o diagnóstico no JSON EXATO (todas as chaves, em pt-BR):
{
  "resumo": "1 frase do que provavelmente é",
  "significadoProvavel": "o que esse código/sintoma costuma indicar nessa marca",
  "causasComuns": ["causa 1", "causa 2"],
  "testesEmOrdem": ["teste 1 (do mais rápido/barato ao mais caro)", "teste 2"],
  "pecasSuspeitas": ["peça só se os testes apontarem"],
  "naoFacaAinda": ["o que NÃO fazer antes de testar"],
  "nivelConfianca": "Alta | Média | Baixa",
  "confiancaJustificativa": "por que essa confiança",
  "mensagemCliente": "mensagem curta e clara para enviar ao cliente",
  "sugestaoOrcamento": "o que orçar (visita/diagnóstico/mão de obra/peça após teste)",
  "fontes": []
}`;
}

async function handleDiag(bodyText, env) {
  const raw = parseJsonBody(bodyText);
  // Sanitiza e trunca ANTES de qualquer uso — tanto no prompt quanto nos
  // filtros PostgREST. `contextoBase` do cliente é ignorado/depreciado: o
  // aterramento agora é feito server-side a partir da base oficial (o campo
  // era um vetor de prompt injection direto no prompt do Gemini).
  const input = {
    marca: cortar(raw && raw.marca, DIAG_MAX.marca),
    modelo: cortar(raw && raw.modelo, DIAG_MAX.modelo),
    codigo: cortar(raw && raw.codigo, DIAG_MAX.codigo).toUpperCase(),
    sintoma: cortar(raw && raw.sintoma, DIAG_MAX.sintoma),
  };

  const base = await buscarBaseHvac(env, input);
  const baseConsultada = base.codigos.length > 0 || base.chunks.length > 0;

  const text = await gemini(env, { system: DIAG_SYSTEM, user: diagPrompt(input, base), wantJson: true, temperature: 0.3 });
  const diag = parseJsonLoose(text);
  if (!diag || !diag.resumo) {
    console.error('[olli-diag] parse do Gemini falhou; texto recebido:', (text || '').slice(0, 300));
    return json({ ok: false, erro: 'resposta_invalida' });
  }

  // Citação confiável: as fontes NUNCA vêm do texto livre do modelo. Montamos
  // no servidor a partir dos chunks efetivamente enviados, filtrando pelos
  // Fn que o modelo de fato citou em "fontes" — se ele citar algo fora da
  // lista (ou inventar um Fn), é descartado.
  const citados = new Set(Array.isArray(diag.fontes) ? diag.fontes.map(String) : []);
  const fontesChunks = base.chunks
    .map((ch, i) => ({ tag: `F${i + 1}`, texto: `${ch.source_path || '?'} — pág. ${ch.page ?? '?'}` }))
    .filter((f) => citados.has(f.tag))
    .map((f) => f.texto);
  const fontesCodigos = base.codigos.length ? ['Base OLLI de códigos (hvac_codigos)'] : [];
  diag.fontes = [...fontesCodigos, ...fontesChunks];

  return json({ ok: true, diagnostico: diag, fonte: 'ia', modelo: env.GEMINI_MODEL || 'gemini-2.5-flash', baseConsultada });
}

// ─── ETA COM TRÂNSITO (Routes API) ───────────────────────────
// Recebe {origem:{lat,lng}, destino:{lat,lng}} e devolve os minutos com trânsito
// e a distância. A "chegada" é calculada no APP (fuso do aparelho), não aqui. A
// chave é secret do Worker (OLLI_ROUTES_API_KEY), restrita ao Routes API.
function coordOk(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}
async function handleEta(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, motivo: 'nao_autorizado' }, 401);
  if (!env.OLLI_ROUTES_API_KEY) return json({ ok: false, motivo: 'eta_nao_configurado' });

  // Teto de payload ANTES do parse — corpo minúsculo por natureza (2 coordenadas).
  const corpo = await bodyMuitoGrande(request, MAX_ETA_BODY_BYTES);
  if (corpo.grande) return json({ ok: false, erro: 'payload_grande' }, 413);

  // Rate limit por usuário ANTES do fetch pro Google: só a partir daqui a request
  // pode custar 1 chamada à Routes API (paga, sem isto ilimitada por conta). Mesmo
  // padrão do IA_RL, aplicado ANTES de gastar a chamada externa.
  if (env.ETA_RL) {
    try {
      const { success } = await env.ETA_RL.limit({ key: user.id });
      if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    } catch {
      // binding ausente: não bloqueia
    }
  }

  const raw = parseJsonBody(corpo.raw);
  const origem = raw && raw.origem;
  const destino = raw && raw.destino;
  if (!coordOk(origem) || !coordOk(destino)) {
    return json({ ok: false, erro: 'coordenadas_invalidas' }, 400);
  }
  try {
    const resp = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes?key=' + env.OLLI_ROUTES_API_KEY,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lng } } },
          destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          languageCode: 'pt-BR',
          units: 'METRIC',
        }),
      },
    );
    if (!resp.ok) return json({ ok: false, erro: 'rota_indisponivel' }, 502);
    const data = await resp.json().catch(() => ({}));
    const rota = data && Array.isArray(data.routes) ? data.routes[0] : null;
    if (!rota || !rota.duration) return json({ ok: false, erro: 'sem_rota' });
    const seg = parseInt(String(rota.duration).replace('s', ''), 10) || 0;
    const minutos = Math.max(1, Math.round(seg / 60));
    const distanciaKm = Number.isFinite(rota.distanceMeters)
      ? Math.round(rota.distanceMeters / 100) / 10
      : null;
    return json({ ok: true, minutos, distanciaKm, comTransito: true });
  } catch (e) {
    return json({ ok: false, erro: 'eta_falhou' });
  }
}

// Consulta de CNPJ (BrasilAPI) para o CADASTRO MÁGICO do Onboarding: o app manda
// só os 14 dígitos, o worker consulta a BrasilAPI (grátis, sem chave) e devolve a
// empresa NORMALIZADA (razão, fantasia, CNAE principal + secundários, endereço). A
// dedução CNAE→vertical é feita no CLIENTE (src/services/verticais.ts) — o worker é
// proxy fino. Autenticado + rate limit por usuário (a BrasilAPI é grátis mas tem
// fair-use; e evita usarem o worker pra raspar CNPJ). Cache de 30 dias em
// public.cnpj_cache (migration 20260721) — fallback Casa dos Dados fica de follow-up.
async function handleCnpj(cnpjBruto, request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, erro: 'nao_autorizado' }, 401);

  const cnpj = String(cnpjBruto || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return json({ ok: false, erro: 'cnpj_invalido' }, 400);

  // Rate limit por usuário (binding OPCIONAL — se não provisionado no wrangler,
  // não bloqueia; mesmo padrão gracioso do ETA_RL).
  if (env.CNPJ_RL) {
    try {
      const { success } = await env.CNPJ_RL.limit({ key: user.id });
      if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    } catch { /* binding ausente: não bloqueia */ }
  }

  // Cache de 30 dias: reconsulta do mesmo CNPJ não bate na BrasilAPI. Gracioso —
  // sem Supabase ou em erro, cai direto na consulta ao vivo (nunca bloqueia).
  const emCache = await lerCacheCnpj(env, cnpj);
  if (emCache) return json({ ok: true, empresa: emCache, cache: true });

  try {
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: 'application/json' },
    });
    if (resp.status === 404) return json({ ok: false, erro: 'cnpj_nao_encontrado' }, 404);
    if (!resp.ok) return json({ ok: false, erro: 'consulta_indisponivel' }, 502);
    const d = await resp.json().catch(() => null);
    if (!d || typeof d !== 'object') return json({ ok: false, erro: 'consulta_indisponivel' }, 502);

    const secundarios = Array.isArray(d.cnaes_secundarios)
      ? d.cnaes_secundarios
          .filter((c) => c && c.codigo)
          .map((c) => ({ codigo: String(c.codigo), descricao: String(c.descricao || '') }))
          .slice(0, 20)
      : [];

    const empresa = {
      cnpj,
      razaoSocial: String(d.razao_social || ''),
      nomeFantasia: String(d.nome_fantasia || ''),
      cnaePrincipal: { codigo: String(d.cnae_fiscal || ''), descricao: String(d.cnae_fiscal_descricao || '') },
      cnaesSecundarios: secundarios,
      logradouro: [d.descricao_tipo_de_logradouro, d.logradouro, d.numero].filter(Boolean).join(' ').trim(),
      bairro: String(d.bairro || ''),
      municipio: String(d.municipio || ''),
      uf: String(d.uf || ''),
      cep: String(d.cep || '').replace(/\D/g, ''),
      porte: String(d.porte || ''),
      // CAMPO LEGADO, mantido só por compatibilidade com src/services/cnpj.ts
      // (`mei: !!e?.mei`). Ele COLAPSA três estados em dois: a BrasilAPI devolve
      // `opcao_pelo_mei: null` quando não sabe (confirmado ao vivo em
      // 2026-07-18 num CNPJ real), e `!!null` vira `false` — "não sei" virando
      // "não é MEI", que é o bug da casa `olli-gate-erro-vira-vazio`. Quem for
      // decidir alguma coisa deve usar `meiEstado` abaixo, nunca este.
      mei: !!d.opcao_pelo_mei,
      // ─── Os três estados, honestos (usar ESTES) ───
      // Isto deixa de ser detalhe burocrático em 1º de setembro de 2026: pela
      // Resolução CGSN nº 189/2026, MEI/ME/EPP do Simples passam a emitir NFS-e
      // só pelo Emissor Nacional. Um app que "acha" que o cliente não é MEI
      // porque a API não respondeu manda o prestador pro caminho fiscal errado.
      meiEstado: tresEstados(d.opcao_pelo_mei),
      simplesEstado: tresEstados(d.opcao_pelo_simples),
      // Situação cadastral: cobrar e emitir nota para empresa BAIXADA é problema
      // do prestador, não da Receita. String vazia = a API não informou.
      situacaoCadastral: String(d.descricao_situacao_cadastral || ''),
      ativa: empresaAtiva(d),
    };
    void gravarCacheCnpj(env, cnpj, empresa); // best-effort, não bloqueia a resposta
    return json({ ok: true, empresa });
  } catch {
    return json({ ok: false, erro: 'consulta_falhou' }, 502);
  }
}

// `tresEstados` e `empresaAtiva` vivem em ./util.js (import no topo) — mesmo
// motivo do parseJsonBody: são a parte deste arquivo que MERECE teste unitário,
// e index.js não é importável pelo teste (carrega @sentry/cloudflare, que só
// existe em worker/node_modules).

// Versão do formato de `empresa` gravado em cnpj_cache. Existe porque o cache
// tem 30 dias de vida e acabou de ganhar campos (meiEstado/simplesEstado/
// situacaoCadastral/ativa): sem a versão, um CNPJ consultado ontem devolveria
// hoje um objeto SEM esses campos, e `undefined` viraria um quarto estado
// silencioso — exatamente o que os campos novos existem para impedir. Linha
// velha = tratada como stale, reconsultada uma vez (a BrasilAPI é grátis).
const CNPJ_CACHE_V = 2;

// Headers de service_role para o cache de CNPJ (mesmo padrão inline do resto do worker).
function cnpjCacheHeaders(env, extra) {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...(extra || {}) };
}

// Lê o cache (public.cnpj_cache): devolve os `dados` se houver linha com < 30 dias;
// senão null. Gracioso: sem Supabase/erro/stale → null → consulta ao vivo.
async function lerCacheCnpj(env, cnpj) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/cnpj_cache?cnpj=eq.${cnpj}&select=dados,atualizado_em&limit=1`, { headers: cnpjCacheHeaders(env) });
    if (!r.ok) return null;
    const arr = await r.json().catch(() => null);
    if (!Array.isArray(arr) || !arr.length) return null;
    const idade = Date.now() - new Date(arr[0].atualizado_em).getTime();
    if (!(idade >= 0) || idade > 30 * 24 * 3600 * 1000) return null; // > 30 dias = stale
    const dados = arr[0].dados;
    if (!dados || typeof dados !== 'object') return null;
    // Formato antigo (sem os campos de três estados) = stale, mesmo dentro dos
    // 30 dias. Servir o objeto velho encheria `meiEstado`/`ativa` de `undefined`
    // na tela, que é "não sei" disfarçado de campo inexistente.
    if (dados._v !== CNPJ_CACHE_V) return null;
    const { _v, ...empresa } = dados; // `_v` é controle do cache, não vai pro app
    return empresa;
  } catch {
    return null;
  }
}

// Grava/atualiza o cache (upsert por cnpj). Best-effort: falha não afeta a resposta.
async function gravarCacheCnpj(env, cnpj, empresa) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/cnpj_cache?on_conflict=cnpj`, {
      method: 'POST',
      headers: cnpjCacheHeaders(env, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ cnpj, dados: { ...empresa, _v: CNPJ_CACHE_V }, atualizado_em: new Date().toISOString() }),
    });
  } catch { /* best-effort */ }
}

// Geocodificação (endereço em texto → lat/lng). Serve o ETA: o `Agendamento`
// guarda só `endereco` (texto), e o /eta exige coordenadas. Mesma chave restrita
// do /eta (agora liberada p/ Routes + Geocoding), sempre server-side — o app
// manda o texto, nunca vê a chave. Enviesado ao Brasil (region=br) p/ desambiguar.
async function handleGeocode(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ ok: false, motivo: 'nao_autorizado' }, 401);
  if (!env.OLLI_ROUTES_API_KEY) return json({ ok: false, motivo: 'eta_nao_configurado' });

  // Teto de payload ANTES do parse — corpo minúsculo por natureza (1 endereço).
  const corpo = await bodyMuitoGrande(request, MAX_ETA_BODY_BYTES);
  if (corpo.grande) return json({ ok: false, erro: 'payload_grande' }, 413);

  // Rate limit por usuário ANTES do fetch pro Google: só a partir daqui a request
  // pode custar 1 chamada à Geocoding API (paga). Mesmo binding do /eta — as duas
  // rotas alimentam o mesmo fluxo (endereço → coordenada → rota).
  if (env.ETA_RL) {
    try {
      const { success } = await env.ETA_RL.limit({ key: user.id });
      if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
    } catch {
      // binding ausente: não bloqueia
    }
  }

  const raw = parseJsonBody(corpo.raw);
  const endereco = raw && typeof raw.endereco === 'string' ? raw.endereco.trim() : '';
  if (endereco.length < 3) return json({ ok: false, erro: 'endereco_invalido' }, 400);
  try {
    const alvo = 'https://maps.googleapis.com/maps/api/geocode/json?address='
      + encodeURIComponent(endereco)
      + '&region=br&language=pt-BR&key=' + env.OLLI_ROUTES_API_KEY;
    const resp = await fetch(alvo);
    if (!resp.ok) return json({ ok: false, erro: 'geocode_indisponivel' }, 502);
    const data = await resp.json().catch(() => ({}));
    const r0 = data && data.status === 'OK' && Array.isArray(data.results) ? data.results[0] : null;
    const loc = r0 && r0.geometry && r0.geometry.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      return json({ ok: false, erro: 'nao_encontrado' });
    }
    return json({ ok: true, lat: loc.lat, lng: loc.lng, formatado: r0.formatted_address || null });
  } catch (e) {
    return json({ ok: false, erro: 'geocode_falhou' });
  }
}

// ─── VOZ → ITENS ─────────────────────────────────────────────
// rotuloVertical/vozSystem/vozPrompt/VOZ_MAX/handleVoz agora vivem em ./voz.js
// (import no topo) — junto do modo CONVERSA novo (handleVozConversa), mesmo
// motivo de extração do gemini()/util.js: testável sem @sentry/cloudflare.

// ─── TRANSCREVER (voz na nuvem) ─────────────────────────────
// Recebe o áudio gravado no app (base64) e ou (a) só transcreve, ou (b) já
// devolve os itens de orçamento — superset do /voz acima, mas partindo de
// áudio em vez de transcript pronto (o app manda o áudio direto, sem depender
// de reconhecimento de voz local no aparelho).

// Whitelist de mime types aceitos pelo Gemini para áudio inline (ver
// generateContent /docs/audio): fora daqui a API rejeita ou o custo de teste
// não vale a pena. Mantido enxuto — cobre os formatos reais de gravação do
// app (expo-audio produz aac/mp4 no Android/iOS; ogg/wav/mpeg por robustez).
const TRANSCREVER_MIME_OK = new Set(['audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg', 'audio/mpeg']);

// Só caracteres válidos de base64 — barato de checar antes de gastar CPU/rede
// tentando decodificar ou mandar pro Gemini algo que não é áudio de verdade.
const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

const TRANSCREVER_SYSTEM = 'Você transcreve áudio em português do Brasil com fidelidade. Responda SOMENTE com JSON válido.';

function transcreverPromptSimples() {
  return 'Transcreva fielmente o áudio em português do Brasil. Responda SOMENTE com JSON {"texto":"..."}';
}

export async function handleTranscrever(bodyText, env, user) {
  const raw = parseJsonBody(bodyText);
  const confirmarCredito = raw && raw.confirmarCredito === true;
  const creditoRef = raw && raw.creditoRef;

  const audioBase64 = typeof (raw && raw.audioBase64) === 'string' ? raw.audioBase64.trim() : '';
  if (!audioBase64 || !BASE64_RE.test(audioBase64)) return json({ ok: false, erro: 'sem_audio' });

  const mimeType = typeof (raw && raw.mimeType) === 'string' ? raw.mimeType.trim().toLowerCase() : '';
  if (!TRANSCREVER_MIME_OK.has(mimeType)) return json({ ok: false, erro: 'mime_invalido' });

  const modo = raw && raw.modo === 'orcamento' ? 'orcamento' : 'transcrever';
  const vertical = typeof (raw && raw.vertical) === 'string' ? raw.vertical : undefined;

  const catalogo = Array.isArray(raw && raw.catalogo)
    ? raw.catalogo.slice(0, VOZ_MAX.catalogoItens).map((c) => ({
        nome: cortar(c && c.nome, VOZ_MAX.nome),
        preco: c && typeof c.preco === 'number' ? c.preco : undefined,
      }))
    : undefined;

  const audioPart = { inline_data: { mime_type: mimeType, data: audioBase64 } };

  if (modo === 'transcrever') {
    const text = await gemini(env, {
      system: TRANSCREVER_SYSTEM,
      userParts: [audioPart, { text: transcreverPromptSimples() }],
      wantJson: true,
      temperature: 0.3,
      timeoutMs: 45_000,
    });
    const parsed = parseJsonLoose(text);
    if (!parsed || typeof parsed.texto !== 'string') {
      console.error('[olli-transcrever] parse do Gemini falhou; texto recebido:', (text || '').slice(0, 300));
      return json({ ok: false, erro: 'resposta_invalida' });
    }
    return json({ ok: true, texto: parsed.texto });
  }

  // modo 'orcamento': mesmo prompt do /voz, trocando a linha da fala pelo
  // aviso de que o áudio está anexado, e exigindo a transcrição de volta no
  // campo "texto" (o app precisa exibir o que foi entendido).
  const prompt = vozPrompt(undefined, catalogo, {
    linhaFala: 'A fala do técnico está no ÁUDIO em anexo.',
    exigirTexto: true,
  });
  const text = await gemini(env, {
    system: vozSystem(vertical),
    userParts: [audioPart, { text: prompt }],
    wantJson: true,
    temperature: 0.3,
    timeoutMs: 45_000,
  });
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed.texto !== 'string' || !Array.isArray(parsed.itens)) {
    console.error('[olli-transcrever] parse do Gemini falhou; texto recebido:', (text || '').slice(0, 300));
    return json({ ok: false, erro: 'resposta_invalida' });
  }

  // Cobrança só no modo 'orcamento' (produz o resultado de fato faturável); o
  // modo 'transcrever' acima é só transcrição e nunca passa por aqui.
  // `conteudo` combina mimeType+áudio: o fallback de idempotência (sem
  // `creditoRef`, que o app hoje não manda) quando um retry reenvia o MESMO
  // áudio — ver o doc de cobrarCreditoVoz em creditos.js.
  const cobranca = await cobrarCreditoVoz(env, user, {
    confirmarCredito,
    creditoRef,
    conteudo: `${mimeType}|${audioBase64}`,
  });
  if (cobranca.bloqueado) return json({ ok: false, erro: 'sem_creditos' });

  return json({
    ok: true,
    texto: parsed.texto,
    titulo: typeof parsed.titulo === 'string' ? parsed.titulo : undefined,
    clienteNome: typeof parsed.clienteNome === 'string' ? parsed.clienteNome : undefined,
    itens: parsed.itens,
    observacao: typeof parsed.observacao === 'string' ? parsed.observacao : undefined,
  });
}

// ─── CHAT ────────────────────────────────────────────────────
// Parametrizado por vertical (rotuloVertical, definido junto do vozSystem acima).
// Default = ar-condicionado → cliente antigo sem `vertical` mantém o comportamento atual.
function chatSystem(vertical) {
  return `Você é a OLLI, assistente do prestador de serviços de ${rotuloVertical(vertical)} no Brasil. Ajuda com diagnóstico técnico, preços e orçamentos, atendimento ao cliente e organização do dia. Seja prática, direta e em português do Brasil. Respostas curtas e úteis. Quando faltar dado técnico, peça marca e modelo. Nunca mande trocar peça sem teste.`;
}

// Limites de sanitização do chat: máx. de mensagens por request e tamanho por
// mensagem — sem isto um histórico gigante (dentro dos 20/min da IA_RL) teria
// custo Gemini ilimitado por request.
const CHAT_MAX = { mensagens: 40, texto: 4000 };

async function handleChat(bodyText, env) {
  const { mensagens, vertical } = parseJsonBody(bodyText);
  if (!Array.isArray(mensagens) || mensagens.length === 0) return json({ ok: false, erro: 'sem_mensagens' });
  const contents = mensagens
    .slice(-CHAT_MAX.mensagens)
    .filter((m) => m && typeof m.texto === 'string' && m.texto.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: cortar(m.texto, CHAT_MAX.texto) }] }));
  if (!contents.length) return json({ ok: false, erro: 'sem_mensagens' });
  const text = await gemini(env, { system: chatSystem(vertical), user: contents, temperature: 0.6 });
  if (!text) return json({ ok: false, erro: 'resposta_vazia' });
  return json({ ok: true, resposta: text });
}

const handler = {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);

    // ── PAINEL ADMIN (web + API protegida por super-admin) ──
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return handleAdmin(request, env, url);
    }

    // ── PAGAMENTOS STRIPE (checkout/webhook/portal + páginas) ──
    // Antes do gate da IA: estas rotas não dependem de GEMINI_API_KEY nem do
    // rate limit de IA. O webhook não tem JWT (autentica por assinatura HMAC);
    // checkout/portal validam o JWT do Supabase por conta própria. O próprio
    // handleStripe cuida do método e de OPTIONS/CORS por rota.
    if (url.pathname.startsWith('/stripe/')) {
      return handleStripe(request, env, url);
    }

    // ── PAGAMENTOS PIX ABACATEPAY (créditos por Pix) ──
    // Mesmo perfil do Stripe: fora do gate da IA; o webhook autentica por
    // secret(query)+HMAC, as demais rotas validam o JWT do Supabase por conta
    // própria. handleAbacate cuida do método e de OPTIONS/CORS por rota.
    if (url.pathname.startsWith('/abacate/')) {
      return handleAbacate(request, env, url);
    }

    // ── PAGAMENTOS MERCADO PAGO (gateway único: créditos Pix + planos) ──
    // Mesmo perfil: fora do gate da IA; o webhook autentica por x-signature
    // (HMAC) e confirma o pagamento via GET, as demais rotas validam o JWT.
    if (url.pathname.startsWith('/mp/')) {
      return handleMercadoPago(request, env, url);
    }

    // ── EQUIPE (multi-tenant): convite (POST JWT) + página do convite (GET) ──
    // Antes do gate da IA: a página do convite é pública (GET, sem login) e o
    // POST /equipe/convite valida o JWT por conta própria. O próprio handleEquipe
    // cuida do método e de OPTIONS/CORS por rota.
    if (url.pathname.startsWith('/equipe/')) {
      return handleEquipe(request, env, url);
    }

    // ── CONTA DO USUÁRIO (excluir conta: POST JWT) ──
    // Antes do gate da IA: /conta/* não depende de GEMINI_API_KEY nem do rate
    // limit de IA. O handleConta valida o JWT por conta própria e cuida do
    // método e de OPTIONS/CORS por rota. Sem isto, POST /conta/excluir cairia
    // no 404 do gate de IA (rota não listada em IA_ROUTES).
    if (url.pathname.startsWith('/conta/')) {
      return handleConta(request, env, url);
    }

    // ── LINK PÚBLICO DO CLIENTE (sem login, antes do gate da IA) ──
    if (url.pathname.startsWith('/o/')) {
      const token = decodeURIComponent(url.pathname.slice(3));
      if (request.method === 'GET') {
        // O GET é caminho de ESCRITA service-role (trilha 'visualizado':
        // SELECT + INSERT + PATCH). Sem teto, um loop de GET com token válido
        // amplifica queries service-role. Mesmo rate limit por IP do POST
        // (fallback 'sem-ip' + try/catch se o binding faltar → degrada seguro).
        if (env.LINK_RL) {
          const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
          try {
            const { success } = await env.LINK_RL.limit({ key: ip });
            if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
          } catch {
            // binding ausente: não bloqueia
          }
        }
        return renderLinkPage(token, env, request);
      }
      if (request.method === 'POST') return responderLink(token, request, env);
      return new Response('Método não suportado', {
        status: 405,
        headers: { Allow: 'GET, POST', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // ── ETIQUETA PÚBLICA DO EQUIPAMENTO (PMOC, sem login, antes do gate da IA) ──
    // GET /q/<token>      → página pública mínima da etiqueta física (dados
    //                       não-sensíveis + contato do prestador).
    // GET /q/<token>.svg  → o QR code (do próprio link) como imagem SVG.
    // Só GET: a etiqueta é somente leitura pública. O handler em pmoc.js resolve o
    // asset por qr_token via service_role, nega token inválido/revogado sem vazar,
    // e SEMPRE registra o scan em qr_scan_events (best-effort). CSP/escape lá dentro.
    if (url.pathname.startsWith('/q/')) {
      if (request.method !== 'GET') {
        return new Response('Método não suportado', {
          status: 405,
          headers: { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
      const resto = decodeURIComponent(url.pathname.slice(3));
      // Sub-rota da imagem: /q/<token>.svg. É pura função do texto (não toca o
      // banco nem escreve scan) → dispensa rate-limit e pode ser cacheada.
      if (resto.endsWith('.svg')) {
        return renderEtiquetaSvg(resto.slice(0, -4));
      }
      // Página HTML: escreve (SELECT service-role + INSERT de scan). Mesmo teto por
      // IP do /o/ (LINK_RL); reforço anti-enumeração fica dentro de renderEtiqueta.
      if (env.LINK_RL) {
        const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
        try {
          const { success } = await env.LINK_RL.limit({ key: ip });
          if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
        } catch {
          // binding ausente: não bloqueia
        }
      }
      return renderEtiqueta(resto, env, request);
    }

    // ETA com trânsito (Routes API). Não é rota de IA — não exige Gemini, mas
    // exige login (protege a chave/cota). A chave vive só aqui (secret), nunca no
    // app. Barato por design: o app chama só a próxima parada, com cache.
    // Cadastro mágico por CNPJ — GET /cnpj/<14 dígitos>, autenticado (ver handleCnpj).
    if (url.pathname.startsWith('/cnpj/') && request.method === 'GET') {
      return handleCnpj(url.pathname.slice('/cnpj/'.length), request, env);
    }

    // Endereço a partir do CEP — GET /cep/<8 dígitos>, autenticado (ver brasil.js).
    // Sai do aparelho e vem pro worker por UM motivo: o `src/services/cep.ts`
    // atual devolve null tanto para "CEP não existe" quanto para "ViaCEP fora do
    // ar", e essas duas coisas pedem ações opostas do prestador. Aqui são dois
    // estados distintos, e `nao_encontrado` só sai com confirmação do ViaCEP —
    // o 404 da BrasilAPI é ambíguo por contrato (docblock de brasil.js).
    if (url.pathname.startsWith('/cep/') && request.method === 'GET') {
      return handleCep(request, env, url.pathname.slice('/cep/'.length));
    }

    // Feriados nacionais do ano — GET /feriados/<ano>, autenticado e SEM REDE.
    // Calculado aqui (datas fixas em lei + deslocamento da Páscoa), não é proxy:
    // agenda de campo não pode depender de sinal pra saber que 7 de setembro é
    // feriado. Também corrige o que a BrasilAPI erra pro nosso uso — Carnaval e
    // Corpus Christi são ponto FACULTATIVO, não feriado nacional.
    if (url.pathname.startsWith('/feriados/') && request.method === 'GET') {
      return handleFeriados(request, env, url.pathname.slice('/feriados/'.length));
    }

    if (url.pathname === '/eta' && request.method === 'POST') {
      return handleEta(request, env);
    }

    // "A que horas eu preciso SAIR pra chegar às 15h" (docs/ENXAME/IDEIA_ETA_TRANSITO.md).
    // Irmã do /eta acima, com duas diferenças que importam: manda `departureTime`
    // (trânsito PREVISTO para a hora da saída — sem isso o cálculo da manhã usa o
    // trânsito da manhã pra uma visita da tarde, e erra calado) e aceita endereço
    // em TEXTO, com a origem vindo do cadastro em vez do GPS. Mesma chave secret,
    // mesmo binding ETA_RL — mas fail-closed, porque cada chamada gasta dinheiro
    // na Google. Ver o docblock de etaSaida.js.
    if (url.pathname === '/eta/saida' && request.method === 'POST') {
      return handleEtaSaida(request, env);
    }

    // Geocodificação (endereço → coordenada) — alimenta o /eta. Mesma proteção:
    // exige login, chave server-side. O app cacheia por endereço p/ segurar cota.
    if (url.pathname === '/geocodificar' && request.method === 'POST') {
      return handleGeocode(request, env);
    }

    // Health check público (abrir no navegador mostra que está online). GET '/'
    // NUNCA exige auth; só o POST '/' (diagnóstico) passa pelo gate de IA abaixo.
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'olli-diagnostico', ia: env.GEMINI_API_KEY ? 'on' : 'off' });
    }
    if (request.method !== 'POST') return json({ ok: false, erro: 'metodo_nao_suportado' }, 405);

    // RATE-LIMIT POR IP em /transcrever (B1/O2-18). Áudio é o maior corpo aceito
    // (até 4MB) e o de maior custo (Gemini) por requisição — o teto de payload
    // abaixo barra UM pedido gigante, mas não barra MUITOS pedidos médios vindos
    // da MESMA origem em contas diferentes (o IA_RL logo abaixo é por usuário e
    // não pega isso). Checado ANTES de ler o corpo, de propósito: sem isto, um IP
    // abusivo ainda forçaria N bufferizações de até 4MB antes de qualquer outra
    // barreira. Não é rota de dinheiro/convite (não é fail-closed, ver O2-18):
    // se o binding sumir, segue — mesma política de IA_RL/LINK_RL logo abaixo.
    if (url.pathname === '/transcrever') {
      const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
      const estadoIp = await checarLimite(env.TRANSCREVER_RL, ip);
      if (!deixaPassar(estadoIp, { sensivel: false })) {
        return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
      }
    }

    // Rejeita payload grande ANTES de auth/rate-limit/parse. Limite depende da
    // rota: /transcrever aceita áudio em base64 (bem maior). Duas camadas
    // (B1/O2-18): `cabeNoTeto` rejeita pelo Content-Length SEM ler nada (rápido,
    // mas confia num header que quem chama controla); `bodyMuitoGrande` confere o
    // tamanho REAL depois — não confia em content-length, porque chunked não traz
    // esse header (Number(null)=0) e escaparia da 1ª camada sozinha. Evita gastar
    // 1 validação de token ou 1 dos 20 tokens/min do usuário com um body que nem
    // vamos processar.
    const maxBodyIa = url.pathname === '/transcrever' ? MAX_AUDIO_BODY_BYTES : MAX_BODY_BYTES;
    if (!cabeNoTeto(request, maxBodyIa).ok) return json({ ok: false, erro: 'payload_grande' }, 413);
    const corpoIa = await bodyMuitoGrande(request, maxBodyIa);
    if (corpoIa.grande) return json({ ok: false, erro: 'payload_grande' }, 413);

    // Sem chave → o app cai no fallback offline (não é erro fatal).
    if (!env.GEMINI_API_KEY) return json({ ok: false, motivo: 'ia_nao_configurada' });

    // Exige login (protege a cota da IA).
    const user = await getUser(request, env);
    if (!user) return json({ ok: false, motivo: 'nao_autorizado' }, 401);

    // Rota de IA válida? 404 ANTES do rate limit — uma rota inexistente não deve
    // consumir 1 dos 20 tokens/min do usuário (o limite é só para chamadas de IA).
    // Usa o contrato único IA_ROUTES para não divergir do switch de handlers.
    if (!IA_ROUTES.has(url.pathname)) {
      return json({ ok: false, erro: 'nao_encontrado' }, 404);
    }

    // Rate limit por usuário: protege a cota paga da Gemini contra abuso (qualquer
    // conta grátis poderia, sem isto, disparar chamadas ilimitadas). 20/min/usuário.
    if (env.IA_RL) {
      try {
        const { success } = await env.IA_RL.limit({ key: user.id });
        if (!success) return json({ ok: false, erro: 'muitas_requisicoes' }, 429);
      } catch {
        // binding ausente em algum ambiente: não bloqueia o fluxo
      }
    }

    try {
      if (url.pathname === '/') return await handleDiag(corpoIa.raw, env);
      if (url.pathname === '/voz') {
        // Modo CONVERSA (Tier B): corpo com `conversa`/`historico` (array de
        // {papel,texto}) em vez de `transcript` — mesmo path/rate-limit/teto
        // de payload de sempre, só troca o handler. Ver o comentário no topo
        // do arquivo.
        const peek = parseJsonBody(corpoIa.raw);
        return Array.isArray(peek.conversa) || Array.isArray(peek.historico)
          ? await handleVozConversa(corpoIa.raw, env, user)
          : await handleVoz(corpoIa.raw, env, user);
      }
      // Rota dedicada do modo CONVERSA (alias de `/voz` + conversa[]/historico[]
      // acima) — mesmo handler, só pra quem prefere um path próprio.
      if (url.pathname === '/voz/conversa') return await handleVozConversa(corpoIa.raw, env, user);
      if (url.pathname === '/transcrever') return await handleTranscrever(corpoIa.raw, env, user);
      if (url.pathname === '/chat') return await handleChat(corpoIa.raw, env);
      return json({ ok: false, erro: 'nao_encontrado' }, 404);
    } catch (e) {
      const overloaded = !!(e && e.overloaded);
      if (!overloaded) console.error('[olli-worker] falha_ia:', e && (e.message || e));
      return json({ ok: false, erro: overloaded ? 'sobrecarregado' : 'falha_ia' }, overloaded ? 503 : 502);
    }
  },
};

/**
 * Sentry — crash reporting do worker.
 *
 * withSentry envolve o handler inteiro: pega exceção não tratada em QUALQUER
 * rota (IA, Stripe, Mercado Pago, admin, link público) sem tocar no código
 * delas. Os try/catch existentes continuam mandando — o Sentry só vê o que
 * escapa deles, que é justamente o que hoje some sem deixar rastro.
 *
 * Exige "compatibility_flags": ["nodejs_compat"] no wrangler.jsonc
 * (AsyncLocalStorage). Sem a flag, o deploy passa e o worker quebra em runtime.
 *
 * A DSN é pública por natureza e está fixa de propósito: em env/secret, uma
 * variável faltando desligaria o monitoramento em silêncio — o padrão
 * "erro vira vazio". E secret a mais é secret a mais pra um push apagar.
 *
 * dataCollection.httpBodies: [] — NUNCA enviar corpo de requisição. Aqui passa
 * webhook de pagamento e prompt de cliente: corpo é dado pessoal (LGPD) e
 * assinatura HMAC. Só metadado vai.
 */
export default Sentry.withSentry(
  () => ({
    dsn: 'https://b015159326e49e2534d36452c334611f@o4511745793327104.ingest.us.sentry.io/4511745841889280',
    environment: 'production',
    sendDefaultPii: false,
    dataCollection: { httpBodies: [] },
    // Plano grátis = 5k eventos/mês. Erro vai 100%; trace é amostrado.
    tracesSampleRate: 0.1,
  }),
  handler,
);
