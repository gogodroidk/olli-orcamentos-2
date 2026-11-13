// Lê só o hash da supressão. Nunca grava telefone e nunca imprime hash.
import fs from 'node:fs';

export const CSV_PADRAO = '/home/igor/dados-receita/supressao-telefones.csv';
export const SYNC_PADRAO = '/home/igor/dados-receita/supressao.sync';
export const SYNC_MAX_HORAS = 24;

export function carregarHashes(caminho = CSV_PADRAO) {
  const texto = fs.readFileSync(caminho, 'utf8');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  const cabeca = (linhas.shift() || '').split(',').map((c) => c.trim().toLowerCase());
  const col = cabeca.indexOf('sha256');
  if (col < 0) throw new Error('supressao_sem_coluna_sha256');
  const hashes = new Set();
  for (const linha of linhas) {
    const partes = linha.split(',');
    const h = (partes[col] || '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(h)) hashes.add(h);
  }
  return hashes;
}

export function syncFresca(caminho = SYNC_PADRAO, agora = new Date(), maxHoras = SYNC_MAX_HORAS) {
  try {
    const st = fs.statSync(caminho);
    return agora.getTime() - st.mtimeMs < maxHoras * 3600 * 1000;
  } catch {
    return false;
  }
}

export function idadeSyncHoras(caminho = SYNC_PADRAO, agora = new Date()) {
  try {
    const st = fs.statSync(caminho);
    return (agora.getTime() - st.mtimeMs) / 3600000;
  } catch {
    return null;
  }
}
