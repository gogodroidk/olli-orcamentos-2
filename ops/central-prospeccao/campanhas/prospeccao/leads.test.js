import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { lerProspects, lerHashesLog, montarLeads, motivoFora, hashesDeDoze, CSV_PADRAO, LOG_PADRAO } from './leads.mjs';
import { e164 } from '../../ativacao/telefones.mjs';
import { carregarHashes } from '../../ativacao/supressao.mjs';

test('a lista real tem 30 empresas e o nicho bate com o texto de cada uma', () => {
  const leads = lerProspects(fs.readFileSync(CSV_PADRAO, 'utf8'));
  assert.equal(leads.length, 30);
  const n = { refrigeracao: 0, eletrica: 0, predial: 0 };
  for (const lead of leads) {
    assert.ok(lead.telefone_e164.startsWith('+55'), lead.nome);
    assert.equal(lead.telefone_e164, e164(lead.telefone));
    assert.equal(lead.fonte, 'site');
    n[lead.nicho] += 1;
  }
  assert.deepEqual(n, { refrigeracao: 16, eletrica: 7, predial: 7 });
});

test('log antigo e supressão tiram o número, e o teste só aceita a casa', () => {
  const lead = {
    id: 'abc',
    nome: 'Oficina',
    telefone_e164: '+5511988887777',
    nicho: 'refrigeracao',
    nota: 4,
  };
  const hash = createHash('sha256').update('5511988887777').digest('hex').slice(0, 12);
  assert.ok(hashesDeDoze(lead.telefone_e164).has(hash));
  const base = { hashesCsv: new Set(), syncFresca: true, hashesLog: new Set() };
  assert.equal(motivoFora(lead, base), '');
  assert.equal(motivoFora(lead, { ...base, hashesLog: new Set([hash]) }), 'ja_no_log');
  assert.equal(motivoFora(lead, { ...base, teste: true }), 'teste_so_numero_da_casa');
  assert.equal(motivoFora({ ...lead, telefone_e164: '+5511986032309' }, base), 'numero_da_casa');
  assert.equal(motivoFora(lead, { ...base, syncFresca: false }), 'supressao_velha');
  assert.equal(motivoFora(lead, { ...base, etiquetas: ['parar-contato'] }), 'parar-contato');
  const log = lerHashesLog('data,hora,id_hash_contato,texto,resultado\n2026-10-23,11:00,' + hash + ',oi,enviado\n');
  const { fila, fora } = montarLeads([lead], { ...base, hashesLog: log });
  assert.equal(fila.length, 0);
  assert.equal(fora[0].motivo, 'ja_no_log');
});

test('nenhuma das 30 está na supressão nem no log de outubro', () => {
  const leads = lerProspects(fs.readFileSync(CSV_PADRAO, 'utf8'));
  const ctx = {
    hashesCsv: carregarHashes(),
    hashesLog: lerHashesLog(fs.readFileSync(LOG_PADRAO, 'utf8')),
    syncFresca: true,
    teste: false,
  };
  const { fila, fora } = montarLeads(leads, ctx);
  assert.equal(fila.length + fora.length, 30);
  assert.equal(fora.filter((f) => f.motivo === 'supressao_csv' || f.motivo === 'ja_no_log').length, 0);
  assert.equal(fila.length, 30);
});
