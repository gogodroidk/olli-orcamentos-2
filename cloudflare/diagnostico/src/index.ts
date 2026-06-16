// OLLI — Diagnóstico por IA (Etapa 2), rodando no Cloudflare.
//
// Worker que recebe um caso de campo e devolve um diagnóstico estruturado da
// "OLLI Técnica". A chave da IA fica AQUI, como secret do Worker — nunca no app.
//
// Provedor automático pela chave configurada (aceita vários nomes comuns):
//   • Gemini   → GEMINI_API_KEY | GOOGLE_API_KEY | GEMINI_KEY | GOOGLE_GENERATIVE_AI_API_KEY
//   • Claude   → ANTHROPIC_API_KEY | CLAUDE_API_KEY
// Cache opcional em KV (binding CACHE).
//
// GET /status → diz quais chaves estão configuradas (só os NOMES, nunca o valor).
// Responde sempre HTTP 200 com { ok, ... } para o app decidir o fallback.

export interface Env {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
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

function pickKey(env: Env, names: string[]): string | undefined {
  const e = env as unknown as Record<string, unknown>;
  for (const n of names) {
    const v = e[n];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function norm(s?: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheKey(b: { marca?: string; modelo?: string; codigo?: string; sintoma?: string }): string {
  return `diag:v1:${norm(b.marca)}|${norm(b.modelo)}|${norm(b.codigo)}|${norm(b.sintoma)}`;
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
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

async function callGemini(key: string, model: string, text: string): Promise<{ diag: any; modelo: string } | { erro: string }> {
  let resp: Response;
  try {
    resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      }),
    });
  } catch (e) {
    return { erro: `rede: ${String(e)}` };
  }
  if (!resp.ok) return { erro: `gemini ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}` };
  const data: any = await resp.json();
  const txt: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? '').join('');
  const diag = extractJson(txt);
  return diag ? { diag, modelo: model } : { erro: 'resposta_invalida' };
}

async function callAnthropic(key: string, model: string, text: string): Promise<{ diag: any; modelo: string } | { erro: string }> {
  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: text }],
      }),
    });
  } catch (e) {
    return { erro: `rede: ${String(e)}` };
  }
  if (!resp.ok) return { erro: `anthropic ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}` };
  const data: any = await resp.json();
  const txt: string = (data?.content ?? []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n');
  const diag = extractJson(txt);
  return diag ? { diag, modelo: data?.model ?? model } : { erro: 'resposta_invalida' };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

    const url = new URL(req.url);
    const gKey = pickKey(env, GEMINI_NAMES);
    const aKey = pickKey(env, ANTHROPIC_NAMES);

    // Diagnóstico de configuração (só NOMES de variáveis, nunca valores).
    if (req.method === 'GET' && url.pathname === '/status') {
      return json({
        ok: true,
        tem_gemini: !!gKey,
        tem_anthropic: !!aKey,
        tem_cache: !!env.CACHE,
        provedor: gKey ? 'gemini' : aKey ? 'anthropic' : 'nenhum',
        env_keys: Object.keys(env as object).sort(),
      });
    }

    if (req.method !== 'POST') {
      return new Response('OLLI — Worker de diagnóstico. Envie um POST com { marca, modelo, codigo, sintoma }. (GET /status mostra a configuração.)', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    let body: { marca?: string; modelo?: string; codigo?: string; sintoma?: string; contextoBase?: string };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, motivo: 'body_invalido' }, 400);
    }
    if (!body.codigo && !body.sintoma) return json({ ok: false, motivo: 'sem_caso' }, 400);

    const chave = cacheKey(body);

    // 1) cache (KV) — opcional
    if (env.CACHE) {
      const hit = await env.CACHE.get(chave);
      if (hit) {
        const diag = extractJson(hit);
        if (diag) return json({ ok: true, fonte: 'cache', diagnostico: diag });
      }
    }

    // 2) sem chave → o app cai para a base de códigos
    if (!gKey && !aKey) return json({ ok: false, motivo: 'ia_nao_configurada' });

    // 3) chama a IA (Gemini por padrão; Claude se for a chave configurada)
    const text = userText(body);
    const r = gKey
      ? await callGemini(gKey, env.GEMINI_MODEL || 'gemini-3.5-flash', text)
      : await callAnthropic(aKey!, env.ANTHROPIC_MODEL || 'claude-opus-4-8', text);
    if ('erro' in r) return json({ ok: false, motivo: 'erro_ia', detalhe: r.erro });

    if (env.CACHE) {
      await env.CACHE.put(chave, JSON.stringify(r.diag), { expirationTtl: 60 * 60 * 24 * 30 }).catch(() => {});
    }
    return json({ ok: true, fonte: 'ia', modelo: r.modelo, diagnostico: r.diag });
  },
};
