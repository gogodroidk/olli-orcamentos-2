import { readFile } from 'node:fs/promises';
import { OPENROUTER_MODELOS_PADRAO } from '../worker/src/ai.js';

const wrangler = await readFile(new URL('../worker/wrangler.jsonc', import.meta.url), 'utf8');
const match = /"OPENROUTER_TEXT_MODELS"\s*:\s*"([^"]+)"/.exec(wrangler);
if (!match) throw new Error('OPENROUTER_TEXT_MODELS ausente em worker/wrangler.jsonc');

const configurados = match[1].split(',').map((id) => id.trim()).filter(Boolean);
if (JSON.stringify(configurados) !== JSON.stringify([...OPENROUTER_MODELOS_PADRAO])) {
  throw new Error('A cadeia do wrangler diverge de OPENROUTER_MODELOS_PADRAO');
}
if (!configurados.length || configurados.length > 5) throw new Error('Cadeia de modelos fora do limite 1..5');
if (new Set(configurados).size !== configurados.length) throw new Error('Há modelo duplicado na cadeia');

const resposta = await fetch('https://openrouter.ai/api/v1/models', {
  headers: { Accept: 'application/json' },
  signal: AbortSignal.timeout(20_000),
});
if (!resposta.ok) throw new Error(`Catálogo OpenRouter respondeu HTTP ${resposta.status}`);
const payload = await resposta.json();
const catalogo = new Map((payload?.data ?? []).map((m) => [m.id, m]));
const agora = Date.now();
const margemExpiracaoMs = 45 * 24 * 60 * 60 * 1000;

for (const id of configurados) {
  if (id === 'openrouter/free' || !id.endsWith(':free')) {
    throw new Error(`${id}: somente IDs gratuitos e explícitos são permitidos`);
  }
  const modelo = catalogo.get(id);
  if (!modelo) throw new Error(`${id}: removido ou ausente do catálogo oficial`);
  if (Number(modelo?.pricing?.prompt) !== 0 || Number(modelo?.pricing?.completion) !== 0) {
    throw new Error(`${id}: preço deixou de ser zero`);
  }
  const saidas = modelo?.architecture?.output_modalities ?? [];
  if (!saidas.includes('text')) throw new Error(`${id}: não anuncia saída textual`);
  const parametros = new Set(modelo?.supported_parameters ?? []);
  for (const obrigatorio of ['response_format', 'structured_outputs']) {
    if (!parametros.has(obrigatorio)) throw new Error(`${id}: não suporta ${obrigatorio}`);
  }
  if (modelo?.expiration_date) {
    const expiracao = Date.parse(modelo.expiration_date);
    if (Number.isFinite(expiracao) && expiracao - agora < margemExpiracaoMs) {
      throw new Error(`${id}: expira em menos de 45 dias`);
    }
  }
  console.log(`ok  ${id}`);
}

console.log(`OpenRouter: ${configurados.length} modelos gratuitos e estruturados validados no catálogo ao vivo.`);
