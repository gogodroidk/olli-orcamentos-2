// Helpers puros de parsing/sanitização, compartilhados por index.js e voz.js.
// Extraídos de index.js pra permitir importar a lógica de voz (voz.js) sem
// arrastar @sentry/cloudflare — só instalado em worker/node_modules, fora do
// `npm ci` da raiz. Sem isto, testar handleVozConversa exigiria importar
// index.js inteiro e quebraria a mesma forma que já está documentada em
// scripts/teste-creditos-voz.ts ("Não importa index.js: ele carrega
// @sentry/cloudflare..."). Puros: nenhuma rede, nenhum estado.

/** Parseia o texto já lido por bodyMuitoGrande (index.js). Nunca lança — {} em JSON inválido. */
export function parseJsonBody(raw) {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Parser de JSON tolerante (remove cercas ```json e lixo em volta). */
export function parseJsonLoose(s) {
  if (!s) return null;
  const cleaned = s.replace(/```json\s*|\s*```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf('{');
  const b = cleaned.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {} }
  return null;
}

/** Trunca uma string (proteção de payload gigante / prompt injection). '' se não for string. */
export function cortar(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
