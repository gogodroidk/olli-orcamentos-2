// Estado da instância olli-orcamentos. A chave é lida e usada; nunca é impressa.
import fs from 'node:fs';

const CRED = '/home/igor/Desktop/Sistema/credenciais-locais.env';

export function lerChaveEvolution() {
  try {
    if (process.env.EVOLUTION_API_KEY) return String(process.env.EVOLUTION_API_KEY).trim();
    const texto = fs.readFileSync(CRED, 'utf8');
    const m = texto.match(/^EVOLUTION_API_KEY=(.+)$/m);
    return m?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

export async function evolutionAberta({
  fetchImpl = globalThis.fetch,
  chave = lerChaveEvolution(),
  url = process.env.EVO_URL || 'http://127.0.0.1:8085',
  instancia = 'olli-orcamentos',
} = {}) {
  if (!chave || typeof fetchImpl !== 'function') return false;
  try {
    const r = await fetchImpl(`${url}/instance/connectionState/${instancia}`, {
      headers: { apikey: chave },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return false;
    const d = await r.json();
    return d?.instance?.state === 'open';
  } catch {
    return false;
  }
}
