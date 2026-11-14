// CSV no formato que leads.mjs já lê. Telefone só entra na gravação do motor, nunca no relatório.

export const COLUNAS = [
  'nome',
  'cidade',
  'site',
  'Instagram',
  'telefone comercial público',
  'onde foi visto (link)',
  'data da coleta',
  'nota_precisa_kit',
  'motivo_nota',
];

export function partirCsv(linha) {
  const sai = [];
  let atual = '';
  let aspas = false;
  for (const ch of String(linha)) {
    if (ch === '"') {
      aspas = !aspas;
      continue;
    }
    if (ch === ',' && !aspas) {
      sai.push(atual);
      atual = '';
      continue;
    }
    atual += ch;
  }
  sai.push(atual);
  return sai;
}

export function celula(valor) {
  const texto = String(valor ?? '');
  if (/[",\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function dataColeta(agora = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return fmt.format(agora);
}

export function linhaProspect(lead) {
  const mapa = {
    nome: lead.nome,
    cidade: lead.cidade,
    site: lead.site,
    Instagram: '',
    'telefone comercial público': lead.telefone,
    'onde foi visto (link)': lead.onde,
    'data da coleta': lead.data,
    nota_precisa_kit: lead.nota,
    motivo_nota: lead.motivo,
  };
  return COLUNAS.map((c) => celula(mapa[c])).join(',');
}

export function textoCsv(leads) {
  return `${[COLUNAS.join(','), ...leads.map(linhaProspect)].join('\n')}\n`;
}

export function lerTabela(texto) {
  const linhas = String(texto ?? '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  const cabeca = partirCsv(linhas.shift() || '').map((c) => c.trim());
  const iNome = cabeca.indexOf('nome');
  const iCidade = cabeca.indexOf('cidade');
  const iSite = cabeca.indexOf('site');
  const iFone = cabeca.findIndex((c) => c.toLowerCase().startsWith('telefone'));
  const iOnde = cabeca.findIndex((c) => c.toLowerCase().startsWith('onde foi visto'));
  const iData = cabeca.findIndex((c) => c.toLowerCase().startsWith('data da coleta'));
  const iNota = cabeca.indexOf('nota_precisa_kit');
  const iMotivo = cabeca.indexOf('motivo_nota');
  if (iNome < 0 || iFone < 0) throw new Error('csv_sem_coluna');
  return linhas.map((linha) => {
    const col = partirCsv(linha);
    return {
      nome: (col[iNome] || '').trim(),
      cidade: iCidade >= 0 ? (col[iCidade] || '').trim() : '',
      site: iSite >= 0 ? (col[iSite] || '').trim() : '',
      telefone: (col[iFone] || '').trim(),
      onde: iOnde >= 0 ? (col[iOnde] || '').trim() : '',
      data: iData >= 0 ? (col[iData] || '').trim() : '',
      nota: iNota >= 0 ? (col[iNota] || '').trim() : '',
      motivo: iMotivo >= 0 ? (col[iMotivo] || '').trim() : '',
    };
  }).filter((l) => l.nome || l.telefone);
}

export function chaveNome(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/a|sa)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
