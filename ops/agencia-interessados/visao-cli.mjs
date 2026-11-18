// Cria a etiqueta "interessado" e a visão salva "Interessados". Não envia mensagem.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { garantirVisao } from './visao.mjs';

function cw(metodo, caminho, corpo) {
  const args = [metodo, caminho];
  if (corpo !== undefined) args.push(JSON.stringify(corpo));
  const saida = execFileSync('cw-api', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 2_000_000 });
  const texto = String(saida || '').trim();
  if (!texto) return null;
  return JSON.parse(texto);
}

async function main() {
  const r = await garantirVisao(cw);
  process.stdout.write(`${JSON.stringify({ ok: true, etiquetaNova: r.etiquetaNova, visaoNova: r.visaoNova, etiqueta: r.etiqueta, visao: r.visao })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`visao: ${e.message}\n`);
    process.exitCode = 1;
  });
}
