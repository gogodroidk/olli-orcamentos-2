// Lê o CSV das 30, olha cada site e grava o relatório mascarado e o cache da lacuna.
// Não imprime telefone. Não envia mensagem.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { criarBusca } from './buscar.mjs';
import { carregarOfertas } from './catalogo.mjs';
import { gravarCache, lerCache, CACHE_PADRAO } from './cache.mjs';
import { diagnosticar } from './diagnostico.mjs';
import { relatorioMarkdown } from './relatorio.mjs';

export const CSV_PADRAO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-07-prospeccao-servicos/PROSPECTS.csv';
export const SAIDA_PADRAO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-14-agencia-ia/DIAGNOSTICO.md';

function argValor(nome, padrao) {
  const i = process.argv.indexOf(nome);
  if (i < 0 || !process.argv[i + 1]) return padrao;
  return process.argv[i + 1];
}

function partirCsv(linha) {
  const sai = [];
  let atual = '';
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') { aspas = !aspas; continue; }
    if (ch === ',' && !aspas) { sai.push(atual); atual = ''; continue; }
    atual += ch;
  }
  sai.push(atual);
  return sai;
}

export function e164Local(valor) {
  let d = String(valor ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return '';
  if (/^55\d{10}$/.test(d)) d = `${d.slice(0, 4)}9${d.slice(4)}`;
  return `+${d}`;
}

export function idLocal(telefone) {
  const e = e164Local(telefone);
  if (!e) return '';
  return createHash('sha256').update(e.replace('+', '')).digest('hex').slice(0, 12);
}

export function nichoLocal(nome, motivo = '') {
  const tag = String(motivo || '').match(/nicho:(refrigeracao|eletrica|predial)/i);
  if (tag) return tag[1].toLowerCase();
  const t = `${nome} ${motivo}`.toLowerCase();
  if (/el[eé]tric|electrik|eletricista/.test(t)) return 'eletrica';
  if (/refrigera|ar condicionado|climat|clima|cold/.test(t)) return 'refrigeracao';
  return 'predial';
}

export function lerLeadsCsv(texto, idDe = idLocal, nichoDe = nichoLocal) {
  const linhas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const cabeca = (linhas.shift() || '').split(',').map((c) => c.trim());
  const iNome = cabeca.indexOf('nome');
  const iCidade = cabeca.indexOf('cidade');
  const iSite = cabeca.indexOf('site');
  const iFone = cabeca.findIndex((c) => c.toLowerCase().startsWith('telefone'));
  const iMotivo = cabeca.indexOf('motivo_nota');
  if (iNome < 0) throw new Error('csv_sem_nome');
  const leads = [];
  for (const linha of linhas) {
    const col = partirCsv(linha);
    const nome = (col[iNome] || '').trim();
    const motivo = iMotivo >= 0 ? (col[iMotivo] || '').trim() : '';
    const telefone = iFone >= 0 ? (col[iFone] || '').trim() : '';
    leads.push({
      id: idDe(telefone),
      nome,
      cidade: iCidade >= 0 ? (col[iCidade] || '').trim() : '',
      site: iSite >= 0 ? (col[iSite] || '').trim() : '',
      nicho: nichoDe(nome, motivo),
    });
  }
  return leads;
}

export function cacheDe(rodada) {
  const itens = {};
  for (const item of rodada.itens || []) {
    if (!item.id) continue;
    itens[item.id] = item.diagnostico;
  }
  return { versao: 1, gerado: new Date().toISOString(), origem: rodada.origem || '', itens };
}

async function main() {
  const seco = process.argv.includes('--seco');
  const csv = argValor('--csv', CSV_PADRAO);
  const saida = argValor('--saida', SAIDA_PADRAO);
  const cache = argValor('--cache', CACHE_PADRAO);
  const intervalo = Number(argValor('--intervalo-ms', '2500')) || 2500;
  const leads = lerLeadsCsv(fs.readFileSync(csv, 'utf8'));
  if (seco) {
    console.log(`seco ${leads.length} empresas; sem rede`);
    return;
  }
  if (process.argv.includes('--de-cache')) {
    const dado = lerCache(cache);
    const itens = leads.map((lead) => ({
      ...lead,
      diagnostico: dado.itens?.[lead.id] || {
        principal: 'orcamento',
        evidencia: false,
        lacunas: ['orcamento'],
        ofertaId: '',
        servico: 0,
        ofertaNome: '',
        sinais: {},
      },
    }));
    const md = relatorioMarkdown(itens, { quando: dado.gerado || '', origem: dado.origem || '' });
    if (/\+55\d{8,}/.test(md) || /\(\d{2}\)\s?\d{4,5}-?\d{4}/.test(md)) throw new Error('relatorio_vazou_telefone');
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    fs.writeFileSync(saida, md);
    console.log(`relatório regravado de ${itens.length} empresas, sem rede`);
    return;
  }
  const catalogo = carregarOfertas();
  const busca = criarBusca({ intervaloMs: intervalo });
  const itens = [];
  for (const lead of leads) {
    const item = await diagnosticar(lead, busca, catalogo.ofertas);
    itens.push(item);
    console.error(`${itens.length}/${leads.length} ${item.diagnostico.principal} ${item.nome}`);
  }
  const rodada = { origem: catalogo.origem, itens };
  const dado = cacheDe(rodada);
  gravarCache(dado, cache);
  const md = relatorioMarkdown(rodada.itens, { quando: dado.gerado, origem: catalogo.origem });
  if (/\+55\d{8,}/.test(md) || /\(\d{2}\)\s?\d{4,5}-?\d{4}/.test(md)) throw new Error('relatorio_vazou_telefone');
  fs.mkdirSync(path.dirname(saida), { recursive: true });
  fs.writeFileSync(saida, md);
  console.log(`lidos ${rodada.itens.length}; páginas ${busca.usados()}; cache e relatório gravados`);
  for (const item of rodada.itens) {
    console.log(`${item.nicho} ${item.diagnostico.principal} ${item.diagnostico.ofertaId || '-'} ${item.nome}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro?.message || 'falha');
    process.exit(1);
  });
}
