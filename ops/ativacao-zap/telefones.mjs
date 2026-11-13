// Telefone brasileiro para a ativação. Sem rede. Não imprime número inteiro.
import { createHash } from 'node:crypto';

export const NUMERO_DA_CASA = '5511986032309';

export function soDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Variantes com e sem 55 e com e sem o 9 do celular. Só entra número BR válido. */
export function variantes(valor) {
  let d = soDigitos(valor).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  const sai = new Set();
  const por = (n) => {
    if (!/^55\d{10,11}$/.test(n)) return;
    sai.add(n);
    sai.add(n.slice(2));
  };
  por(d);
  if (/^55\d{2}9\d{8}$/.test(d)) por(d.slice(0, 4) + d.slice(5));
  if (/^55\d{10}$/.test(d)) por(d.slice(0, 4) + '9' + d.slice(4));
  return [...sai];
}

/** +55… com o 9 quando o número é celular. Vazio se não for BR. */
export function e164(valor) {
  const comPais = variantes(valor).filter((v) => v.startsWith('55'));
  const celular = comPais.find((v) => /^55\d{2}9\d{8}$/.test(v));
  const escolhido = celular || comPais[0];
  return escolhido ? `+${escolhido}` : '';
}

export function mascara(valor) {
  const d = soDigitos(valor);
  if (d.length < 4) return '****';
  return `****${d.slice(-4)}`;
}

export function ehNumeroDaCasa(valor) {
  return variantes(valor).includes(NUMERO_DA_CASA);
}

/** sha256 das variantes (dígitos e +E.164). Serve para bater com supressao-telefones.csv. */
export function hashesDeTelefone(valor) {
  const hashes = new Set();
  for (const v of variantes(valor)) {
    hashes.add(createHash('sha256').update(v).digest('hex'));
    if (v.startsWith('55')) hashes.add(createHash('sha256').update(`+${v}`).digest('hex'));
  }
  return hashes;
}

export function telefoneSuprimido(valor, hashesCsv) {
  if (!hashesCsv || hashesCsv.size === 0) return false;
  for (const h of hashesDeTelefone(valor)) if (hashesCsv.has(h)) return true;
  return false;
}
