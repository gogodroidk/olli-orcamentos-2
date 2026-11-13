// Lê base.json e grava o mapa com telefone mascarado. Não fala com o Chatwoot.
import fs from 'node:fs';
import path from 'node:path';
import { gerarMapa, MAPA_SEM_BASE } from './relatorio.mjs';
import { carregarHashes, syncFresca, idadeSyncHoras } from './supressao.mjs';

const BASE = new URL('./base.json', import.meta.url);
const SAIDA_PADRAO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-13-ativacao-zap/MAPA-BASE.md';

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : padrao;
}

export function escreverMapa({ basePath = BASE, saida = SAIDA_PADRAO, agora = new Date() } = {}) {
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  if (!fs.existsSync(basePath)) {
    fs.writeFileSync(saida, MAPA_SEM_BASE);
    return { ok: false, motivo: 'sem_base', saida };
  }
  const pessoas = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  if (!Array.isArray(pessoas)) throw new Error('base_nao_e_lista');
  let nota = '';
  try {
    const fresca = syncFresca(undefined, agora);
    const idade = idadeSyncHoras(undefined, agora);
    nota = fresca
      ? `Supressão conferida (${carregarHashes().size} hashes, sync dentro de 24 h).`
      : `Supressão NÃO está fresca (${idade == null ? 'sem arquivo de sync' : `${idade.toFixed(0)} h`}; limite 24 h). O envio fica parado até o Salomão rodar sincronizar_supressao.py.`;
  } catch {
    nota = 'Não foi possível ler a supressão. O envio fica parado.';
  }
  const md = gerarMapa(pessoas, { quando: agora.toISOString(), notaSync: nota });
  if (/\+\d{10,}/.test(md)) throw new Error('mapa_vazou_telefone');
  fs.writeFileSync(saida, md);
  return { ok: true, contas: pessoas.length, saida };
}

const direto = process.argv[1] && process.argv[1].endsWith('mapa.mjs');
if (direto) {
  const r = escreverMapa({ basePath: arg('--base', BASE), saida: arg('--saida', SAIDA_PADRAO) });
  console.log(r.ok ? `mapa ${r.contas} contas -> ${r.saida}` : `mapa sem base -> ${r.saida}`);
  if (!r.ok) process.exitCode = 2;
}
