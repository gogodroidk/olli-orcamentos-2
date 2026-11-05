/**
 * Regras PURAS da edição (e da criação manual) dos dados da OS.
 *
 * O dia sem hora usa a sentinela de `isoDoDiaSemHora` (meio-dia UTC + 1s): a tela
 * não mostra um "às 09:00" que ninguém escolheu. Data inválida não vira outra data.
 * O patch sempre traz as sete chaves, para um campo esvaziado apagar o que estava
 * gravado (`undefined` cai em NULL no save) sem mexer em status, checklist, fotos,
 * técnico, garantia, encerramento, materiais, número ou orçamento de origem.
 */
import { dataBrParaIsoSeguro } from './date.ts';
import { ehDiaSemHora, isoDoDiaSemHora } from './ordemServicoDoOrcamento.ts';

export const LIMITE_CLIENTE = 120;
export const LIMITE_TITULO = 140;
export const LIMITE_DESCRICAO = 4000;
export const LIMITE_OBSERVACOES = 2000;
export const VALOR_MAXIMO = 999_999_999.99;

export const ERRO_HORA_INVALIDA = 'Hora inválida.';

export type CampoErroOS = 'cliente' | 'titulo' | 'descricao' | 'observacoes' | 'data' | 'valor';

/** O que a tela manda. `data` é DD/MM/AAAA ou AAAA-MM-DD; `hora` é H:mm, opcional. */
export interface EntradaDadosOS {
  clienteId?: string | null;
  clienteNome?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  observacoes?: string | null;
  data?: string | null;
  hora?: string | null;
  valor?: number | string | null;
}

/** Sete campos, sempre presentes. `undefined` significa "apagar". */
export interface PatchDadosOS {
  clienteId?: string;
  clienteNome: string;
  titulo: string;
  descricao?: string;
  observacoes?: string;
  dataAgendada?: string;
  valor?: number;
}

export type ResultadoDadosOS =
  | { ok: true; patch: PatchDadosOS }
  | { ok: false; erros: Partial<Record<CampoErroOS, string>> };

function textoObrigatorio(
  bruto: string | null | undefined,
  limite: number,
): { ok: true; valor: string } | { ok: false; vazio: boolean } {
  const t = (bruto ?? '').trim();
  if (!t) return { ok: false, vazio: true };
  if (t.length > limite) return { ok: false, vazio: false };
  return { ok: true, valor: t };
}

function textoOpcional(
  bruto: string | null | undefined,
  limite: number,
): { ok: true; valor?: string } | { ok: false } {
  const t = (bruto ?? '').trim();
  if (!t) return { ok: true, valor: undefined };
  if (t.length > limite) return { ok: false };
  return { ok: true, valor: t };
}

/** AAAA-MM-DD civil, ou null se o dia não existe (31/02, 29/02 fora do bissexto). */
function diaCivil(texto: string): string | null {
  const t = texto.trim();
  const br = /^\d{4}-\d{2}-\d{2}$/.test(t) ? t.split('-').reverse().join('/') : t;
  const iso = dataBrParaIsoSeguro(br);
  return iso ? iso.slice(0, 10) : null;
}

