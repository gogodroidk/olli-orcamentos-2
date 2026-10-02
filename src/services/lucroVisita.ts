/**
 * LUCRO REAL DA VISITA (Onda I4, jogada 11) — TypeScript PURO.
 *
 * "Você cobrou R$ 450. Material R$ 120, deslocamento R$ 38 (24 km, estimativa),
 * comissão R$ 45. Sobrou R$ 247 (55%)." E no mês: "Quanto sobrou".
 *
 *     sobrou = preço − material − deslocamento estimado − comissão
 *
 * Sem rede, sem React, sem relógio: `scripts/teste-lucro-visita.ts` roda tudo em
 * Node. Quem lê banco e monta a entrada é `services/lucroMes.ts`.
 *
 * ─── DE ONDE VEM CADA NÚMERO ───────────────────────────────────────────────
 *  preço        o valor da OS (copiado do orçamento) ou o total do orçamento.
 *  material     1º a BAIXA da OS (o que saiu de verdade, `materiaisOS.ts`);
 *               sem baixa, os PRODUTOS do orçamento × o custo do catálogo
 *               (`ProdutoItem.custo`). Serviço do orçamento é mão de obra: não
 *               entra como material.
 *  deslocamento ESTIMADO: linha reta da base até o cliente × 1,4 (as ruas não são
 *               retas), ida e volta, × o custo por km de Meu Negócio. Sem API de
 *               rota (nada pago) e sempre rotulado "estimativa".
 *  comissão     % de Meu Negócio sobre o preço. Ausente = sem comissão.
 *
 * ─── NUNCA LUCRO INVENTADO (regra "erro vira vazio") ───────────────────────
 * Faltou um número → `estado: 'incompleto'` com a lista do que falta ("falta o
 * custo de 2 itens", "falta o custo por km"), e a tela oferece [Completar]. O
 * resultado parcial NUNCA é somado como se fosse o lucro.
 *  - custo por km AUSENTE = falta; custo por km 0 = "não conto deslocamento"
 *    (afirmação do prestador) e dispensa as coordenadas;
 *  - sem baixa e sem orçamento = "não sei o material" (falta), nunca R$ 0.
 */
import type { MaterialUsado } from '../types/index.ts';
import { coordenadaValida, distanciaKm } from './encaixe.ts';

/** As ruas não são retas: mesmo fator do Encaixe (`encaixe.ts`). */
export const FATOR_RUA = 1.4;

export interface Ponto {
  lat?: number | null;
  lon?: number | null;
  /**
   * De onde veio o ponto (`geoCliente.ts`). 'cidade' é o CENTRO do município: base
   * e cliente na mesma cidade dariam "0 km" — deslocamento inventado. Por isso
   * ponto só pela cidade conta como falta (o CEP ou o endereço resolvem).
   */
  geoPrecisao?: string | null;
}

/** Ponto bom o bastante para estimar a distância: coordenada válida e mais fino que a cidade. */
function pontoUtil(p: Ponto | null | undefined): p is { lat: number; lon: number } & Ponto {
  return !!p && coordenadaValida(p.lat, p.lon) && p.geoPrecisao !== 'cidade';
}

/** O que o prestador informou em Meu Negócio. */
export interface CustosNegocio {
  custoKm?: number | null;
  comissaoPercentual?: number | null;
  base?: Ponto | null;
}

/** Um item do orçamento, só o que o cálculo usa. */
export interface ItemOrcamentoLucro {
  tipo: 'servico' | 'produto';
  catalogoId?: string | null;
  nome: string;
  quantidade: number;
}

export interface EntradaLucro {
  /** Preço cobrado. `null`/ausente = não sei. */
  valor: number | null | undefined;
  /** Baixa da OS: ausente = não informada; `[]` = sem material. */
  materiais?: MaterialUsado[] | null;
  /** Itens do orçamento de origem (quando há orçamento). */
  itensOrcamento?: ItemOrcamentoLucro[] | null;
  /** Custo do catálogo por id de produto. Ausente no mapa = sem custo cadastrado. */
  custoProduto?: (catalogoId: string) => number | null | undefined;
  /** Onde fica o cliente. */
  cliente?: Ponto | null;
  negocio: CustosNegocio;
}

export type FaltaLucro =
  | { tipo: 'valor' }
  | { tipo: 'material_nao_informado' }
  | { tipo: 'custo_material'; itens: string[] }
  | { tipo: 'custo_km' }
  | { tipo: 'base' }
  | { tipo: 'local_cliente' };

export type FonteMaterial = 'baixa' | 'orcamento';

export interface PartesLucro {
  valor: number;
  material: number;
  fonteMaterial: FonteMaterial;
  deslocamento: number;
  /** km de ida e volta estimados (null quando o custo por km é 0 e não medimos). */
  km: number | null;
  comissao: number;
  comissaoPercentual: number;
}

