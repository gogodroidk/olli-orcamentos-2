// OLLI — Backend no Cloudflare (Etapas 2 e 3 num Worker só).
//
//   POST /            → diagnóstico por IA (OLLI Técnica). Chave = secret do Worker.
//   GET  /status      → quais chaves/bindings estão setados (só NOMES, nunca valores).
//   GET  /o/<token>   → página do cliente (aprovar/recusar/WhatsApp).
//   POST /o/<token>   → grava a resposta do cliente no Supabase.
//
// Provedor de IA pela chave configurada (aceita vários nomes):
//   Gemini   → GEMINI_API_KEY | GOOGLE_API_KEY | GEMINI_KEY | GOOGLE_GENERATIVE_AI_API_KEY
//   Claude   → ANTHROPIC_API_KEY | CLAUDE_API_KEY
// Link do cliente: SUPABASE_URL (var) + SUPABASE_SERVICE_ROLE_KEY (secret).
// Cache opcional em KV (binding CACHE). Todas as chaves ficam no Worker, nunca no app.

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CACHE?: KVNamespace;
}

const GEMINI_NAMES = ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'];
const ANTHROPIC_NAMES = ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SYSTEM_PROMPT = `Você é a OLLI Técnica, um assistente de diagnóstico para técnicos de campo de ar-condicionado no Brasil.

Seu objetivo é ajudar o técnico a interpretar códigos de erro, sintomas e falhas comuns em equipamentos split, inverter, piso-teto, cassete, multi-split e VRF, orientando-o a diagnosticar com segurança ANTES de trocar peças.

REGRAS OBRIGATÓRIAS:
- Nunca afirme diagnóstico definitivo sem dados suficientes; informe sempre o nível de confiança (Alta/Média/Baixa).
- Sempre que faltar, peça marca, modelo e foto da etiqueta.
- Diferencie código oficial do manual, código de família parecida e informação de baixa confiança.
- Nunca condene peça (placa, compressor, sensor, módulo inverter) sem sugerir testes básicos primeiro.
- Regra de ouro: "Placa só deve ser condenada depois de eliminar alimentação, comunicação, sensor, cabo e mau contato."
- Não condene compressor inverter sem testar módulo, alimentação e aterramento.
- Não trate carga de gás como "dipirona": se há vazamento, completar gás sem corrigir é serviço ruim.

TOM DE VOZ: direto, técnico, prático, sem enrolação. Não trate o técnico como leigo nem como engenheiro de laboratório. Evite respostas longas demais e linguagem acadêmica. Priorize o próximo teste, a causa provável, a confiança, a peça suspeita e como explicar ao cliente.

FORMATO DE SAÍDA — responda APENAS com um objeto JSON válido (sem markdown, sem texto fora do JSON), exatamente com estas chaves:
{
  "resumo": "1 frase do problema",
  "significadoProvavel": "o que o código/sintoma significa",
  "causasComuns": ["causa 1", "causa 2"],
  "testesEmOrdem": ["1. ...", "2. ..."],
  "pecasSuspeitas": ["peça 1"],
  "naoFacaAinda": ["o que NÃO fazer antes de testar"],
  "nivelConfianca": "Alta | Média | Baixa",
  "confiancaJustificativa": "manual oficial / família parecida / etc.",
  "mensagemCliente": "explicação simples para o cliente final",
  "sugestaoOrcamento": "estrutura: serviço, peça provável, mão de obra, garantia",
  "fontes": ["manual oficial", "caminho de consulta"]
}
Use português do Brasil. Listas com no máximo 5 itens. Seja conciso.`;

