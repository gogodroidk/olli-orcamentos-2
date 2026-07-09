/**
 * OLLI — Worker de IA (Cloudflare) com Google Gemini.
 *
 * Endpoints (o app chama exatamente estes):
 *   POST /            → diagnóstico técnico (OLLI Técnica)
 *   POST /voz         → transcrição (texto) → itens de orçamento
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
 */

import { renderLinkPage, responderLink } from './link.js';
import { handleAdmin } from './admin.js';
import { handleStripe } from './stripe.js';
import { handleEquipe } from './equipe.js';
import { handleConta } from './conta.js';
import { renderEtiqueta, renderEtiquetaSvg } from './pmoc.js';

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

/** true se o body excede o limite da rota (checa content-length; nunca lê o stream). */
function bodyMuitoGrande(request, pathname) {
  const max = pathname === '/transcrever' ? MAX_AUDIO_BODY_BYTES : MAX_BODY_BYTES;
  const len = Number(request.headers.get('content-length') || 0);
  return len > max;
}

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

/**
 * Chama o Gemini. `user` pode ser string (1 turno) ou array de `contents` (chat).
 * `userParts`, se vier, tem prioridade sobre `user`: array de parts cru (ex.:
 * texto + inline_data de áudio) montado como um único turno `{role:'user'}` —
 * usado por /transcrever para anexar o áudio junto do prompt de texto.
 * `timeoutMs` permite alongar o prazo para chamadas mais pesadas (ex.: áudio).
 */
async function gemini(env, { system, user, userParts, wantJson = false, temperature = 0.4, timeoutMs = 25_000 }) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  // A key vai em header (x-goog-api-key), NUNCA na query string: URLs de
  // request costumam ser logadas por proxies/CDNs no caminho — na query a
  // chave vazaria nesses logs. O endpoint aceita a key por header (suportado
  // pela API do Gemini) exatamente para evitar isso.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: Array.isArray(userParts)
      ? [{ role: 'user', parts: userParts }]
      : Array.isArray(user)
        ? user
        : [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      ...(wantJson ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  // AbortController: sem timeout, uma chamada presa ao Gemini segura o worker
  // até o limite da própria plataforma (CPU/wall time), degradando todo mundo
  // atrás na fila. 25s é generoso para geração de JSON curto (mais para áudio,
  // via timeoutMs) e ainda cabe dentro do limite de request do Workers.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    const err = new Error(timedOut ? 'timeout' : 'falha_rede');
    err.overloaded = timedOut; // trata timeout como sobrecarga (503, não 502): retry faz sentido
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const overloaded = r.status === 429 || r.status === 503 || /overload|quota|exhausted|rate|unavailable/i.test(txt);
    const err = new Error(overloaded ? 'sobrecarregado' : `gemini_${r.status}`);
    err.overloaded = overloaded;
    throw err;
  }
  const data = await r.json();
  return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

// Contrato de rotas de IA (POST autenticado + rate limit). É a ÚNICA fonte da
// verdade sobre quais paths POST caem na IA — o roteador (fetch) valida contra
// esta lista ANTES do rate limit. `'/'` também é o health check (GET, público);
// o método separa os dois usos: GET '/' = health sem auth, POST '/' = diagnóstico.
// Manter esta constante alinhada com os handlers no switch do fetch abaixo.
const IA_ROUTES = new Set(['/', '/voz', '/chat', '/transcrever']);

/** Parser de JSON tolerante (remove cercas ```json e lixo em volta). */
function parseJsonLoose(s) {
  if (!s) return null;
  const cleaned = s.replace(/```json\s*|\s*```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {} }
  return null;
}

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

function cortar(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

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

async function handleDiag(request, env) {
  const raw = await request.json().catch(() => ({}));
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

// ─── VOZ → ITENS ─────────────────────────────────────────────
const VOZ_SYSTEM = `Você é a OLLI, assistente de um prestador de serviços (ar-condicionado e afins) no Brasil. O técnico fala em voz alta o que vai fazer e você transforma isso em itens de orçamento. Use o catálogo quando o item casar. Responda SOMENTE com JSON válido em pt-BR.`;

// `linhaFala` permite trocar a 1ª linha do prompt: por padrão cita o
// transcript em texto (rota /voz); /transcrever (modo orcamento) passa o
// áudio como anexo em vez de transcript, então usa uma linha própria e exige
// o campo extra "texto" (a transcrição) no JSON de saída.
function vozPrompt(transcript, catalogo, { linhaFala, exigirTexto = false } = {}) {
  const cat = Array.isArray(catalogo) && catalogo.length
    ? `\nCatálogo do prestador (use o preço quando o item casar):\n${catalogo.map((c) => `- ${c.nome}${c.preco ? ` = R$ ${c.preco}` : ''}`).join('\n')}`
    : '';
  const fala = linhaFala || `Fala do técnico: "${transcript}"`;
  const campoTexto = exigirTexto ? '\n  "texto": "transcrição fiel da fala do técnico em português do Brasil",' : '';
  return `${fala}${cat}

Monte os itens no JSON EXATO:
{${campoTexto}
  "titulo": "título curto do serviço (opcional)",
  "clienteNome": "nome do cliente, se ele falou (opcional)",
  "itens": [
    { "descricao": "descrição do item", "quantidade": 1, "valorUnitario": 0, "tipo": "servico" }
  ],
  "observacao": "observação opcional"
}
Regras: "tipo" é "servico" ou "peca". Se não der pra estimar o preço, use null em "valorUnitario". Quantidade é número.`;
}

// Limites de sanitização da rota /voz: sem isto, um transcript ou catálogo
// gigante (dentro dos 20 req/min da IA_RL) queima cota do Gemini e vira vetor
// de prompt injection direto no prompt.
const VOZ_MAX = { transcript: 4000, catalogoItens: 100, nome: 120 };

async function handleVoz(request, env) {
  const { transcript: rawTranscript, catalogo: rawCatalogo } = await request.json().catch(() => ({}));
  const transcript = cortar(rawTranscript, VOZ_MAX.transcript);
  if (!transcript) return json({ ok: false, erro: 'sem_transcript' });
  const catalogo = Array.isArray(rawCatalogo)
    ? rawCatalogo.slice(0, VOZ_MAX.catalogoItens).map((c) => ({
        nome: cortar(c && c.nome, VOZ_MAX.nome),
        preco: c && typeof c.preco === 'number' ? c.preco : undefined,
      }))
    : undefined;
  const text = await gemini(env, { system: VOZ_SYSTEM, user: vozPrompt(transcript, catalogo), wantJson: true, temperature: 0.3 });
  const parsed = parseJsonLoose(text);
  if (!parsed || !Array.isArray(parsed.itens)) {
    console.error('[olli-voz] parse do Gemini falhou; texto recebido:', (text || '').slice(0, 300));
    return json({ ok: false, erro: 'resposta_invalida' });
  }
  return json({
    ok: true,
    titulo: typeof parsed.titulo === 'string' ? parsed.titulo : undefined,
    clienteNome: typeof parsed.clienteNome === 'string' ? parsed.clienteNome : undefined,
    itens: parsed.itens,
    observacao: typeof parsed.observacao === 'string' ? parsed.observacao : undefined,
  });
}

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

async function handleTranscrever(request, env) {
  const raw = await request.json().catch(() => ({}));

  const audioBase64 = typeof (raw && raw.audioBase64) === 'string' ? raw.audioBase64.trim() : '';
  if (!audioBase64 || !BASE64_RE.test(audioBase64)) return json({ ok: false, erro: 'sem_audio' });

  const mimeType = typeof (raw && raw.mimeType) === 'string' ? raw.mimeType.trim().toLowerCase() : '';
  if (!TRANSCREVER_MIME_OK.has(mimeType)) return json({ ok: false, erro: 'mime_invalido' });

  const modo = raw && raw.modo === 'orcamento' ? 'orcamento' : 'transcrever';

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
    system: VOZ_SYSTEM,
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
const CHAT_SYSTEM = `Você é a OLLI, assistente do prestador de serviços (foco em ar-condicionado) no Brasil. Ajuda com diagnóstico técnico, preços e orçamentos, atendimento ao cliente e organização do dia. Seja prática, direta e em português do Brasil. Respostas curtas e úteis. Quando faltar dado técnico, peça marca e modelo. Nunca mande trocar peça sem teste.`;

// Limites de sanitização do chat: máx. de mensagens por request e tamanho por
// mensagem — sem isto um histórico gigante (dentro dos 20/min da IA_RL) teria
// custo Gemini ilimitado por request.
const CHAT_MAX = { mensagens: 40, texto: 4000 };

async function handleChat(request, env) {
  const { mensagens } = await request.json().catch(() => ({}));
  if (!Array.isArray(mensagens) || mensagens.length === 0) return json({ ok: false, erro: 'sem_mensagens' });
  const contents = mensagens
    .slice(-CHAT_MAX.mensagens)
    .filter((m) => m && typeof m.texto === 'string' && m.texto.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: cortar(m.texto, CHAT_MAX.texto) }] }));
  if (!contents.length) return json({ ok: false, erro: 'sem_mensagens' });
  const text = await gemini(env, { system: CHAT_SYSTEM, user: contents, temperature: 0.6 });
  if (!text) return json({ ok: false, erro: 'resposta_vazia' });
  return json({ ok: true, resposta: text });
}

