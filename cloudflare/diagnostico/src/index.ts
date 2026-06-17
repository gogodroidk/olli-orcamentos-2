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

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Formata data para o cliente. Aceita ISO, "AAAA-MM-DD" ou já-BR ("DD/MM/AAAA"). */
function formatDataBR(v: string): string {
  if (!v) return '';
  if (v.includes('/')) return v; // já está em BR
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) {
    const dia = Number(m[3]);
    const mes = MESES_PT[Number(m[2]) - 1] ?? '';
    return mes ? `${dia} de ${mes} de ${m[1]}` : `${m[3]}/${m[2]}/${m[1]}`;
  }
  return v;
}

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

// Monograma OLLI (SVG inline). cor do traço e do ponto configuráveis.
function monograma(stroke: string, dot: string, size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96" fill="none"><circle cx="48" cy="48" r="22" fill="none" stroke="${stroke}" stroke-width="9" stroke-linecap="round" stroke-dasharray="112 32" transform="rotate(-58 48 48)"/><circle cx="65" cy="33" r="4.5" fill="${dot}"/></svg>`;
}

const ICON_CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M5 12l5 5L20 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_WPP = `<svg width="17" height="17" viewBox="0 0 24 24" fill="#128C7E"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.8.8.8-2.8-.2-.3A8 8 0 0 1 12 4z"/></svg>`;
const ICON_LOCK = `<svg width="14" height="14" viewBox="0 0 48 48" fill="none"><rect x="8" y="11" width="32" height="28" rx="11" fill="#C7CDD6"/><circle cx="19.5" cy="25" r="3.2" fill="#fff"/><circle cx="29.5" cy="25" r="3.2" fill="#fff"/></svg>`;

const PAGE_HEAD = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Spectral:wght@400;500;600;700&display=swap" rel="stylesheet">`;