// ─── helpers comuns ──────────────────────────────────────────────
function pickKey(env: Env, names: string[]): string | undefined {
  const e = env as unknown as Record<string, unknown>;
  for (const n of names) {
    const v = e[n];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}
function extractJson(text: string): any | null {
  if (!text) return null;
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── DIAGNÓSTICO (Etapa 2) ───────────────────────────────────────
function norm(s?: string): string { return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
function cacheKey(b: { marca?: string; modelo?: string; codigo?: string; sintoma?: string }): string {
  return `diag:v1:${norm(b.marca)}|${norm(b.modelo)}|${norm(b.codigo)}|${norm(b.sintoma)}`;
}
function userText(b: { marca?: string; modelo?: string; codigo?: string; sintoma?: string; contextoBase?: string }): string {
  return (
    `Caso de campo:\n` +
    `- Marca: ${b.marca || '(não informada)'}\n` +
    `- Modelo: ${b.modelo || '(não informado)'}\n` +
    `- Código/display: ${b.codigo || '(não informado)'}\n` +
    `- Sintoma: ${b.sintoma || '(não informado)'}\n` +
    (b.contextoBase ? `\nReferência da base de códigos:\n${b.contextoBase}\n` : '') +
    `\nDiagnostique seguindo as regras. Responda apenas com o JSON.`
  );
}
const STR = { type: 'STRING' };
const ARR = { type: 'ARRAY', items: { type: 'STRING' } };
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    resumo: STR, significadoProvavel: STR, causasComuns: ARR, testesEmOrdem: ARR,
    pecasSuspeitas: ARR, naoFacaAinda: ARR, nivelConfianca: STR, confiancaJustificativa: STR,
    mensagemCliente: STR, sugestaoOrcamento: STR, fontes: ARR,
  },
  required: ['resumo', 'significadoProvavel', 'causasComuns', 'testesEmOrdem', 'pecasSuspeitas', 'naoFacaAinda', 'nivelConfianca', 'mensagemCliente', 'sugestaoOrcamento', 'fontes'],
  propertyOrdering: ['resumo', 'significadoProvavel', 'causasComuns', 'testesEmOrdem', 'pecasSuspeitas', 'naoFacaAinda', 'nivelConfianca', 'confiancaJustificativa', 'mensagemCliente', 'sugestaoOrcamento', 'fontes'],
};

async function geminiOnce(key: string, model: string, text: string): Promise<{ diag: any } | { erro: string }> {
  let resp: Response;
  try {
    resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: 8192,
          thinkingConfig: { thinkingLevel: 'low' },
        },
      }),
    });
  } catch (e) { return { erro: `rede: ${String(e)}` }; }
  if (!resp.ok) return { erro: `gemini ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}` };
  const data: any = await resp.json();
  const cand: any = data?.candidates?.[0];
  const parts: any[] = cand?.content?.parts ?? [];
  const textos: string[] = parts.filter((p: any) => p && typeof p.text === 'string' && !p.thought).map((p: any) => p.text);
  let diag: any = null;
  for (const t of textos) { diag = extractJson(t); if (diag) break; }
  if (!diag) diag = extractJson(textos.join('\n'));
  if (diag) return { diag };
  return { erro: `resposta_invalida (finish=${cand?.finishReason ?? '?'} parts=${parts.length} txtlen=${textos.join('').length})` };
}

async function callGemini(key: string, model: string, text: string): Promise<{ diag: any; modelo: string } | { erro: string }> {
  let r = await geminiOnce(key, model, text);
  if ('erro' in r && r.erro.startsWith('resposta_invalida')) r = await geminiOnce(key, model, text); // 1 retry
  return 'diag' in r ? { diag: r.diag, modelo: model } : r;
}
async function callAnthropic(key: string, model: string, text: string): Promise<{ diag: any; modelo: string } | { erro: string }> {
  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 2048,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: text }],
      }),
    });
  } catch (e) { return { erro: `rede: ${String(e)}` }; }
  if (!resp.ok) return { erro: `anthropic ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}` };
  const data: any = await resp.json();
  const txt: string = (data?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n');
  const diag = extractJson(txt);
  return diag ? { diag, modelo: data?.model ?? model } : { erro: 'resposta_invalida' };
}

// ─── LINK DO CLIENTE (Etapa 3) ───────────────────────────────────
const BRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function sbReq(env: Env, path: string, init?: RequestInit): Promise<Response | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function carregarOrcamento(env: Env, token: string): Promise<any | null> {
  const r = await sbReq(env, `orcamentos_publicos?token=eq.${encodeURIComponent(token)}&limit=1`);
  if (!r || !r.ok) return null;
  const rows = (await r.json()) as any[];
  return rows?.[0] ?? null;
}