export type ResultadoLucro =
  | ({ estado: 'completo'; sobrou: number; margem: number | null } & PartesLucro)
  | { estado: 'incompleto'; faltas: FaltaLucro[] };

function numeroOk(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Material pela baixa ou pelo orçamento. */
function calcularMaterial(e: EntradaLucro): { valor: number; fonte: FonteMaterial } | FaltaLucro {
  if (Array.isArray(e.materiais)) {
    const semCusto = e.materiais.filter((m) => !numeroOk(m.custoUnitario) || (m.custoUnitario as number) < 0);
    if (semCusto.length) return { tipo: 'custo_material', itens: semCusto.map((m) => m.nome) };
    const total = e.materiais.reduce((s, m) => s + (m.custoUnitario as number) * m.quantidade, 0);
    return { valor: centavos(total), fonte: 'baixa' };
  }
  if (!Array.isArray(e.itensOrcamento)) return { tipo: 'material_nao_informado' };
  const produtos = e.itensOrcamento.filter((i) => i.tipo === 'produto' && numeroOk(i.quantidade) && i.quantidade > 0);
  const semCusto: string[] = [];
  let total = 0;
  for (const p of produtos) {
    const custo = p.catalogoId && e.custoProduto ? e.custoProduto(p.catalogoId) : undefined;
    if (!numeroOk(custo) || custo < 0) {
      semCusto.push(p.nome);
      continue;
    }
    total += custo * p.quantidade;
  }
  if (semCusto.length) return { tipo: 'custo_material', itens: semCusto };
  return { valor: centavos(total), fonte: 'orcamento' };
}

/** Deslocamento estimado (ida e volta). */
function calcularDeslocamento(e: EntradaLucro): { valor: number; km: number | null } | FaltaLucro[] {
  const custoKm = e.negocio.custoKm;
  if (!numeroOk(custoKm) || custoKm < 0) return [{ tipo: 'custo_km' }];
  if (custoKm === 0) return { valor: 0, km: null };
  const faltas: FaltaLucro[] = [];
  const base = e.negocio.base;
  if (!pontoUtil(base)) faltas.push({ tipo: 'base' });
  if (!pontoUtil(e.cliente)) faltas.push({ tipo: 'local_cliente' });
  if (faltas.length) return faltas;
  const km = kmIdaEVolta(base as { lat: number; lon: number }, e.cliente as { lat: number; lon: number });
  return { valor: centavos(km * custoKm), km };
}

/** Linha reta × fator de rua, ida e volta, com 1 casa. */
export function kmIdaEVolta(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return Math.round(distanciaKm(a, b) * FATOR_RUA * 2 * 10) / 10;
}

/** O lucro de UMA visita — ou o que falta para calcular. Nunca lança. */
export function calcularLucroVisita(e: EntradaLucro): ResultadoLucro {
  const faltas: FaltaLucro[] = [];
  const valor = numeroOk(e.valor) && e.valor >= 0 ? e.valor : null;
  if (valor === null) faltas.push({ tipo: 'valor' });

  const mat = calcularMaterial(e);
  if ('tipo' in mat) faltas.push(mat);

  const desl = calcularDeslocamento(e);
  if (Array.isArray(desl)) faltas.push(...desl);

  if (faltas.length || valor === null || 'tipo' in mat || Array.isArray(desl)) {
    return { estado: 'incompleto', faltas };
  }

  const pct = numeroOk(e.negocio.comissaoPercentual) && e.negocio.comissaoPercentual > 0
    ? Math.min(100, e.negocio.comissaoPercentual)
    : 0;
  const comissao = centavos((valor * pct) / 100);
  const sobrou = centavos(valor - mat.valor - desl.valor - comissao);
  return {
    estado: 'completo',
    valor,
    material: mat.valor,
    fonteMaterial: mat.fonte,
    deslocamento: desl.valor,
    km: desl.km,
    comissao,
    comissaoPercentual: pct,
    sobrou,
    margem: valor > 0 ? sobrou / valor : null,
  };
}

// ─── Textos (copy derivada do cálculo, nunca escrita à mão por tela) ─────────

/** R$ sem depender de Intl (o Hermes nem sempre traz pt-BR completo). */
export function reais(v: number): string {
  const neg = v < 0;
  const [int, dec] = Math.abs(centavos(v)).toFixed(2).split('.');
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '−' : ''}R$ ${milhar},${dec}`;
}

function kmTexto(km: number): string {
  return `${String(km).replace('.', ',')} km`;
}

/** Frase da faixa: "Você cobrou R$ 450,00. Material R$ 120,00 … Sobrou R$ 247,00 (55%)." */
export function textoLucro(r: Extract<ResultadoLucro, { estado: 'completo' }>): string {
  const partes: string[] = [];
  partes.push(`Material ${reais(r.material)}${r.fonteMaterial === 'orcamento' ? ' (pelo orçamento)' : ''}`);
  partes.push(
    r.km === null
      ? 'deslocamento não contado'
      : `deslocamento ${reais(r.deslocamento)} (${kmTexto(r.km)}, estimativa)`,
  );
  if (r.comissao > 0) partes.push(`comissão ${reais(r.comissao)}`);
  const pct = r.margem === null ? '' : ` (${Math.round(r.margem * 100)}%)`;
  return `Você cobrou ${reais(r.valor)}. ${partes.join(', ')}. Sobrou ${reais(r.sobrou)}${pct}.`;
}

/** Uma linha por falta, no tom do app. */
export function textoFalta(f: FaltaLucro): string {
  switch (f.tipo) {
    case 'valor':
      return 'Falta o valor cobrado nesta visita.';
    case 'material_nao_informado':
      return 'Falta dizer o material usado (ou marcar "não usei material").';
    case 'custo_material':
      return f.itens.length === 1
        ? `Falta o custo de "${f.itens[0]}".`
        : `Falta o custo de ${f.itens.length} itens.`;
    case 'custo_km':
      return 'Falta o custo por km em Meu negócio.';
    case 'base':
      return 'Falta o seu ponto de saída em Meu negócio (com CEP ou endereço, não só a cidade).';
    case 'local_cliente':
      return 'Falta o endereço (CEP) do cliente para estimar a distância.';
  }
}

/** Resumo curto para a faixa incompleta: "Falta o custo de 2 itens para calcular o lucro." */
export function textoIncompleto(faltas: FaltaLucro[]): string {
  if (!faltas.length) return 'Faltam dados para calcular o lucro.';
  const primeira = textoFalta(faltas[0]).replace(/\.$/, '');
  return faltas.length === 1
    ? `${primeira} para calcular o lucro.`
    : `${primeira} e mais ${faltas.length - 1} ${faltas.length - 1 === 1 ? 'dado' : 'dados'} para calcular o lucro.`;
}

/** Onde o prestador completa cada falta (a tela decide a navegação). */
export function ondeCompletar(f: FaltaLucro): 'meu_negocio' | 'os' | 'cliente' | 'catalogo' {
  if (f.tipo === 'custo_km' || f.tipo === 'base') return 'meu_negocio';
  if (f.tipo === 'local_cliente') return 'cliente';
  if (f.tipo === 'custo_material') return 'catalogo';
  return 'os';
}

// ─── Mês ─────────────────────────────────────────────────────────────────────

export interface VisitaDoMes {
  id: string;
  titulo: string;
  clienteNome: string;
  /** ISO de quando foi concluída. */
  quando: string;
  resultado: ResultadoLucro;
  /** Origem, para a tela abrir o lugar certo. */
  origem: 'os' | 'visita';
}

export interface VisitaComLucro extends VisitaDoMes {
  resultado: Extract<ResultadoLucro, { estado: 'completo' }>;
}

export interface ResumoMes {
  /** Soma do que sobrou nas visitas com conta completa. */
  sobrou: number;
  /** Soma do preço dessas mesmas visitas (base da margem do mês). */
  cobrado: number;
  margem: number | null;
  completas: number;
  /** Visitas concluídas cujo lucro não deu para calcular (a tela diz quantas). */
  incompletas: VisitaDoMes[];
  /** Até 3 que mais deixaram dinheiro. */
  melhores: VisitaComLucro[];
  /** Até 3 com prejuízo (sobrou < 0), do pior para o menos pior. */
  prejuizo: VisitaComLucro[];
}

/**
 * "Quanto sobrou no mês". Só soma o que tem conta completa — e devolve as
 * incompletas à parte, para a tela dizer "3 serviços sem dados" em vez de
 * fingir que o mês acabou ali.
 */
export function resumirMes(visitas: VisitaDoMes[]): ResumoMes {
  const completas = visitas.filter((v): v is VisitaComLucro => v.resultado.estado === 'completo');
  const incompletas = visitas.filter((v) => v.resultado.estado !== 'completo');
  const sobrou = centavos(completas.reduce((s, v) => s + v.resultado.sobrou, 0));
  const cobrado = centavos(completas.reduce((s, v) => s + v.resultado.valor, 0));
  const melhores = [...completas]
    .filter((v) => v.resultado.sobrou > 0)
    .sort((a, b) => b.resultado.sobrou - a.resultado.sobrou)
    .slice(0, 3);
  const prejuizo = completas
    .filter((v) => v.resultado.sobrou < 0)
    .sort((a, b) => a.resultado.sobrou - b.resultado.sobrou)
    .slice(0, 3);
  return {
    sobrou,
    cobrado,
    margem: cobrado > 0 ? sobrou / cobrado : null,
    completas: completas.length,
    incompletas,
    melhores,
    prejuizo,
  };
}

/** Mês local 'AAAA-MM' de um ISO, no fuso de Brasília (UTC−3 fixo, como o Encaixe). */
export function mesDeBrasilia(iso: string): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - 3 * 3_600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
