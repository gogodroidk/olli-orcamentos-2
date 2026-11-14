// Lê a Central só para hash de telefone. Não grava contato e não manda mensagem.
import { execFileSync } from 'node:child_process';
import { hashes12, hashes64, soDigitos } from './telefone.mjs';

function absorverValor(valor, h12, h64) {
  const bruto = String(valor ?? '').trim();
  if (/^[0-9a-f]{12}$/i.test(bruto)) {
    h12.add(bruto.toLowerCase());
    return;
  }
  if (soDigitos(bruto).length < 10) return;
  for (const h of hashes12(bruto)) h12.add(h);
  for (const h of hashes64(bruto)) h64.add(h);
}

function camposTelefone(contato) {
  const sai = [];
  if (contato?.phone_number) sai.push(contato.phone_number);
  if (contato?.identifier) sai.push(contato.identifier);
  const extras = [contato?.custom_attributes, contato?.additional_attributes];
  for (const bloco of extras) {
    if (!bloco || typeof bloco !== 'object') continue;
    for (const [chave, valor] of Object.entries(bloco)) {
      if (!/phone|telefone|whatsapp|fone/i.test(chave)) continue;
      if (typeof valor === 'string') sai.push(valor);
    }
  }
  return sai;
}

export function hashesDePaginas(paginas) {
  const h12 = new Set();
  const h64 = new Set();
  const ids = new Set();
  let total = null;
  for (const pagina of paginas) {
    if (pagina?.meta?.count != null) total = Number(pagina.meta.count);
    const lista = Array.isArray(pagina?.payload) ? pagina.payload : [];
    for (const contato of lista) {
      if (contato?.id != null) ids.add(contato.id);
      for (const valor of camposTelefone(contato)) absorverValor(valor, h12, h64);
    }
  }
  if (total != null && ids.size < total) {
    const erro = new Error('central_incompleta');
    erro.lidos = ids.size;
    erro.total = total;
    throw erro;
  }
  return { h12, h64, contatos: ids.size };
}

export function pedirCw(pagina, exec = execFileSync) {
  const n = Number(pagina);
  if (!Number.isInteger(n) || n < 1 || n > 40) throw new Error('pagina_invalida');
  let saida = '';
  try {
    saida = exec('cw-api', ['GET', `/contacts?page=${n}`], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 8_000_000,
    });
  } catch {
    throw new Error('central_indisponivel');
  }
  try {
    return JSON.parse(String(saida || '').trim() || 'null');
  } catch {
    throw new Error('central_indisponivel');
  }
}

export async function hashesDaCentral({ pedir = pedirCw, pausa = () => new Promise((r) => setTimeout(r, 300)) } = {}) {
  const paginas = [];
  for (let n = 1; n <= 40; n += 1) {
    const pagina = await pedir(n);
    paginas.push(pagina);
    const lista = Array.isArray(pagina?.payload) ? pagina.payload : [];
    const total = Number(pagina?.meta?.count ?? 0);
    const lidos = paginas.reduce((s, p) => s + (Array.isArray(p?.payload) ? p.payload.length : 0), 0);
    if (!lista.length || lidos >= total) break;
    await pausa();
  }
  return hashesDePaginas(paginas);
}