function htmlResp(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
const naoEncontrado = () =>
  htmlResp(`<!doctype html><meta charset="utf-8"><div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#0A2540">
    <h1>Link não encontrado</h1><p>Este orçamento não existe ou foi removido. Peça um novo link ao prestador.</p></div>`, 404);

function paginaCliente(o: any): string {
  const d = o.dados ?? {};
  const itens: any[] = Array.isArray(d.itens) ? d.itens : [];
  const respondido = o.status === 'aprovado' || o.status === 'recusado';
  const wpp = (o.prestador_whatsapp || '').replace(/\D/g, '');
  const wppMsg = encodeURIComponent(`Olá! Tenho uma dúvida sobre o orçamento nº ${o.numero ?? ''}.`);
  const banner = respondido
    ? `<div class="banner ${esc(o.status)}">${o.status === 'aprovado' ? '✓ Você aprovou este orçamento. O prestador foi avisado.' : '✗ Você recusou este orçamento.'}</div>`
    : '';
  const acoes = respondido ? '' :
    `<form method="POST" class="acoes">
       <button name="acao" value="aprovar" class="btn aprovar">Aprovar orçamento</button>
       <button name="acao" value="recusar" class="btn recusar">Recusar</button>
     </form>`;
  const whatsapp = wpp ? `<a class="btn whats" href="https://wa.me/55${wpp}?text=${wppMsg}">Dúvida no WhatsApp</a>` : '';
  const linhas = itens.map(it => `
    <tr><td>${esc(it.nome)}<span class="qtd">${esc(it.quantidade)} ${esc(it.unidade ?? '')} × ${BRL(it.preco)}</span></td>
    <td class="val">${BRL(it.subtotal)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orçamento nº ${esc(o.numero ?? '')} — ${esc(o.prestador_nome ?? 'OLLI')}</title>
<style>
  :root{--ink:#0A2540;--frost:#0B6FCE;--bg:#F4F7FB;--line:#E2E8F0;--ok:#15B66E;--no:#F25555;--mut:#64748B}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink)}
  .wrap{max-width:560px;margin:0 auto;padding:20px 16px 48px}
  .head{display:flex;align-items:center;gap:10px;margin:8px 0 18px}
  .logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#0B6FCE,#34C6D9);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:18px}
  .brand{font-weight:800}.brand small{display:block;color:var(--mut);font-weight:600;font-size:12px}
  .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px;box-shadow:0 6px 20px rgba(10,37,64,.05)}
  .num{font-size:13px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.5px}
  .total{font-size:34px;font-weight:800;margin:2px 0 0}
  h2{font-size:13px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
  table{width:100%;border-collapse:collapse}td{padding:9px 0;border-bottom:1px solid var(--line);vertical-align:top;font-size:15px}
  .qtd{display:block;color:var(--mut);font-size:12px;margin-top:2px}.val{text-align:right;font-weight:700;white-space:nowrap}
  .meta{display:flex;justify-content:space-between;font-size:14px;padding:6px 0;color:var(--mut)}.meta b{color:var(--ink)}
  .acoes{display:flex;gap:10px;margin-top:6px}
  .btn{flex:1;display:block;text-align:center;text-decoration:none;border:0;cursor:pointer;padding:15px;border-radius:13px;font-size:16px;font-weight:800}
  .aprovar{background:var(--ok);color:#fff}.recusar{flex:.6;background:#fff;color:var(--no);border:1.5px solid var(--no)}
  .whats{background:#25D366;color:#fff;margin-top:10px}
  .banner{padding:14px;border-radius:13px;font-weight:700;margin-bottom:14px}
  .banner.aprovado{background:#E7F8F0;color:#0d7a4c}.banner.recusado{background:#FDECEC;color:#b3261e}
  .foot{text-align:center;color:var(--mut);font-size:12px;margin-top:20px}.foot b{color:var(--frost)}
</style></head><body><div class="wrap">
  <div class="head"><div class="logo">O</div><div class="brand">${esc(o.prestador_nome || 'OLLI')}<small>Orçamento nº ${esc(o.numero ?? '')}</small></div></div>
  ${banner}
  <div class="card"><div class="num">Olá ${esc(o.cliente_nome || '')}, este é o seu orçamento</div><div class="total">${BRL(o.valor_total)}</div></div>
  ${itens.length ? `<div class="card"><h2>Itens</h2><table>${linhas}</table></div>` : ''}
  <div class="card">
    ${d.validade ? `<div class="meta">Válido até <b>${esc(d.validade)}</b></div>` : ''}
    ${d.garantia ? `<div class="meta">Garantia <b>${esc(d.garantia)}</b></div>` : ''}
    ${d.condicoesPagamento ? `<div class="meta">Pagamento <b>${esc(d.condicoesPagamento)}</b></div>` : ''}
    ${acoes}${whatsapp}
  </div>
  <div class="foot">Feito com <b>OLLI</b> · orçamentos que fecham negócio</div>
</div></body></html>`;
}

async function handleLink(req: Request, env: Env, token: string): Promise<Response> {
  if (req.method === 'POST') {
    const form = await req.formData();
    const acao = String(form.get('acao') || '');
    const status = acao === 'aprovar' ? 'aprovado' : acao === 'recusar' ? 'recusado' : '';
    if (status) {
      await sbReq(env, `orcamentos_publicos?token=eq.${encodeURIComponent(token)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status, respondido_em: new Date().toISOString() }),
      });
    }
    return new Response(null, { status: 303, headers: { Location: `/o/${token}` } });
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return htmlResp(`<!doctype html><meta charset="utf-8"><div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#0A2540"><h1>Link ainda não configurado</h1><p>Falta o SUPABASE_SERVICE_ROLE_KEY no Worker.</p></div>`, 503);
  }
  const o = await carregarOrcamento(env, token);
  if (!o) return naoEncontrado();
  return htmlResp(paginaCliente(o));
}

// ─── ROTEADOR ────────────────────────────────────────────────────
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const url = new URL(req.url);

    // Link do cliente: /o/<token>
    const linkMatch = url.pathname.match(/^\/o\/([A-Za-z0-9_-]+)\/?$/);
    if (linkMatch) return handleLink(req, env, linkMatch[1]);

    const gKey = pickKey(env, GEMINI_NAMES);
    const aKey = pickKey(env, ANTHROPIC_NAMES);

    if (req.method === 'GET' && url.pathname === '/status') {
      return json({
        ok: true,
        tem_gemini: !!gKey,
        tem_anthropic: !!aKey,
        tem_link: !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY),
        tem_cache: !!env.CACHE,
        provedor: gKey ? 'gemini' : aKey ? 'anthropic' : 'nenhum',
        env_keys: Object.keys(env as object).sort(),
      });
    }

    if (req.method !== 'POST') {
      return new Response('OLLI — backend. POST / = diagnóstico · GET /o/<token> = link do cliente · GET /status = config.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Diagnóstico por IA
    let body: { marca?: string; modelo?: string; codigo?: string; sintoma?: string; contextoBase?: string };
    try { body = await req.json(); } catch { return json({ ok: false, motivo: 'body_invalido' }, 400); }
    if (!body.codigo && !body.sintoma) return json({ ok: false, motivo: 'sem_caso' }, 400);

    const chave = cacheKey(body);
    if (env.CACHE) {
      const hit = await env.CACHE.get(chave);
      if (hit) { const diag = extractJson(hit); if (diag) return json({ ok: true, fonte: 'cache', diagnostico: diag }); }
    }
    if (!gKey && !aKey) return json({ ok: false, motivo: 'ia_nao_configurada' });

    const text = userText(body);
    const r = gKey
      ? await callGemini(gKey, env.GEMINI_MODEL || 'gemini-3.5-flash', text)
      : await callAnthropic(aKey!, env.ANTHROPIC_MODEL || 'claude-opus-4-8', text);
    if ('erro' in r) return json({ ok: false, motivo: 'erro_ia', detalhe: r.erro });

    if (env.CACHE) await env.CACHE.put(chave, JSON.stringify(r.diag), { expirationTtl: 60 * 60 * 24 * 30 }).catch(() => {});
    return json({ ok: true, fonte: 'ia', modelo: r.modelo, diagnostico: r.diag });
  },
};
