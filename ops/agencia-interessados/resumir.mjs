// Resumo dos interessados para o Telegram do Igor. Duas vezes por dia, só quando o timer estiver ligado.
// Este arquivo não liga o timer. Sem --dry, manda pelo equipe.mjs. Os testes usam --dry --sem-central.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { lerRegistros, selecionarRegistros, cruzar } from './fila.mjs';
import { montarResumo } from './resumo.mjs';

function arg(nome, padrao) {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] : padrao;
}

export function prepararResumo({ texto, agora, central = null }) {
  const itens = cruzar(selecionarRegistros(lerRegistros(texto)), central);
  return montarResumo(itens, agora);
}

function lerCentral() {
  if (process.argv.includes('--sem-central')) return null;
  try {
    const saida = execFileSync('cw-api', ['GET', '/conversations?status=all&labels[]=interessado'], {
      encoding: 'utf8', timeout: 30000, maxBuffer: 8_000_000,
    });
    const j = JSON.parse(String(saida || '').trim() || '{}');
    const arr = j?.data?.payload || j?.payload || [];
    return arr.map((c) => ({ id: c.id, status: c.status, labels: c.labels || [] }));
  } catch {
    return null;
  }
}

function main() {
  const arquivo = arg('--arquivo', '/home/igor/chatwoot-central/data/interessados.jsonl');
  let texto = '';
  try { texto = fs.readFileSync(arquivo, 'utf8'); } catch { texto = ''; }
  const agoraArg = arg('--agora', '');
  const agora = agoraArg ? Math.floor(new Date(agoraArg).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const msg = prepararResumo({ texto, agora, central: lerCentral() });
  if (process.argv.includes('--dry')) {
    process.stdout.write(`${msg}\n`);
    return;
  }
  const equipe = arg('--equipe', '/home/igor/Desktop/Sistema/ferramentas/equipe-telegram/equipe.mjs');
  execFileSync('node', [equipe, 'pv', msg], { timeout: 60000, stdio: 'ignore' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
