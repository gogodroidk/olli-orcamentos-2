// Chamada ao Google Gemini — extraído de index.js pra ser importável sem
// arrastar @sentry/cloudflare (só instalado em worker/node_modules, fora do
// `npm ci` da raiz), permitindo testar worker/src/voz.js direto (ver
// scripts/teste-voz-conversa.ts). Comportamento IDÊNTICO ao que vivia em
// index.js — só mudou de arquivo.

/**
 * Chama o Gemini. `user` pode ser string (1 turno) ou array de `contents` (chat).
 * `userParts`, se vier, tem prioridade sobre `user`: array de parts cru (ex.:
 * texto + inline_data de áudio) montado como um único turno `{role:'user'}` —
 * usado por /transcrever para anexar o áudio junto do prompt de texto.
 * `timeoutMs` permite alongar o prazo para chamadas mais pesadas (ex.: áudio).
 */
export async function gemini(env, { system, user, userParts, wantJson = false, temperature = 0.4, timeoutMs = 25_000 }) {
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
