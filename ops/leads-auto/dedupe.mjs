// Cruza hash com a lista de 07/11, o LOG de outubro, a supressão e a Central.
// A supressão é só o CSV de hash. A base de CNPJ da Receita não entra.
import fs from 'node:fs';
import { hostDe } from './fontes.mjs';
import { chaveNome, lerTabela, partirCsv } from './csv.mjs';
import { hashes12, hashes64 } from './telefone.mjs';

export function vazio() {
  return {
    lista12: new Set(),
    lista64: new Set(),
    listaNomes: new Set(),
    listaDominios: new Set(),
    log12: new Set(),
    supressao64: new Set(),
    central12: new Set(),
    central64: new Set(),
    auto12: new Set(),
    autoNomes: new Set(),
    autoDominios: new Set(),
    vistos: new Set(),
  };
}

function absoluto(site) {
  const s = String(site || '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function absorverTelefone(valor, h12, h64) {
  for (const h of hashes12(valor)) h12.add(h);
  for (const h of hashes64(valor)) h64.add(h);
}

export function lerHashesLog(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim());
  const cabeca = partirCsv(linhas.shift() || '').map((c) => c.trim());
  const col = cabeca.indexOf('id_hash_contato');
  const hashes = new Set();
  if (col < 0) return hashes;
  for (const linha of linhas) {
    const h = (partirCsv(linha)[col] || '').trim().toLowerCase();
    if (/^[0-9a-f]{12}$/.test(h)) hashes.add(h);
  }
  return hashes;
}

export function lerSupressao(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim());
  const cabeca = (linhas.shift() || '').split(',').map((c) => c.trim().toLowerCase());
  const col = cabeca.indexOf('sha256');
  if (col < 0) throw new Error('supressao_sem_coluna_sha256');
  const hashes = new Set();
  for (const linha of linhas) {
    const h = (linha.split(',')[col] || '').trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(h)) hashes.add(h);
  }
  return hashes;
}

function exigirForaDaBase(caminho) {
  if (String(caminho).includes('dados-receita') && !String(caminho).endsWith('supressao-telefones.csv')) {
    throw new Error('base_receita_proibida');
  }
}

function lerObrigatorio(caminho) {
  exigirForaDaBase(caminho);
  if (!fs.existsSync(caminho)) throw new Error(`fonte_ausente:${caminho}`);
  return fs.readFileSync(caminho, 'utf8');
}

export function carregarDedupe(caminhos, { central = { h12: new Set(), h64: new Set() } } = {}) {
  const dedupe = vazio();
  const lista = lerTabela(lerObrigatorio(caminhos.prospects));
  for (const linha of lista) {
    absorverTelefone(linha.telefone, dedupe.lista12, dedupe.lista64);
    const nome = chaveNome(linha.nome);
    if (nome) dedupe.listaNomes.add(nome);
    const host = hostDe(absoluto(linha.site));
    if (host) dedupe.listaDominios.add(host);
  }
  dedupe.log12 = lerHashesLog(lerObrigatorio(caminhos.log));
  dedupe.supressao64 = lerSupressao(lerObrigatorio(caminhos.supressao));
  dedupe.central12 = central.h12 || new Set();
  dedupe.central64 = central.h64 || new Set();
  if (caminhos.auto && fs.existsSync(caminhos.auto)) {
    for (const linha of lerTabela(fs.readFileSync(caminhos.auto, 'utf8'))) {
      for (const h of hashes12(linha.telefone)) dedupe.auto12.add(h);
      const nome = chaveNome(linha.nome);
      if (nome) dedupe.autoNomes.add(nome);
      const host = hostDe(absoluto(linha.site));
      if (host) dedupe.autoDominios.add(host);
    }
  }
  return dedupe;
}

export function motivoDedupe(dedupe, { telefone, nome, dominio }) {
  const nomeChave = chaveNome(nome);
  const h12 = telefone ? hashes12(telefone) : new Set();
  const h64 = telefone ? hashes64(telefone) : new Set();
  const tem = (set, hashes) => {
    for (const h of hashes) if (set.has(h)) return true;
    return false;
  };
  if ((nomeChave && dedupe.listaNomes.has(nomeChave)) || (dominio && dedupe.listaDominios.has(dominio)) || tem(dedupe.lista12, h12)) {
    return 'ja_na_lista';
  }
  if (tem(dedupe.log12, h12)) return 'ja_no_log';
  if (tem(dedupe.supressao64, h64)) return 'supressao';
  if (tem(dedupe.central12, h12) || tem(dedupe.central64, h64)) return 'ja_na_central';
  if ((nomeChave && dedupe.autoNomes.has(nomeChave)) || (dominio && dedupe.autoDominios.has(dominio)) || tem(dedupe.auto12, h12)) {
    return 'ja_no_auto';
  }
  if (dominio && dedupe.vistos.has(dominio)) return 'dominio_ja_visto';
  return '';
}