function shellCss(): string {
  return `
  *{box-sizing:border-box}
  body{margin:0;background:#F4F6F9;font-family:'Plus Jakarta Sans',-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A2230}
  .topband{background:linear-gradient(135deg,#0B6FCE,#0A2540);padding:30px 24px 64px}
  .topband .inner{max-width:560px;margin:0 auto;display:flex;align-items:center;gap:12px}
  .mono{width:46px;height:46px;border-radius:13px;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center}
  .co-name{font-family:'Spectral',Georgia,serif;font-size:19px;font-weight:600;color:#fff}
  .co-tag{font-size:12px;color:rgba(255,255,255,0.7)}
  .stage{max-width:560px;margin:-44px auto 0;padding:0 24px 44px}
  .card{background:#fff;border-radius:20px;box-shadow:0 20px 50px rgba(15,23,42,0.12);overflow:hidden}
  .card-head{padding:26px 28px 22px;border-bottom:1px solid #EDEFF2}
  .hi{font-size:13px;color:#6B7686}.hi b{color:#16202E}
  .title{font-size:19px;font-weight:700;color:#16202E;margin-top:6px;line-height:1.35}
  .metarow{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}
  .metarow .n{font-size:12px;font-weight:700;color:#6B7686}
  .dot{width:4px;height:4px;border-radius:2px;background:#C7CDD6}
  .metarow .date{font-size:12px;color:#8A93A2}
  .pill{margin-left:auto;font-size:11px;font-weight:700;color:#0B6FCE;background:#EAF2FC;border-radius:999px;padding:4px 11px}
  .card-body{padding:20px 28px}
  .item{display:flex;justify-content:space-between;align-items:flex-start;padding:9px 0;border-bottom:1px solid #F1F3F6;gap:12px}
  .item:last-of-type{border-bottom:none}
  .item .nm{font-size:13.5px;font-weight:600;color:#1A2230}
  .item .ds{font-size:11.5px;color:#8A93A2;margin-top:2px}
  .item .vl{font-size:13.5px;font-weight:700;color:#1A2230;white-space:nowrap;font-variant-numeric:tabular-nums}
  .badge{font-size:10px;font-weight:700;color:#0B6FCE;background:#EAF2FC;border-radius:5px;padding:1px 6px;margin-left:4px}
  .totalbox{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:15px 18px;border-radius:14px;background:#F0F6FD;border:1px solid #DCEAFA}
  .totalbox .lbl{font-size:13px;font-weight:700;color:#1A2230;letter-spacing:0.3px}
  .totalbox .amt{font-family:'Spectral',Georgia,serif;font-size:26px;font-weight:700;color:#0B6FCE;font-variant-numeric:tabular-nums}
  .minis{display:flex;gap:8px;margin-top:16px}
  .mini{flex:1;text-align:center;background:#F7F8FA;border-radius:11px;padding:10px 6px}
  .mini .k{font-size:10px;font-weight:800;letter-spacing:0.8px;color:#9AA3B2}
  .mini .v{font-size:11.5px;color:#3C4756;margin-top:4px;font-weight:600}
  .cta{width:100%;margin-top:16px;border:none;background:linear-gradient(135deg,#15B66E,#0E8F55);border-radius:14px;padding:16px;font-family:inherit;font-size:15.5px;font-weight:800;color:#fff;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 10px 24px rgba(21,182,110,0.3);cursor:pointer}
  .row2{display:flex;gap:10px;margin-top:10px}
  .btn-sec{flex:1;border:1px solid #DDE2E9;background:#fff;border-radius:13px;padding:13px;font-family:inherit;font-size:13.5px;font-weight:700;color:#5A6575;cursor:pointer;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:7px}
  .btn-wpp{flex:1.6;color:#128C7E}
  form.inline{margin:0;display:contents}
  .seal{text-align:center;font-size:11.5px;color:#9AA3B2;margin-top:22px;display:flex;align-items:center;justify-content:center;gap:6px}
  /* success / refused full screen */
  @keyframes pop{0%{transform:scale(0.6);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
  .done{background:#fff;border-radius:20px;box-shadow:0 20px 50px rgba(15,23,42,0.12);padding:44px 34px;text-align:center;margin-top:10px}
  .done .circ{width:86px;height:86px;border-radius:43px;margin:0 auto;display:flex;align-items:center;justify-content:center;animation:pop 0.5s ease both}
  .done .circ.ok{background:linear-gradient(140deg,#15B66E,#0E8F55);box-shadow:0 14px 30px rgba(21,182,110,0.35)}
  .done .circ.no{background:linear-gradient(140deg,#F25555,#C0392B);box-shadow:0 14px 30px rgba(242,85,85,0.32)}
  .done .h{font-family:'Spectral',Georgia,serif;font-size:27px;font-weight:700;color:#16202E;margin-top:22px}
  .done .p{font-size:14.5px;color:#5A6575;margin-top:10px;line-height:1.6}.done .p b{color:#16202E}
  .done .tag{display:inline-flex;align-items:center;gap:10px;margin-top:22px;background:#F0F6FD;border:1px solid #DCEAFA;border-radius:12px;padding:12px 18px}
  .done .tag .k{font-size:13px;font-weight:700;color:#1A2230}
  .done .tag .v{font-family:'Spectral',Georgia,serif;font-size:20px;font-weight:700;color:#0B6FCE;font-variant-numeric:tabular-nums}
  .done .again{display:block;margin:26px auto 0;border:none;background:transparent;font-family:inherit;font-size:13px;font-weight:700;color:#8A93A2;text-decoration:underline;cursor:pointer}
  `;
}

/** Cabeçalho com faixa de gradiente + monograma + nome/tagline da empresa. */
function bandHtml(o: any, tagline: string): string {
  return `<div class="topband"><div class="inner">
    <div class="mono">${monograma('#fff', '#7FE9F5', 30)}</div>
    <div><div class="co-name">${esc(o.prestador_nome || 'OLLI')}</div>${tagline ? `<div class="co-tag">${esc(tagline)}</div>` : ''}</div>
  </div></div>`;
}

/** Estado de sucesso/recusa em tela cheia (com a animação pop). */
function paginaResposta(o: any): string {
  const d = o.dados ?? {};
  const tagline = d.prestador?.tagline ?? '';
  const aprovado = o.status === 'aprovado';
  const titulo = aprovado ? 'Orçamento aprovado!' : 'Orçamento recusado';
  const corpo = aprovado
    ? `A <b>${esc(o.prestador_nome || 'empresa')}</b> já foi avisada e vai entrar em contato pra agendar.`
    : `Você recusou este orçamento. A <b>${esc(o.prestador_nome || 'empresa')}</b> foi avisada. Se mudou de ideia, fale com o prestador.`;
  const tagLabel = aprovado ? 'Total aprovado' : 'Total';
  return `<!doctype html><html lang="pt-BR"><head>${PAGE_HEAD}
<title>Orçamento nº ${esc(o.numero ?? '')} — ${esc(o.prestador_nome ?? 'OLLI')}</title>
<style>${shellCss()}</style></head><body>
${bandHtml(o, tagline)}
<div class="stage">
  <div class="done">
    <div class="circ ${aprovado ? 'ok' : 'no'}">${aprovado
      ? `<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6"><path d="M5 12l5 5L20 6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>`}</div>
    <div class="h">${titulo}</div>
    <div class="p">${corpo}</div>
    <div class="tag"><span class="k">${tagLabel}</span><span class="v">${BRL(o.valor_total)}</span></div>
    <a class="again" href="/o/${esc(o.token ?? '')}?ver=1">Ver orçamento novamente</a>
  </div>
  <div class="seal">${ICON_LOCK} Enviado com segurança via OLLI</div>
</div>
</body></html>`;
}