function lerHora(texto: string): { hh: number; mm: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(texto.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = m[3] === undefined ? 0 : Number(m[3]);
  if (hh > 23 || mm > 59 || ss !== 0) return null;
  return { hh, mm };
}

function resolverQuando(
  dataBruta: string | null | undefined,
  horaBruta: string | null | undefined,
): { ok: true; dataAgendada?: string } | { ok: false; erro: string } {
  const dataTxt = (dataBruta ?? '').trim();
  const horaTxt = (horaBruta ?? '').trim();
  if (!dataTxt && !horaTxt) return { ok: true, dataAgendada: undefined };
  if (!dataTxt) return { ok: false, erro: 'Informe o dia da visita.' };
  const civil = diaCivil(dataTxt);
  if (!civil) return { ok: false, erro: 'Data inválida.' };
  if (!horaTxt) {
    const sentinela = isoDoDiaSemHora(`${civil}T12:00:00.000Z`);
    if (!sentinela) return { ok: false, erro: 'Data inválida.' };
    return { ok: true, dataAgendada: sentinela };
  }
  const hora = lerHora(horaTxt);
  if (!hora) return { ok: false, erro: ERRO_HORA_INVALIDA };
  const [ys, ms, ds] = civil.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  // Componentes locais, nunca `new Date('AAAA-MM-DDTHH:mm')` (o dia só-data vira UTC).
  const local = new Date(y, m - 1, d, hora.hh, hora.mm, 0, 0);
  const bate = local.getFullYear() === y
    && local.getMonth() === m - 1
    && local.getDate() === d
    && local.getHours() === hora.hh
    && local.getMinutes() === hora.mm;
  if (!bate) return { ok: false, erro: 'Data inválida.' };
  return { ok: true, dataAgendada: local.toISOString() };
}

function lerValor(bruto: number | string | null | undefined): { ok: true; valor?: number } | { ok: false; alto?: boolean } {
  if (bruto === undefined || bruto === null) return { ok: true };
  if (typeof bruto === 'number') {
    if (!Number.isFinite(bruto) || bruto < 0) return { ok: false };
    if (bruto === 0) return { ok: true };
    if (bruto > VALOR_MAXIMO) return { ok: false, alto: true };
    return { ok: true, valor: bruto };
  }
  const t = bruto.trim();
  if (t === '' || t === '0') return { ok: true };
  if (!/^\d+([.,]\d+)?$/.test(t)) return { ok: false };
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  if (n === 0) return { ok: true };
  if (n > VALOR_MAXIMO) return { ok: false, alto: true };
  return { ok: true, valor: n };
}

export function validarDadosOS(entrada: EntradaDadosOS): ResultadoDadosOS {
  const erros: Partial<Record<CampoErroOS, string>> = {};

  const cliente = textoObrigatorio(entrada.clienteNome, LIMITE_CLIENTE);
  if (!cliente.ok) {
    erros.cliente = cliente.vazio ? 'Informe o nome do cliente.' : `Use no máximo ${LIMITE_CLIENTE} caracteres.`;
  }
  const titulo = textoObrigatorio(entrada.titulo, LIMITE_TITULO);
  if (!titulo.ok) {
    erros.titulo = titulo.vazio ? 'Informe o título.' : `Use no máximo ${LIMITE_TITULO} caracteres.`;
  }
  const descricao = textoOpcional(entrada.descricao, LIMITE_DESCRICAO);
  if (!descricao.ok) erros.descricao = `Use no máximo ${LIMITE_DESCRICAO} caracteres.`;
  const observacoes = textoOpcional(entrada.observacoes, LIMITE_OBSERVACOES);
  if (!observacoes.ok) erros.observacoes = `Use no máximo ${LIMITE_OBSERVACOES} caracteres.`;

  const quando = resolverQuando(entrada.data, entrada.hora);
  if (!quando.ok) erros.data = quando.erro;

  const valor = lerValor(entrada.valor);
  if (!valor.ok) erros.valor = valor.alto ? 'Valor alto demais.' : 'Valor inválido.';

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  const clienteId = (entrada.clienteId ?? '').trim() || undefined;
  const patch: PatchDadosOS = {
    clienteId,
    clienteNome: cliente.ok ? cliente.valor : '',
    titulo: titulo.ok ? titulo.valor : '',
    descricao: descricao.ok ? descricao.valor : undefined,
    observacoes: observacoes.ok ? observacoes.valor : undefined,
    dataAgendada: quando.ok ? quando.dataAgendada : undefined,
    valor: valor.ok ? valor.valor : undefined,
  };
  return { ok: true, patch };
}

/** ISO da OS → campos do formulário, no calendário LOCAL. Dia-sentinela não traz hora. */
export function partesDaDataAgendada(iso?: string | null): { data: string; hora: string } {
  if (!iso) return { data: '', hora: '' };
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return { data: '', hora: '' };
  const p = (n: number) => String(n).padStart(2, '0');
  const data = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (ehDiaSemHora(iso)) return { data, hora: '' };
  return { data, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
