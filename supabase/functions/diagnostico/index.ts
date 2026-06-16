// OLLI Técnica — diagnóstico de ar-condicionado por IA (Etapa 2 do PROCESSO).
//
// Edge Function da Supabase (Deno). A chave da Anthropic fica AQUI, como secret
// do servidor — nunca entra no bundle do app. Fluxo de custo (decisão do plano):
//   1. cache global por (código+marca) na tabela `cache_ia` — ~80% das chamadas;
//   2. só chama a API Claude quando não há cache, com prompt caching no system;
//   3. grava a resposta no cache.
// O app ainda tem um cache local (SQLite) na frente disto e cai para a base de
// 602 códigos se esta função não estiver configurada/online.
//
// Deploy:
//   supabase functions deploy diagnostico --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        (chave do Igor)
//   # opcional: supabase secrets set OLLI_DIAGNOSTICO_MODEL=claude-sonnet-4-6
//
// Retorna sempre HTTP 200 com { ok, ... } para o app decidir o fallback.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = Deno.env.get('OLLI_DIAGNOSTICO_MODEL') ?? 'claude-opus-4-8';
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

function norm(s?: string): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheKey(b: { marca?: string; modelo?: string; codigo?: string; sintoma?: string }): string {
  return `diag:v1:${norm(b.marca)}|${norm(b.modelo)}|${norm(b.codigo)}|${norm(b.sintoma)}`;
}

async function cacheGet(chave: string): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/cache_ia?chave=eq.${encodeURIComponent(chave)}&select=resposta&limit=1`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.resposta ?? null;
  } catch {
    return null;
  }
}

async function cacheSet(chave: string, resposta: string): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/cache_ia`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ chave, resposta, criado_em: new Date().toISOString() }]),
    });
  } catch {
    // cache é best-effort; nunca quebra o diagnóstico
  }
}

function extractJson(text: string): any | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  let body: { marca?: string; modelo?: string; codigo?: string; sintoma?: string; contextoBase?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, motivo: 'body_invalido' }, 400);
  }

  if (!body.codigo && !body.sintoma) {
    return json({ ok: false, motivo: 'sem_caso' }, 400);
  }

  const chave = cacheKey(body);

  // 1) cache global
  const cached = await cacheGet(chave);
  if (cached) {
    const diag = extractJson(cached);
    if (diag) return json({ ok: true, fonte: 'cache', modelo: MODEL, diagnostico: diag });
  }

  // 2) sem chave configurada → o app cai para a base de códigos
  if (!ANTHROPIC_KEY) return json({ ok: false, motivo: 'ia_nao_configurada' });

  // 3) chama a API Claude (prompt caching no system)
  const userText =
    `Caso de campo:\n` +
    `- Marca: ${body.marca || '(não informada)'}\n` +
    `- Modelo: ${body.modelo || '(não informado)'}\n` +
    `- Código/display: ${body.codigo || '(não informado)'}\n` +
    `- Sintoma: ${body.sintoma || '(não informado)'}\n` +
    (body.contextoBase ? `\nReferência da base de códigos:\n${body.contextoBase}\n` : '') +
    `\nDiagnostique seguindo as regras. Responda apenas com o JSON.`;

  let resp: Response;
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userText }],
      }),
    });
  } catch (e) {
    return json({ ok: false, motivo: 'erro_rede', detalhe: String(e) });
  }

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => '');
    return json({ ok: false, motivo: 'erro_ia', status: resp.status, detalhe: detalhe.slice(0, 500) });
  }

  const data = await resp.json();
  const text: string = (data?.content ?? [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
  const diag = extractJson(text);
  if (!diag) return json({ ok: false, motivo: 'resposta_invalida' });

  await cacheSet(chave, JSON.stringify(diag));
  return json({ ok: true, fonte: 'ia', modelo: data?.model ?? MODEL, diagnostico: diag });
});
