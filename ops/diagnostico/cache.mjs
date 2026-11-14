// Cache da lacuna, sem telefone e sem HTML. A frase é montada de novo na hora do envio.
import fs from 'node:fs';
import path from 'node:path';

export const CACHE_PADRAO = '/home/igor/chatwoot-central/data/diagnostico-cache.json';

export function caminhoCache() {
  return CACHE_PADRAO;
}

export function lerCache(caminho = CACHE_PADRAO) {
  try {
    const dado = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    if (!dado || typeof dado !== 'object' || !dado.itens) return { itens: {} };
    return dado;
  } catch {
    return { itens: {} };
  }
}

export function gravarCache(dado, caminho = CACHE_PADRAO) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dado));
  fs.renameSync(tmp, caminho);
}

export function anexarDiagnostico(leads, cache) {
  const itens = cache?.itens || {};
  return (leads || []).map((lead) => {
    const item = lead?.id ? itens[lead.id] : null;
    if (!item || typeof item !== 'object') return lead;
    return { ...lead, diagnostico: item };
  });
}
