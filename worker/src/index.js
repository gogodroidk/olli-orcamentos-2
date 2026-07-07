/**
 * OLLI — Worker de IA (Cloudflare) com Google Gemini.
 *
 * Endpoints (o app chama exatamente estes):
 *   POST /      → diagnóstico técnico (OLLI Técnica)
 *   POST /voz   → transcrição → itens de orçamento
 *   POST /chat  → assistente conversacional
 *   GET  /      → health check
 *
 * Segurança:
 *   - GEMINI_API_KEY é SECRET do Worker (nunca vai pro app/APK).
 *   - Exige JWT do Supabase (Authorization: Bearer <token>), validado em /auth/v1/user.
 *   - CORS liberado para a versão web do app.
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

/** Valida o token do Supabase chamando /auth/v1/user. Retorna o user ou null. */
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch {
    return null;
  }
}

/** Chama o Gemini. `user` pode ser string (1 turno) ou array de `contents` (chat). */
async function gemini(env, { system, user, wantJson = false, temperature = 0.4 }) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const body = {
    contents: Array.isArray(user) ? user : [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      ...(wantJson ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
const IA_ROUTES = new Set(['/', '/voz', '/chat']);

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
Responda SOMENTE com JSON válido no formato pedido.`;

function diagPrompt(input) {
  const ctx = input.contextoBase ? `\nContexto da base local de códigos: ${input.contextoBase}` : '';
  return `Caso do técnico:
- marca: ${input.marca || '(não informada)'}
- modelo: ${input.modelo || '(não informado)'}
- código no display/LED: ${input.codigo || '(não informado)'}
- sintoma relatado: ${input.sintoma || '(não informado)'}${ctx}

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
  const input = await request.json().catch(() => ({}));
  const text = await gemini(env, { system: DIAG_SYSTEM, user: diagPrompt(input), wantJson: true, temperature: 0.3 });
  const diag = parseJsonLoose(text);
  if (!diag || !diag.resumo) {
    console.error('[olli-diag] parse do Gemini falhou; texto recebido:', (text || '').slice(0, 300));
    return json({ ok: false, erro: 'resposta_invalida' });
  }
  return json({ ok: true, diagnostico: diag, fonte: 'ia', modelo: env.GEMINI_MODEL || 'gemini-2.5-flash' });
}

// ─── VOZ → ITENS ─────────────────────────────────────────────
const VOZ_SYSTEM = `Você é a OLLI, assistente de um prestador de serviços (ar-condicionado e afins) no Brasil. O técnico fala em voz alta o que vai fazer e você transforma isso em itens de orçamento. Use o catálogo quando o item casar. Responda SOMENTE com JSON válido em pt-BR.`;

function vozPrompt(transcript, catalogo) {
  const cat = Array.isArray(catalogo) && catalogo.length
    ? `\nCatálogo do prestador (use o preço quando o item casar):\n${catalogo.map((c) => `- ${c.nome}${c.preco ? ` = R$ ${c.preco}` : ''}`).join('\n')}`
    : '';
  return `Fala do técnico: "${transcript}"${cat}

Monte os itens no JSON EXATO:
{
  "titulo": "título curto do serviço (opcional)",
  "clienteNome": "nome do cliente, se ele falou (opcional)",
  "itens": [
    { "descricao": "descrição do item", "quantidade": 1, "valorUnitario": 0, "tipo": "servico" }
  ],
  "observacao": "observação opcional"
}
Regras: "tipo" é "servico" ou "peca". Se não der pra estimar o preço, use null em "valorUnitario". Quantidade é número.`;
}

async function handleVoz(request, env) {
  const { transcript, catalogo } = await request.json().catch(() => ({}));
  if (!transcript || !String(transcript).trim()) return json({ ok: false, erro: 'sem_transcript' });
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

// ─── CHAT ────────────────────────────────────────────────────
const CHAT_SYSTEM = `Você é a OLLI, assistente do prestador de serviços (foco em ar-condicionado) no Brasil. Ajuda com diagnóstico técnico, preços e orçamentos, atendimento ao cliente e organização do dia. Seja prática, direta e em português do Brasil. Respostas curtas e úteis. Quando faltar dado técnico, peça marca e modelo. Nunca mande trocar peça sem teste.`;

async function handleChat(request, env) {
  const { mensagens } = await request.json().catch(() => ({}));
  if (!Array.isArray(mensagens) || mensagens.length === 0) return json({ ok: false, erro: 'sem_mensagens' });
  const contents = mensagens
    .filter((m) => m && typeof m.texto === 'string')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.texto }] }));
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

    // ── LINK PÚBLICO DO CLIENTE (sem login, antes do gate da IA) ──
    if (url.pathname.startsWith('/o/')) {
      const token = decodeURIComponent(url.pathname.slice(3));
      if (request.method === 'GET') return renderLinkPage(token, env);
      if (request.method === 'POST') return responderLink(token, request, env);
      return new Response('Método não suportado', {
        status: 405,
        headers: { Allow: 'GET, POST', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    // Health check público (abrir no navegador mostra que está online). GET '/'
    // NUNCA exige auth; só o POST '/' (diagnóstico) passa pelo gate de IA abaixo.
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'olli-diagnostico', ia: env.GEMINI_API_KEY ? 'on' : 'off' });
    }
    if (request.method !== 'POST') return json({ ok: false, erro: 'metodo_nao_suportado' }, 405);

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
      if (url.pathname === '/chat') return await handleChat(request, env);
      return json({ ok: false, erro: 'nao_encontrado' }, 404);
    } catch (e) {
      const overloaded = !!(e && e.overloaded);
      if (!overloaded) console.error('[olli-worker] falha_ia:', e && (e.message || e));
      return json({ ok: false, erro: overloaded ? 'sobrecarregado' : 'falha_ia' }, overloaded ? 503 : 502);
    }
  },
};
