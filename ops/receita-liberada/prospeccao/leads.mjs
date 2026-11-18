// Lê a lista pública e tira quem já foi chamado, quem está na supressão ou quem pediu para parar.
// Não imprime telefone. O id é os 12 primeiros do sha256 do E.164, o mesmo recorte do LOG.csv de outubro.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { e164, ehNumeroDaCasa, hashesDeTelefone, telefoneSuprimido, variantes } from '../../ativacao/telefones.mjs';
import { nichoDe } from './mensagens.mjs';

export const CSV_PADRAO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-07-prospeccao-servicos/PROSPECTS.csv';
export const CSV_AUTO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-14-leads-auto/PROSPECTS-AUTO.csv';
export const LOG_PADRAO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-10-24-envios/LOG.csv';
export const RECEITA_DIR = '/home/igor/dados-receita/listas/2026-11-14-liberada';
export const CENTRAL_HASHES = '/home/igor/chatwoot-central/data/central-telefones.sha256';

export function idDeTelefone(telefone) {
  const f = e164(telefone);
  if (!f) return '';
  return createHash('sha256').update(f.replace('+', '')).digest('hex').slice(0, 12);
}

export function hashesDeDoze(telefone) {
  const sai = new Set();
  for (const v of variantes(telefone)) {
    sai.add(createHash('sha256').update(v).digest('hex').slice(0, 12));
    if (v.startsWith('55')) sai.add(createHash('sha256').update(`+${v}`).digest('hex').slice(0, 12));
  }
  return sai;
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

export function lerProspects(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const cabeca = (linhas.shift() || '').split(',').map((c) => c.trim());
  const iNome = cabeca.indexOf('nome');
  const iCidade = cabeca.indexOf('cidade');
  const iFone = cabeca.findIndex((c) => c.toLowerCase().startsWith('telefone'));
  const iNota = cabeca.indexOf('nota_precisa_kit');
  const iMotivo = cabeca.indexOf('motivo_nota');
  if (iNome < 0 || iFone < 0) throw new Error('csv_sem_coluna');
  const leads = [];
  for (const linha of linhas) {
    const col = partirCsv(linha);
    const nome = (col[iNome] || '').trim();
    const telefone = (col[iFone] || '').trim();
    const motivo = iMotivo >= 0 ? (col[iMotivo] || '').trim() : '';
    const nota = Number(iNota >= 0 ? col[iNota] : 0);
    leads.push({
      id: idDeTelefone(telefone),
      nome,
      cidade: iCidade >= 0 ? (col[iCidade] || '').trim() : '',
      telefone,
      telefone_e164: e164(telefone),
      nicho: nichoDe(nome, motivo),
      nota: Number.isFinite(nota) ? nota : 0,
      fonte: 'site',
    });
  }
  return leads;
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

const ORDEM_NICHO = { refrigeracao: 0, eletrica: 1, predial: 2 };

export function ordenarLeads(leads) {
  return [...leads].sort((a, b) => {
    if (b.nota !== a.nota) return b.nota - a.nota;
    const na = ORDEM_NICHO[a.nicho] ?? 9;
    const nb = ORDEM_NICHO[b.nicho] ?? 9;
    if (na !== nb) return na - nb;
    return String(a.nome).localeCompare(String(b.nome), 'pt');
  });
}

export function motivoFora(lead, { hashesCsv, syncFresca, hashesLog, hashesCentral = null, teste = false, etiquetas = [] } = {}) {
  if (!syncFresca) return 'supressao_velha';
  if (!(hashesCsv instanceof Set)) return 'supressao_ausente';
  if (!(hashesLog instanceof Set)) return 'log_ausente';
  if (!lead?.nome) return 'sem_empresa';
  const fone = lead.telefone_e164 || e164(lead.telefone);
  if (!fone) return 'sem_telefone';
  // 13/11 (Maestro): no modo teste só vale o número da casa, e ele está no LOG de outubro por testes internos;
  // sem este atalho o teste das 09:20 era descartado como "ja_no_log" e a prospecção nunca ligava.
  if (teste) return ehNumeroDaCasa(fone) ? '' : 'teste_so_numero_da_casa';
  if (telefoneSuprimido(fone, hashesCsv)) return 'supressao_csv';
  for (const h of hashesDeDoze(fone)) if (hashesLog.has(h)) return 'ja_no_log';
  if (etiquetas.includes('parar-contato')) return 'parar-contato';
  if (teste && !ehNumeroDaCasa(fone)) return 'teste_so_numero_da_casa';
  if (!teste && ehNumeroDaCasa(fone)) return 'numero_da_casa';
  if (lead?.fonte === 'receita') {
    if (!(hashesCentral instanceof Set)) return 'central_ausente';
    for (const h of hashesDeTelefone(fone)) if (hashesCentral.has(h)) return 'ja_na_central';
  }
  return '';
}

function chaveNome(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/a|sa)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function juntarProspects(base, extra) {
  const ids = new Set();
  const nomes = new Set();
  const sai = [];
  for (const lead of [...(base || []), ...(extra || [])]) {
    const nome = chaveNome(lead?.nome);
    if (lead?.id && ids.has(lead.id)) continue;
    if (nome && nomes.has(nome)) continue;
    sai.push(lead);
    if (lead?.id) ids.add(lead.id);
    if (nome) nomes.add(nome);
  }
  return sai;
}

export function lerHashesCentral(texto) {
  const hashes = new Set();
  for (const linha of String(texto ?? '').split(/\r?\n/)) {
    const h = linha.trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(h)) hashes.add(h);
  }
  return hashes;
}

export function lerHashesCentralDoDisco(caminho = CENTRAL_HASHES) {
  try {
    return lerHashesCentral(fs.readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
}

function partirDelimitado(linha, sep) {
  const sai = [];
  let atual = '';
  let aspas = false;
  for (const ch of linha) {
    if (ch === '"') { aspas = !aspas; continue; }
    if (ch === sep && !aspas) { sai.push(atual); atual = ''; continue; }
    atual += ch;
  }
  sai.push(atual);
  return sai;
}

function colunasReceita(cabeca) {
  const i = (nome) => cabeca.findIndex((c) => c.trim().toLowerCase() === nome);
  return {
    cnpj: i('cnpj'),
    razao: i('razao_social'),
    fantasia: i('nome_fantasia'),
    mun: i('municipio'),
    uf: i('uf'),
    canal: i('canal'),
    tipo: i('tipo_canal'),
    nicho: i('nicho'),
    fonte: i('fonte'),
  };
}

export function lerReceita(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (!linhas.length) return [];
  const cabeca = partirDelimitado(linhas.shift(), ';').map((c) => c.trim());
  if (!cabeca.includes('razao_social') || !cabeca.includes('canal')) return [];
  const col = colunasReceita(cabeca);
  const leads = [];
  for (const linha of linhas) {
    const p = partirDelimitado(linha, ';');
    const tipo = col.tipo >= 0 ? (p[col.tipo] || '') : '';
    // Fixo fica na lista da Receita para ligação humana. O motor é WhatsApp:
    // o e164 coloca o 9 em todo número de 8 dígitos, e isso mudaria o fixo de pessoa.
    if (!/^celular/.test(tipo)) continue;
    const telefone = (p[col.canal] || '').trim();
    const fone = e164(telefone);
    if (!fone) continue;
    const razao = col.razao >= 0 ? (p[col.razao] || '').trim() : '';
    const fantasia = col.fantasia >= 0 ? (p[col.fantasia] || '').trim() : '';
    const nome = fantasia || razao;
    const municipio = col.mun >= 0 ? (p[col.mun] || '').trim() : '';
    const uf = col.uf >= 0 ? (p[col.uf] || '').trim() : '';
    const nichoCol = col.nicho >= 0 ? (p[col.nicho] || '').trim() : '';
    leads.push({
      id: idDeTelefone(telefone),
      nome,
      cidade: [municipio, uf].filter(Boolean).join(' - '),
      telefone,
      telefone_e164: fone,
      nicho: nichoCol || nichoDe(nome, ''),
      nota: 1,
      fonte: 'receita',
    });
  }
  return leads;
}

export function lerReceitaDoDisco(dir = RECEITA_DIR) {
  if (!dir || !fs.existsSync(dir)) return [];
  const nomes = fs.readdirSync(dir).filter((n) => n.endsWith('.csv') && n !== 'contagem.csv').sort();
  const partes = [];
  for (const nome of nomes) {
    partes.push(...lerReceita(fs.readFileSync(`${dir}/${nome}`, 'utf8')));
  }
  return juntarProspects([], partes);
}

export function lerProspectsDoDisco(principal = CSV_PADRAO, auto = CSV_AUTO, receita = RECEITA_DIR) {
  const base = lerProspects(fs.readFileSync(principal, 'utf8'));
  let juntos = base;
  if (auto && fs.existsSync(auto)) {
    const texto = fs.readFileSync(auto, 'utf8').trim();
    if (texto) juntos = juntarProspects(base, lerProspects(texto));
  }
  return juntarProspects(juntos, lerReceitaDoDisco(receita));
}

export function montarLeads(leads, ctx) {
  const fila = [];
  const fora = [];
  for (const lead of ordenarLeads(leads)) {
    const motivo = motivoFora(lead, ctx);
    if (motivo) fora.push({ id: lead.id, motivo });
    else fila.push(lead);
  }
  return { fila, fora };
}

export function leadDeTeste() {
  return {
    id: 'teste-casa',
    nome: 'Casa',
    cidade: 'São Paulo - SP',
    telefone: '+5511986032309',
    telefone_e164: '+5511986032309',
    nicho: 'refrigeracao',
    nota: 0,
    fonte: 'teste interno',
  };
}
