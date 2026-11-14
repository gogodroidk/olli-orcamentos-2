// Telefone comercial brasileiro. A mesma conta do motor (variantes e E.164), para o hash bater.
// Não imprime número inteiro.
import { createHash } from 'node:crypto';

export const NUMERO_DA_CASA = '5511986032309';

export function soDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

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
  if (/^55\d{10}$/.test(d)) por(`${d.slice(0, 4)}9${d.slice(4)}`);
  return [...sai];
}

export function e164(valor) {
  const comPais = variantes(valor).filter((v) => v.startsWith('55'));
  const celular = comPais.find((v) => /^55\d{2}9\d{8}$/.test(v));
  const escolhido = celular || comPais[0];
  return escolhido ? `+${escolhido}` : '';
}

export function ehCelularBr(valor) {
  return /^55\d{2}9\d{8}$/.test(soDigitos(e164(valor)));
}

export function ehNumeroDaCasa(valor) {
  return variantes(valor).includes(NUMERO_DA_CASA);
}

export function mascara(valor) {
  const d = soDigitos(valor);
  if (d.length < 4) return '****';
  return `****${d.slice(-4)}`;
}

export function formatoComercial(valor) {
  let d = soDigitos(valor).replace(/^0+/, '');
  if (d.length === 11) d = `55${d}`;
  if (!/^55\d{2}9\d{8}$/.test(d)) return '';
  const ddd = d.slice(2, 4);
  const resto = d.slice(4);
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
}

export function sha256(texto) {
  return createHash('sha256').update(String(texto)).digest('hex');
}

export function hashes12(valor) {
  const sai = new Set();
  for (const v of variantes(valor)) {
    sai.add(sha256(v).slice(0, 12));
    if (v.startsWith('55')) sai.add(sha256(`+${v}`).slice(0, 12));
  }
  return sai;
}

export function hashes64(valor) {
  const sai = new Set();
  for (const v of variantes(valor)) {
    sai.add(sha256(v));
    if (v.startsWith('55')) sai.add(sha256(`+${v}`));
  }
  return sai;
}

export function dddDe(valor) {
  const d = soDigitos(e164(valor));
  return d.length >= 4 ? d.slice(2, 4) : '';
}

const RE_CELULAR = /(?:^|[^\d])(?:\+?55[\s.-]*)?\(?(\d{2})\)?[\s.-]*(9\d{4})[\s.-]?(\d{4})(?!\d)/g;
const RE_FIXO = /(?:^|[^\d])(?:\+?55[\s.-]*)?\(?(\d{2})\)?[\s.-]*([2-5]\d{3})[\s.-]?(\d{4})(?!\d)/g;
const RE_LINK = /(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|tel:\+?)(\d{12,13})/gi;
const CONTEXTO = /tel:|wa\.me|whatsapp|telefone|contato|comercial|atendimento|fale|"telephone"/;

function repetido(local) {
  return /^(\d)\1+$/.test(local);
}

/**
 * Celulares publicados como contato. Fixo fica de fora: o motor chama no WhatsApp.
 * O número precisa estar no HTML, perto de telefone/WhatsApp/contato, ou num link tel:/wa.me.
 */
export function celularesNoHtml(html) {
  const texto = String(html || '');
  const achados = [];
  const vistos = new Set();
  const guarda = (bruto, index, comprimento, viaLink) => {
    if (!ehCelularBr(bruto) || ehNumeroDaCasa(bruto)) return;
    const id = e164(bruto);
    if (vistos.has(id)) return;
    const local = soDigitos(id).slice(4);
    if (repetido(local)) return;
    const ini = Math.max(0, index - 160);
    const fim = Math.min(texto.length, index + comprimento + 80);
    const janela = texto.slice(ini, fim).toLowerCase();
    const perto = texto.slice(Math.max(0, index - 48), index + comprimento).toLowerCase();
    if (/meu celular|particular|pessoa f[ií]sica|\bcpf\b|propriet[aá]rio/.test(perto)) return;
    const contexto = viaLink || CONTEXTO.test(janela);
    if (!contexto) return;
    vistos.add(id);
    achados.push({ e164: id, viaLink });
  };
  for (const m of texto.matchAll(RE_LINK)) guarda(m[1], m.index, m[0].length, true);
  for (const m of texto.matchAll(RE_CELULAR)) guarda(`${m[1]}${m[2]}${m[3]}`, m.index, m[0].length, false);
  achados.sort((a, b) => Number(b.viaLink) - Number(a.viaLink));
  return achados;
}

/** Fixo publicado como contato. O motor chama no WhatsApp, então fixo não entra na fila. */
export function temFixoComercial(html) {
  const texto = String(html || '');
  for (const m of texto.matchAll(RE_FIXO)) {
    const ini = Math.max(0, m.index - 160);
    const fim = Math.min(texto.length, m.index + m[0].length + 80);
    const janela = texto.slice(ini, fim).toLowerCase();
    if (/meu celular|particular|pessoa f[ií]sica|\bcpf\b|propriet[aá]rio/.test(janela)) continue;
    if (CONTEXTO.test(janela)) return true;
  }
  return false;
}
