import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { lerProspects, lerHashesLog, lerReceita, montarLeads, motivoFora, hashesDeDoze, juntarProspects, CSV_PADRAO, LOG_PADRAO } from './leads.mjs';
import { e164, hashesDeTelefone } from '../../ativacao/telefones.mjs';
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

test('o csv automático entra no mesmo leitor e o nome repetido não duplica', () => {
  const base = lerProspects(fs.readFileSync(CSV_PADRAO, 'utf8'));
  const auto = [
    'nome,cidade,telefone comercial público,nota_precisa_kit,motivo_nota',
    'Oficina Nova,São Paulo - SP,(11) 98888-7777,4,hipótese: nicho:refrigeracao. site simples',
    `${base[0].nome},São Paulo - SP,(11) 97777-6666,4,hipótese: nicho:refrigeracao. repetida`,
  ].join('\n');
  const extras = lerProspects(auto);
  assert.equal(extras[0].nicho, 'refrigeracao');
  assert.equal(extras[0].fonte, 'site');
  assert.equal(extras[0].telefone_e164, '+5511988887777');
  const juntos = juntarProspects(base, extras);
  assert.equal(juntos.length, base.length + 1);
  assert.equal(juntos.filter((l) => l.nome === 'Oficina Nova').length, 1);
});

test('lista da receita entra como fonte receita e sem a central não sai', () => {
  const csv = [
    'cnpj;razao_social;nome_fantasia;cnae;cnae_descricao;municipio;uf;porte;data_abertura;canal;tipo_canal;fonte;data_fonte;nicho',
    '00000000000100;FRIA LTDA;Fria;4322302;ar;SAO PAULO;SP;EPP;2020-01-01;11988887777;celular;dados abertos Receita, arquivo de 2026-10;2026-11-14;refrigeracao',
    '00000000000200;SEM FONE;;4322302;ar;SAO PAULO;SP;ME;2020-01-01;dona@gmail.com;email;dados abertos Receita, arquivo de 2026-10;2026-11-14;refrigeracao',
    '00000000000300;FIXO LTDA;Fixo;4322302;ar;SAO PAULO;SP;EPP;2020-01-01;1133334444;fixo;dados abertos Receita, arquivo de 2026-10;2026-11-14;refrigeracao',
  ].join('\n');
  const leads = lerReceita(csv);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].fonte, 'receita');
  assert.equal(leads[0].nicho, 'refrigeracao');
  assert.equal(leads[0].nome, 'Fria');
  assert.equal(leads[0].telefone_e164, '+5511988887777');
  const base = { hashesCsv: new Set(), syncFresca: true, hashesLog: new Set() };
  assert.equal(motivoFora(leads[0], base), 'central_ausente');
  const hash = [...hashesDeTelefone(leads[0].telefone_e164)][0];
  assert.equal(motivoFora(leads[0], { ...base, hashesCentral: new Set([hash]) }), 'ja_na_central');
  assert.equal(motivoFora(leads[0], { ...base, hashesCentral: new Set() }), '');
  const juntos = juntarProspects([{ ...leads[0], fonte: 'site', nota: 4 }], leads);
  assert.equal(juntos.length, 1);
  assert.equal(juntos[0].fonte, 'site');
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