export default {
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

    // Health check público (abrir no navegador mostra que está online). GET '/'
    // NUNCA exige auth; só o POST '/' (diagnóstico) passa pelo gate de IA abaixo.
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'olli-diagnostico', ia: env.GEMINI_API_KEY ? 'on' : 'off' });
    }
    if (request.method !== 'POST') return json({ ok: false, erro: 'metodo_nao_suportado' }, 405);

    // Rejeita payload grande ANTES de tocar auth/rate-limit/parse — barato de
    // checar (só content-length) e evita gastar 1 validação de token ou 1 dos
    // 20 tokens/min do usuário com um body que nem vamos processar. Limite
    // depende da rota: /transcrever aceita áudio em base64 (bem maior).
    if (bodyMuitoGrande(request, url.pathname)) return json({ ok: false, erro: 'payload_grande' }, 413);

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
      if (url.pathname === '/') return await handleDiag(request, env);
      if (url.pathname === '/voz') return await handleVoz(request, env);
      if (url.pathname === '/transcrever') return await handleTranscrever(request, env);
      if (url.pathname === '/chat') return await handleChat(request, env);
      return json({ ok: false, erro: 'nao_encontrado' }, 404);
    } catch (e) {
      const overloaded = !!(e && e.overloaded);
      if (!overloaded) console.error('[olli-worker] falha_ia:', e && (e.message || e));
      return json({ ok: false, erro: overloaded ? 'sobrecarregado' : 'falha_ia' }, overloaded ? 503 : 502);
    }
  },
};
