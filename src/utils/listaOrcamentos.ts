/**
 * Filtro e ordem da lista de orçamentos — uma regra só para o celular
 * (SQL paginado), o desktop do app e o painel.
 *
 * Data:
 *  - `instante`: o dia é o do fuso do aparelho em cima de um ISO (`criadoEm`
 *    gravado com `toISOString`). É a data que o card do app mostra.
 *  - `texto`: o dia são os 10 primeiros caracteres (AAAA-MM-DD), sem deslocar
 *    pelo fuso. É a coluna "Emissão" do painel.
 *
 * A ordem SQL só sai de uma lista fechada. Texto do usuário nunca entra no
 * ORDER BY — no máximo vira parâmetro `?`.
 */
import { semAcentoLower, semAcentoLowerSql } from '../database/consultasSql.ts';

export type PeriodoLista = 'todos' | 'hoje' | '7d' | '30d' | 'mes';

export type CampoOrdemLista = 'data' | 'valor' | 'cliente' | 'numero' | 'status';

export type DirecaoOrdemLista = 'asc' | 'desc';

export interface OrdemLista {
  campo: CampoOrdemLista;
  direcao: DirecaoOrdemLista;
}

export const ORDEM_PADRAO: OrdemLista = { campo: 'data', direcao: 'desc' };

export type ModoDataLista = 'instante' | 'texto';

/** Ordem do funil comercial. Status desconhecido fica no fim. */
export const ORDEM_FUNIL_STATUS = [
  'rascunho',
  'enviado',
  'visualizado',
  'em_negociacao',
  'aguardando_assinatura',
  'aprovado',
  'recusado',
  'expirado',
  'cancelado',
  'convertido',
] as const;

export const PERIODOS_LISTA: ReadonlyArray<{ id: PeriodoLista; rotulo: string }> = [
  { id: 'todos', rotulo: 'Qualquer data' },
  { id: 'hoje', rotulo: 'Hoje' },
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Este mês' },
];

export const ORDENS_LISTA: ReadonlyArray<OrdemLista & { rotulo: string }> = [
  { campo: 'data', direcao: 'desc', rotulo: 'Mais recentes' },
  { campo: 'data', direcao: 'asc', rotulo: 'Mais antigos' },
  { campo: 'valor', direcao: 'desc', rotulo: 'Maior valor' },
  { campo: 'valor', direcao: 'asc', rotulo: 'Menor valor' },
  { campo: 'cliente', direcao: 'asc', rotulo: 'Cliente (A–Z)' },
  { campo: 'cliente', direcao: 'desc', rotulo: 'Cliente (Z–A)' },
  { campo: 'status', direcao: 'asc', rotulo: 'Status (funil)' },
  { campo: 'numero', direcao: 'desc', rotulo: 'Maior número' },
];

export function rotuloOrdem(ordem: OrdemLista | undefined): string {
  const atual = ordem ?? ORDEM_PADRAO;
  return ORDENS_LISTA.find((o) => o.campo === atual.campo && o.direcao === atual.direcao)?.rotulo ?? 'Mais recentes';
}

export function chaveOrdem(ordem: OrdemLista | undefined): string {
  const atual = ordem ?? ORDEM_PADRAO;
  return `${atual.campo}:${atual.direcao}`;
}

export function ordemPelaChave(chave: string): OrdemLista {
  const achada = ORDENS_LISTA.find((o) => chaveOrdem(o) === chave);
  return achada ? { campo: achada.campo, direcao: achada.direcao } : ORDEM_PADRAO;
}

/** Troca a direção se o campo já está ativo; senão entra na direção natural dele. */
export function alternarCampoOrdem(atual: OrdemLista | undefined, campo: CampoOrdemLista): OrdemLista {
  const vigente = atual ?? ORDEM_PADRAO;
  if (vigente.campo === campo) {
    return { campo, direcao: vigente.direcao === 'asc' ? 'desc' : 'asc' };
  }
  const natural = ORDENS_LISTA.find((o) => o.campo === campo);
  return { campo, direcao: natural?.direcao ?? 'desc' };
}

export interface LimitesInstante {
  inicio: Date;
  /** Exclusivo: o primeiro instante que já não entra. */
  fim: Date;
}

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Janela do período no fuso local de `agora`.
 * 7 dias e 30 dias incluem hoje. "Este mês" vai até o fim do mês (emissão
 * futura dentro do mês continua aparecendo).
 */
export function limitesInstante(periodo: PeriodoLista, agora: Date): LimitesInstante | null {
  if (periodo === 'todos') return null;
  const hoje = inicioDoDia(agora);
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  if (periodo === 'hoje') return { inicio: hoje, fim: amanha };
  if (periodo === '7d') {
    return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6), fim: amanha };
  }
  if (periodo === '30d') {
    return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29), fim: amanha };
  }
  if (periodo === 'mes') {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
    return { inicio, fim };
  }
  return null;
}