function paginaCliente(o: any): string {
  const d = o.dados ?? {};
  const itens: any[] = Array.isArray(d.itens) ? d.itens : [];
  const respondido = o.status === 'aprovado' || o.status === 'recusado';

  // Quando já respondido, mostra a tela cheia de sucesso/recusa
  // (a não ser que o cliente peça "ver=1" para rever o orçamento).
  const querVer = o.__verNovamente === true;
  if (respondido && !querVer) return paginaResposta(o);

  const tagline = d.prestador?.tagline ?? '';
  const wpp = (o.prestador_whatsapp || '').replace(/\D/g, '');
  const wppMsg = encodeURIComponent(`Olá! Tenho uma dúvida sobre o orçamento nº ${o.numero ?? ''}.`);
  const dataEmissao = d.dataEmissao ? esc(formatDataBR(d.dataEmissao)) : '';

  const primeiroNome = esc((o.cliente_nome || '').split(/\s+/)[0] || 'cliente');

  const linhas = itens.map(it => {
    const badge = it.isPeca ? `<span class="badge">PEÇA</span>` : '';
    return `<div class="item">
      <div><div class="nm">${esc(it.nome)}${badge}</div>${it.descricao ? `<div class="ds">${esc(it.descricao)}</div>` : ''}</div>
      <div class="vl">${BRL(it.subtotal)}</div>
    </div>`;
  }).join('');

  // mini-cards (omite os vazios, mas tenta sempre mostrar os três)
  const pgto = esc(d.condicoesPagamento || '—');
  const gar = esc(d.garantia || '—');
  const prazo = esc(d.prazo || (d.validade ? `até ${formatDataBR(d.validade)}` : '—'));

  const acoes = respondido ? '' : `
    <form method="POST" class="inline">
      <button name="acao" value="aprovar" class="cta">${ICON_CHECK} Aprovar orçamento</button>
      <div class="row2">
        <button name="acao" value="recusar" class="btn-sec">Recusar</button>
        ${wpp ? `<a class="btn-sec btn-wpp" href="https://wa.me/55${wpp}?text=${wppMsg}">${ICON_WPP} Tirar dúvida</a>` : ''}
      </div>
    </form>`;

  return `<!doctype html><html lang="pt-BR"><head>${PAGE_HEAD}
<title>Orçamento nº ${esc(o.numero ?? '')} — ${esc(o.prestador_nome ?? 'OLLI')}</title>
<style>${shellCss()}</style></head><body>
${bandHtml(o, tagline)}
<div class="stage">
  <div class="card">
    <div class="card-head">
      <div class="hi">Olá, <b>${primeiroNome}</b></div>
      <div class="title">Você recebeu um orçamento da ${esc(o.prestador_nome || 'empresa')}</div>
      <div class="metarow">
        <span class="n">Nº ${esc(o.numero ?? '')}</span>
        ${dataEmissao ? `<span class="dot"></span><span class="date">${dataEmissao}</span>` : ''}
        <span class="pill">${d.validade ? `Válido até ${esc(formatDataBR(d.validade))}` : 'Válido por 15 dias'}</span>
      </div>
    </div>
    <div class="card-body">
      ${linhas}
      <div class="totalbox"><span class="lbl">TOTAL</span><span class="amt">${BRL(o.valor_total)}</span></div>
      <div class="minis">
        <div class="mini"><div class="k">PAGAMENTO</div><div class="v">${pgto}</div></div>
        <div class="mini"><div class="k">GARANTIA</div><div class="v">${gar}</div></div>
        <div class="mini"><div class="k">PRAZO</div><div class="v">${prazo}</div></div>
      </div>
    </div>
  </div>
  ${acoes}
  <div class="seal">${ICON_LOCK} Enviado com segurança via OLLI</div>
</div>
</body></html>`;
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
  o.token = token;
  o.__verNovamente = new URL(req.url).searchParams.get('ver') === '1';
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
