// Fala com a Central pelo comando cw-api. O token fica dentro do comando e não volta para cá.
import { execFileSync } from 'node:child_process';

export function cw(metodo, caminho, corpo) {
  const args = [metodo, caminho];
  if (corpo !== undefined) args.push(JSON.stringify(corpo));
  let saida = '';
  try {
    saida = execFileSync('cw-api', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 8_000_000 });
  } catch (e) {
    const erro = new Error(`cw ${metodo} ${caminho} falhou`);
    erro.cause = e;
    throw erro;
  }
  const texto = String(saida || '').trim();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`cw ${metodo} ${caminho} resposta invalida`);
  }
}
