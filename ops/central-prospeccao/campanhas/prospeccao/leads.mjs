// Lê a lista pública e tira quem já foi chamado, quem está na supressão ou quem pediu para parar.
// Não imprime telefone. O id é os 12 primeiros do sha256 do E.164, o mesmo recorte do LOG.csv de outubro.
import { createHash } from 'node:crypto';
import { e164, ehNumeroDaCasa, telefoneSuprimido, variantes } from '../../ativacao/telefones.mjs';
import { nichoDe } from './mensagens.mjs';

export const CSV_PADRAO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-11-07-prospeccao-servicos/PROSPECTS.csv';
export const LOG_PADRAO = '/home/igor/Desktop/Entregas Claude/OLLI/2026-10-24-envios/LOG.csv';

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

export function motivoFora(lead, { hashesCsv, syncFresca, hashesLog, teste = false, etiquetas = [] } = {}) {
  if (!syncFresca) return 'supressao_velha';
  if (!(hashesCsv instanceof Set)) return 'supressao_ausente';
  if (!(hashesLog instanceof Set)) return 'log_ausente';
  if (!lead?.nome) return 'sem_empresa';
  const fone = lead.telefone_e164 || e164(lead.telefone);
  if (!fone) return 'sem_telefone';
  if (telefoneSuprimido(fone, hashesCsv)) return 'supressao_csv';
  for (const h of hashesDeDoze(fone)) if (hashesLog.has(h)) return 'ja_no_log';
  if (etiquetas.includes('parar-contato')) return 'parar-contato';
  if (teste && !ehNumeroDaCasa(fone)) return 'teste_so_numero_da_casa';
  if (!teste && ehNumeroDaCasa(fone)) return 'numero_da_casa';
  return '';
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
