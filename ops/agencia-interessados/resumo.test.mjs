import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarResumo } from './resumo.mjs';
import { prepararResumo } from './resumir.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const agora = 1_700_003_600;

test('resumo traz empresa, o que quer e a espera, sem preço', () => {
  const vazio = montarResumo([], agora);
  assert.match(vazio, /ninguém esperando/);
  const texto = montarResumo([
    { empresa: 'Refrigeração Aurora', quer: 'Pediu para ver · atendimento no WhatsApp', desde: agora - 7200 },
    { empresa: 'Elétrica Luminar', quer: 'Pediu preço · site', desde: agora - 1200 },
  ], agora);
  assert.match(texto, /Refrigeração Aurora — Pediu para ver · atendimento no WhatsApp — há 2 h/);
  assert.match(texto, /Elétrica Luminar — Pediu preço · site — há 20 min/);
  assert.equal(/\+?\d[\d\s()-]{7,}\d/.test(texto), false);
  assert.doesNotMatch(texto, /R\$|garanto|100%/);
});

test('quem a central encerrou não entra no texto', () => {
  const texto = [
    JSON.stringify({ conversa: 1, empresa: 'Aurora', quer: 'Pediu para ver', desde: agora - 1000 }),
    JSON.stringify({ conversa: 2, empresa: 'Luminar', quer: 'Pediu preço', desde: agora - 2000 }),
  ].join('\n');
  const msg = prepararResumo({
    texto, agora, central: [{ id: 2, status: 'resolved', labels: ['interessado'] }],
  });
  assert.match(msg, /Aurora/);
  assert.doesNotMatch(msg, /Luminar/);
});

test('o comando --dry não chama o Telegram', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'interessados-'));
  const arquivo = path.join(dir, 'fila.jsonl');
  fs.writeFileSync(arquivo, `${JSON.stringify({
    conversa: 4, empresa: 'Padaria Exemplo', quer: 'Aceitou conversa', desde: agora - 3600,
  })}\n`);
  const r = spawnSync(process.execPath, [
    path.join(aqui, 'resumir.mjs'), '--dry', '--sem-central', '--arquivo', arquivo, '--agora', '2023-11-14T18:00:00Z',
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Padaria Exemplo — Aceitou conversa/);
  assert.doesNotMatch(r.stderr || '', /equipe\.mjs/);
});
