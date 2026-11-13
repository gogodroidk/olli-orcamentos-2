import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarRegistroParada, paradasNoDia } from './freioAtivacao.js';

test('duas paradas no mesmo dia travam; uma no dia seguinte não', () => {
  const agora = new Date('2026-11-13T15:00:00Z');
  const linhas = [
    { conversa: 1, em: '2026-11-13T12:00:00Z' },
    { conversa: 1, em: '2026-11-13T13:00:00Z' },
    { conversa: 2, em: '2026-11-13T14:00:00Z' },
    { conversa: 3, em: '2026-11-12T14:00:00Z' },
  ];
  assert.equal(paradasNoDia(linhas, agora), 2);
  assert.equal(paradasNoDia(linhas, new Date('2026-11-12T15:00:00Z')), 1);
});

test('a segunda pessoa do dia grava o freio uma vez', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ativacao-freio-'));
  const freios = [];
  const registrar = criarRegistroParada({ dir, aoFrear: (f) => freios.push(f), agora: () => new Date('2026-11-13T16:00:00Z') });
  await registrar({ conversa: 10 });
  assert.equal(freios.length, 0);
  await registrar({ conversa: 11 });
  assert.equal(freios.length, 1);
  assert.equal(freios[0].motivo, '2_paradas');
  assert.equal(fs.existsSync(path.join(dir, 'ativacao-freio.json')), true);
  fs.rmSync(dir, { recursive: true });
});