function diaTexto(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m ? m[1] : null;
}

function diaLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}

export function passaPeriodo(
  iso: string | null | undefined,
  periodo: PeriodoLista | undefined,
  agora: Date,
  modo: ModoDataLista,
): boolean {
  if (!periodo || periodo === 'todos') return true;
  if (modo === 'texto') {
    const dia = diaTexto(iso);
    if (!dia) return false;
    const limites = limitesInstante(periodo, agora);
    if (!limites) return true;
    const de = diaLocal(limites.inicio);
    const ate = diaLocal(new Date(limites.fim.getTime() - 1));
    return dia >= de && dia <= ate;
  }
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const limites = limitesInstante(periodo, agora);
  if (!limites) return true;
  return t >= limites.inicio.getTime() && t < limites.fim.getTime();
}

export function instanteNoPeriodo(iso: string | null | undefined, periodo: PeriodoLista, agora: Date): boolean {
  return passaPeriodo(iso, periodo, agora, 'instante');
}

export interface LeituraValor {
  valor?: number;
  invalido: boolean;
}

/**
 * Lê o que a pessoa digitou no filtro de valor.
 * Vazio = sem limite. "1.500,50", "1500.50" e "R$ 1.500" valem.
 * "1.500" (ponto de milhar, sem vírgula) vale 1500. Texto que não é número
 * é inválido — a lista fica vazia em vez de ignorar o que foi digitado.
 */
export function lerValorFiltro(texto: string): LeituraValor {
  const bruto = texto.trim();
  if (!bruto) return { invalido: false };
  if (bruto.includes('-')) return { invalido: true };
  const semMoeda = bruto.replace(/[^\d,.]/g, '');
  if (!semMoeda || semMoeda === ',' || semMoeda === '.') return { invalido: true };
  let normal = semMoeda;
  if (normal.includes(',')) {
    normal = normal.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normal)) {
    normal = normal.replace(/\./g, '');
  }
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0) return { invalido: true };
  return { valor: n, invalido: false };
}

export function faixaValor(min: number | undefined, max: number | undefined): { lo?: number; hi?: number } {
  let lo = min != null && Number.isFinite(min) ? min : undefined;
  let hi = max != null && Number.isFinite(max) ? max : undefined;
  if (lo != null && hi != null && lo > hi) {
    const troca = lo;
    lo = hi;
    hi = troca;
  }
  return { lo, hi };
}

export function passaValor(valor: number | null | undefined, min: number | undefined, max: number | undefined): boolean {
  const { lo, hi } = faixaValor(min, max);
  const v = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  if (lo != null && v < lo) return false;
  if (hi != null && v > hi) return false;
  return true;
}

export interface ClausulasLista {
  /** Vazio quando não há período nem valor. `0` quando o valor digitado não é número. */
  sql: string;
  params: (string | number)[];
}

export function clausulasPeriodoValor(filtro: {
  periodo?: PeriodoLista;
  agora?: Date;
  valorMin?: number;
  valorMax?: number;
  valorInvalido?: boolean;
}): ClausulasLista {
  if (filtro.valorInvalido) return { sql: '0', params: [] };
  const partes: string[] = [];
  const params: (string | number)[] = [];
  if (filtro.periodo && filtro.periodo !== 'todos') {
    const limites = limitesInstante(filtro.periodo, filtro.agora ?? new Date());
    if (limites) {
      partes.push("json_extract(data, '$.criadoEm') >= ? AND json_extract(data, '$.criadoEm') < ?");
      params.push(limites.inicio.toISOString(), limites.fim.toISOString());
    }
  }
  const { lo, hi } = faixaValor(filtro.valorMin, filtro.valorMax);
  if (lo != null) {
    partes.push("CAST(json_extract(data, '$.valorTotal') AS REAL) >= ?");
    params.push(lo);
  }
  if (hi != null) {
    partes.push("CAST(json_extract(data, '$.valorTotal') AS REAL) <= ?");
    params.push(hi);
  }
  return { sql: partes.join(' AND '), params };
}

function sqlCaseStatus(): string {
  const casos = ORDEM_FUNIL_STATUS.map((status, i) => `WHEN '${status}' THEN ${i}`).join(' ');
  return `CASE json_extract(data, '$.status') ${casos} ELSE 99 END`;
}

/** Fragmento ORDER BY já com direção. Nunca interpola texto livre. */
export function ordemSqlLista(ordem?: { campo?: string; direcao?: string } | null): string {
  const campo = ordem?.campo;
  const direcao = ordem?.direcao === 'asc' ? 'ASC' : 'DESC';
  switch (campo) {
    case 'valor':
      return `CAST(json_extract(data, '$.valorTotal') AS REAL) ${direcao}, numero DESC`;
    case 'cliente':
      return `${semAcentoLowerSql("json_extract(data, '$.clienteNome')")} ${direcao}, numero DESC`;
    case 'numero':
      return `numero ${direcao}, id DESC`;
    case 'status':
      return `${sqlCaseStatus()} ${direcao}, numero DESC`;
    case 'data':
      return `json_extract(data, '$.criadoEm') ${direcao}, numero DESC`;
    default:
      return "json_extract(data, '$.criadoEm') DESC, numero DESC";
  }
}

export interface ItemListaOrcamento {
  id: string;
  status?: string | null;
  clienteNome?: string | null;
  numero?: string | null;
  valorTotal?: number | null;
  criadoEm?: string | null;
  clienteId?: string | null;
}

export interface FiltroMemoriaLista {
  clienteId?: string;
  status?: string;
  busca?: string;
  periodo?: PeriodoLista;
  valorMin?: number;
  valorMax?: number;
  valorInvalido?: boolean;
  ordem?: OrdemLista;
  modoData?: ModoDataLista;
  agora?: Date;
}

export function casaBuscaLista(item: Pick<ItemListaOrcamento, 'clienteNome' | 'numero'>, busca: string | undefined): boolean {
  const q = semAcentoLower((busca ?? '').trim());
  if (!q) return true;
  const nome = semAcentoLower(item.clienteNome ?? '');
  const numero = (item.numero ?? '').toLowerCase();
  const qNumero = q.replace(/\//g, '');
  return nome.includes(q) || numero.includes(q) || (qNumero.length > 0 && numero.replace(/\//g, '').includes(qNumero));
}

function indiceFunil(status: string | null | undefined): number {
  const i = ORDEM_FUNIL_STATUS.indexOf(status as (typeof ORDEM_FUNIL_STATUS)[number]);
  return i === -1 ? 99 : i;
}

function cmpTexto(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function temData(item: ItemListaOrcamento, modo: ModoDataLista): boolean {
  if (modo === 'texto') return diaTexto(item.criadoEm) != null;
  if (!item.criadoEm) return false;
  return Number.isFinite(new Date(item.criadoEm).getTime());
}

function cmpPrimario(a: ItemListaOrcamento, b: ItemListaOrcamento, ordem: OrdemLista, modo: ModoDataLista): number {
  switch (ordem.campo) {
    case 'valor':
      return (a.valorTotal ?? 0) - (b.valorTotal ?? 0);
    case 'cliente':
      return cmpTexto(semAcentoLower(a.clienteNome ?? ''), semAcentoLower(b.clienteNome ?? ''));
    case 'numero':
      return cmpTexto(a.numero ?? '', b.numero ?? '');
    case 'status':
      return indiceFunil(a.status) - indiceFunil(b.status);
    default: {
      if (modo === 'texto') {
        const da = diaTexto(a.criadoEm) ?? '';
        const db = diaTexto(b.criadoEm) ?? '';
        if (da === db) return 0;
        return da < db ? -1 : 1;
      }
      return new Date(a.criadoEm ?? 0).getTime() - new Date(b.criadoEm ?? 0).getTime();
    }
  }
}

function desempate(a: ItemListaOrcamento, b: ItemListaOrcamento, ordem: OrdemLista): number {
  if (ordem.campo !== 'numero') {
    const porNumero = cmpTexto(b.numero ?? '', a.numero ?? '');
    if (porNumero !== 0) return porNumero;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function aplicarListaOrcamentos<T extends ItemListaOrcamento>(
  itens: readonly T[],
  filtro: FiltroMemoriaLista,
): T[] {
  if (filtro.valorInvalido) return [];
  const agora = filtro.agora ?? new Date();
  const modo = filtro.modoData ?? 'instante';
  const ordem = filtro.ordem ?? ORDEM_PADRAO;
  const passou = itens.filter((item) => {
    if (filtro.clienteId && item.clienteId !== filtro.clienteId) return false;
    if (filtro.status && item.status !== filtro.status) return false;
    if (!casaBuscaLista(item, filtro.busca)) return false;
    if (!passaPeriodo(item.criadoEm, filtro.periodo, agora, modo)) return false;
    if (!passaValor(item.valorTotal, filtro.valorMin, filtro.valorMax)) return false;
    return true;
  });
  const sinal = ordem.direcao === 'asc' ? 1 : -1;
  return passou.slice().sort((a, b) => {
    // Data ausente fica no fim nos dois sentidos — não "sobe" quando a ordem inverte.
    if (ordem.campo === 'data') {
      const falta = Number(temData(b, modo)) - Number(temData(a, modo));
      if (falta !== 0) return falta;
    }
    const primario = cmpPrimario(a, b, ordem, modo);
    if (primario !== 0) return primario * sinal;
    return desempate(a, b, ordem);
  });
}
