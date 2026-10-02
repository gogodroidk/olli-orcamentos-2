/**
 * MALA DA VÉSPERA (Onda I4, jogada 7) — TypeScript PURO.
 *
 * Às 19h o Hoje mostra "Para amanhã, separe:" — a lista do que levar, montada a
 * partir das visitas de amanhã. Cada item diz DE ONDE veio, e nada é inventado:
 *
 *  1. PEÇAS DO ORÇAMENTO — os produtos do orçamento ligado à visita, com a
 *     quantidade do orçamento ("2 un de Suporte 400 mm · orçamento 0123");
 *  2. SERVIÇOS DO ORÇAMENTO — viram o lembrete do que será feito (não são
 *     material, não ganham caixinha);
 *  3. KIT DO OFÍCIO POR TIPO DE VISITA — o material usual do ofício para aquele
 *     tipo (limpeza, instalação, manutenção…), rotulado "kit usual" para o
 *     prestador saber que é sugestão. Sem quantidade inventada: quando há conta
 *     conhecida, ela vem com a fonte (carga de gás pela prática de fabricantes, a
 *     mesma da calculadora `calculosOficio.ts`; bitola pela capacidade em BTU lida
 *     no nome do item).
 * Visita sem orçamento e sem regra do ofício → "Sem dados para sugerir material
 * desta visita", nunca uma lista chutada.
 *
 * Sem React, sem rede, sem relógio: `scripts/teste-mala-vespera.ts` roda em Node.
 */
import type { TipoAgendamento } from '../types/index.ts';
import type { VerticalId } from './verticais.ts';

/** Hora (local) em que a mala aparece no Hoje. */
export const HORA_MALA = 19;

export interface ItemOrcamentoMala {
  tipo: 'servico' | 'produto';
  nome: string;
  quantidade: number;
  unidade?: string | null;
}

export interface VisitaMala {
  id: string;
  clienteNome: string;
  /** ISO de início. */
  inicio: string;
  tipo: TipoAgendamento;
  titulo: string;
  /** Itens do orçamento ligado (null = sem orçamento). */
  itensOrcamento?: ItemOrcamentoMala[] | null;
  orcamentoNumero?: string | null;
}

export type FonteItemMala = 'orcamento' | 'oficio';

export interface ItemMala {
  /** Estável entre aberturas (é a chave da caixinha marcada). */
  id: string;
  texto: string;
  fonte: FonteItemMala;
  /** "orçamento 0123" ou "kit usual de ar-condicionado · instalação". */
  origem: string;
  /** Detalhe com a conta e a fonte, quando houver. */
  detalhe?: string;
}

export interface GrupoMala {
  visitaId: string;
  clienteNome: string;
  inicio: string;
  titulo: string;
  /** Serviços do orçamento (lembrete, sem caixinha). */
  servicos: string[];
  itens: ItemMala[];
  /** true = nada para sugerir nesta visita (a tela diz isso). */
  semDados: boolean;
}

export interface MalaVespera {
  grupos: GrupoMala[];
  /** Lista única para separar: peças somadas por nome+unidade, kit sem repetir. */
  separar: ItemMala[];
}

interface ItemKit {
  id: string;
  texto: string;
  detalhe?: string;
}

const NOME_OFICIO: Record<VerticalId, string> = {
  refrigeracao: 'ar-condicionado',
  eletrica: 'elétrica',
  hidraulica: 'hidráulica',
  pintura: 'pintura',
  dedetizacao: 'dedetização',
  caixa_dagua: "caixa d'água",
  piscina: 'piscina',
  extintores: 'extintores',
  jardinagem: 'jardinagem',
  geral: 'serviços gerais',
};

const NOME_TIPO: Record<TipoAgendamento, string> = {
  orcamento: 'visita de orçamento',
  limpeza: 'limpeza',
  instalacao: 'instalação',
  manutencao: 'manutenção',
  visita: 'visita técnica',
  outro: 'outro',
};

/** Carga de gás: a mesma base da calculadora `carga_gas` (calculosOficio.ts). */
const DETALHE_GAS =
  'Para completar a carga quando a linha passa do comprimento de fábrica: ~20 g por metro a mais em 9 a 12 mil BTU e ~30 g/m em 18 a 30 mil (prática de fabricantes para R-410A; confira o manual).';

/**
 * Kit usual por ofício × tipo de visita. Só itens que o ofício leva SEMPRE nesse
 * tipo de serviço — sem quantidade inventada.
 */
const KITS: Partial<Record<VerticalId, Partial<Record<TipoAgendamento, ItemKit[]>>>> = {
  refrigeracao: {
    limpeza: [
      { id: 'ref.lavadora', texto: 'Lavadora / bomba de pulverização' },
      { id: 'ref.bolsa', texto: 'Bolsa coletora de limpeza' },
      { id: 'ref.produto', texto: 'Produto de higienização da serpentina' },
      { id: 'ref.manometro', texto: 'Manifold (medir a pressão do gás)' },
    ],
    manutencao: [
      { id: 'ref.manometro', texto: 'Manifold (medir a pressão do gás)' },
      { id: 'ref.multimetro', texto: 'Alicate amperímetro / multímetro' },
      { id: 'ref.gas', texto: 'Gás para completar a carga, se a pressão estiver baixa', detalhe: DETALHE_GAS },
    ],
    instalacao: [
      { id: 'ref.tubo', texto: 'Tubulação de cobre (par de linhas)' },
      { id: 'ref.isolamento', texto: 'Isolamento térmico e fita PVC' },
      { id: 'ref.suporte', texto: 'Suporte da condensadora' },
      { id: 'ref.cabo', texto: 'Cabo PP e disjuntor conforme o manual' },
      { id: 'ref.vacuo', texto: 'Bomba de vácuo e manifold' },
      { id: 'ref.gas', texto: 'Gás para completar a carga, se a linha for longa', detalhe: DETALHE_GAS },
    ],
  },
  eletrica: {
    instalacao: [
      { id: 'ele.multimetro', texto: 'Multímetro / alicate amperímetro' },
      { id: 'ele.conectores', texto: 'Fita isolante, terminais e conectores' },
    ],
    manutencao: [
      { id: 'ele.multimetro', texto: 'Multímetro / alicate amperímetro' },
      { id: 'ele.conectores', texto: 'Fita isolante, terminais e conectores' },
    ],
  },
  hidraulica: {
    manutencao: [
      { id: 'hid.veda', texto: 'Fita veda-rosca e cola PVC' },
      { id: 'hid.conexoes', texto: 'Conexões e registro de reserva' },
    ],
    instalacao: [
      { id: 'hid.veda', texto: 'Fita veda-rosca e cola PVC' },
      { id: 'hid.conexoes', texto: 'Conexões e registro de reserva' },
    ],
  },
  pintura: {
    manutencao: [
      { id: 'pin.protecao', texto: 'Lona e fita crepe' },
      { id: 'pin.ferramentas', texto: 'Lixas, rolo e pincel' },
    ],
    instalacao: [
      { id: 'pin.protecao', texto: 'Lona e fita crepe' },
      { id: 'pin.ferramentas', texto: 'Lixas, rolo e pincel' },
    ],
  },
  dedetizacao: {
    manutencao: [
      { id: 'ded.produto', texto: 'Produto do alvo e diluição (anote o lote no comprovante)' },
      { id: 'ded.epi', texto: 'EPI: máscara, luvas e óculos' },
      { id: 'ded.pulverizador', texto: 'Pulverizador' },
    ],
    limpeza: [
      { id: 'ded.produto', texto: 'Produto do alvo e diluição (anote o lote no comprovante)' },
      { id: 'ded.epi', texto: 'EPI: máscara, luvas e óculos' },
      { id: 'ded.pulverizador', texto: 'Pulverizador' },
    ],
  },
  caixa_dagua: {
    limpeza: [
      { id: 'cxa.escovas', texto: 'Escovas e baldes (sem sabão nem detergente)' },
      { id: 'cxa.cloro', texto: 'Solução clorada para a desinfecção' },
      { id: 'cxa.lacre', texto: 'Lacre e etiqueta da próxima limpeza' },
    ],
  },
  piscina: {
    manutencao: [
      { id: 'pis.teste', texto: 'Kit de teste (pH e cloro)' },
      { id: 'pis.quimica', texto: 'Cloro e corretores de pH' },
      { id: 'pis.limpeza', texto: 'Peneira, escova e aspirador' },
    ],
    limpeza: [
      { id: 'pis.teste', texto: 'Kit de teste (pH e cloro)' },
      { id: 'pis.quimica', texto: 'Cloro e corretores de pH' },
      { id: 'pis.limpeza', texto: 'Peneira, escova e aspirador' },
    ],
  },
  extintores: {
    manutencao: [
      { id: 'ext.selos', texto: 'Selos e etiquetas de manutenção' },
      { id: 'ext.reserva', texto: 'Extintores reserva para os que vão para recarga' },
    ],
  },
  jardinagem: {
    manutencao: [
      { id: 'jar.ferramentas', texto: 'Roçadeira, podão e tesoura de poda' },
      { id: 'jar.sacos', texto: 'Sacos para os resíduos' },
    ],
    limpeza: [
      { id: 'jar.ferramentas', texto: 'Roçadeira, podão e tesoura de poda' },
      { id: 'jar.sacos', texto: 'Sacos para os resíduos' },
    ],
  },
};

/** Visita de orçamento vale para qualquer ofício. */
const KIT_ORCAMENTO: ItemKit[] = [
  { id: 'orc.trena', texto: 'Trena e lanterna' },
  { id: 'orc.celular', texto: 'Celular carregado para as fotos do local' },
];

/**
 * Capacidade em BTU lida do nome do item ("Split 12.000 BTUs", "12000 btu", "12k").
 * `null` = não deu para ler (aí não sugere bitola).
 */
export function btuDoTexto(texto: string): number | null {
  const t = texto.toLowerCase();
  const m = t.match(/(\d{1,2})[.\s]?(\d{3})\s*btu/);
  if (m) return Number(m[1] + m[2]);
  const k = t.match(/\b(\d{1,2})\s*k\b/);
  if (k && /split|btu|ar[- ]?cond|condensadora|evaporadora/.test(t)) return Number(k[1]) * 1000;
  return null;
}

/** Bitolas usuais por capacidade (só as faixas consolidadas; o resto: "confira o manual"). */
export function bitolaUsual(btu: number): string | null {
  if (btu >= 7000 && btu <= 12000) return 'linhas de 1/4" e 3/8"';
  if (btu > 12000 && btu <= 18000) return 'linhas de 1/4" e 1/2"';
  return null;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function qtd(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100).replace('.', ',');
}

/**
 * Monta a mala de amanhã. `verticais` = ofícios do cadastro (o 1º decide o kit;
 * sem ofício, só as peças do orçamento entram). Nunca lança.
 */
export function montarMala(visitas: VisitaMala[], verticais: VerticalId[] | undefined | null): MalaVespera {
  const oficio: VerticalId | null = verticais && verticais.length ? verticais[0] : null;
  const grupos: GrupoMala[] = [];
  const pecas = new Map<string, { nome: string; unidade: string; quantidade: number; origens: string[] }>();
  const kitUnico = new Map<string, ItemMala>();

  const ordenadas = [...visitas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  for (const v of ordenadas) {
    const itens: ItemMala[] = [];
    const servicos: string[] = [];
    const origemOrc = v.orcamentoNumero ? `orçamento ${v.orcamentoNumero}` : 'orçamento';

    for (const it of v.itensOrcamento ?? []) {
      const nome = (it.nome || '').trim();
      if (!nome) continue;
      if (it.tipo === 'servico') {
        servicos.push(nome);
        continue;
      }
      const q = typeof it.quantidade === 'number' && Number.isFinite(it.quantidade) && it.quantidade > 0 ? it.quantidade : 1;
      const unidade = (it.unidade || 'un').trim() || 'un';
      const chave = `${normalizar(nome)}|${normalizar(unidade)}`;
      itens.push({ id: `peca:${chave}`, texto: `${qtd(q)} ${unidade} de ${nome}`, fonte: 'orcamento', origem: origemOrc });
      const soma = pecas.get(chave) ?? { nome, unidade, quantidade: 0, origens: [] };
      soma.quantidade += q;
      if (!soma.origens.includes(v.clienteNome)) soma.origens.push(v.clienteNome);
      pecas.set(chave, soma);
    }

    const kit = v.tipo === 'orcamento' ? KIT_ORCAMENTO : oficio ? KITS[oficio]?.[v.tipo] ?? [] : [];
    const origemKit = v.tipo === 'orcamento'
      ? 'kit usual de visita de orçamento'
      : `kit usual de ${NOME_OFICIO[oficio ?? 'geral']} · ${NOME_TIPO[v.tipo]}`;
    for (const k of kit) {
      const item: ItemMala = { id: `kit:${k.id}`, texto: k.texto, fonte: 'oficio', origem: origemKit, detalhe: k.detalhe };
      itens.push(item);
      if (!kitUnico.has(item.id)) kitUnico.set(item.id, item);
    }

    // Bitola pela capacidade lida no orçamento (só refrigeração, instalação).
    if (oficio === 'refrigeracao' && v.tipo === 'instalacao') {
      const btus = (v.itensOrcamento ?? []).map((i) => btuDoTexto(i.nome || '')).filter((b): b is number => b !== null);
      for (const btu of [...new Set(btus)]) {
        const bitola = bitolaUsual(btu);
        const id = `kit:ref.bitola.${btu}`;
        const item: ItemMala = bitola
          ? { id, texto: `Cobre em ${bitola} (${qtd(btu / 1000)} mil BTU)`, fonte: 'oficio', origem: origemKit, detalhe: 'Bitola usual para essa capacidade. Confira no manual do aparelho.' }
          : { id, texto: `Cobre na bitola do manual (${qtd(btu / 1000)} mil BTU)`, fonte: 'oficio', origem: origemKit };
        itens.push(item);
        if (!kitUnico.has(id)) kitUnico.set(id, item);
      }
    }

    grupos.push({
      visitaId: v.id,
      clienteNome: v.clienteNome,
      inicio: v.inicio,
      titulo: v.titulo,
      servicos,
      itens,
      semDados: itens.length === 0,
    });
  }

  const separar: ItemMala[] = [];
  for (const [chave, p] of pecas) {
    separar.push({
      id: `peca:${chave}`,
      texto: `${qtd(p.quantidade)} ${p.unidade} de ${p.nome}`,
      fonte: 'orcamento',
      origem: p.origens.length === 1 ? `para ${p.origens[0]}` : `para ${p.origens.length} clientes`,
    });
  }
  separar.push(...kitUnico.values());
  return { grupos, separar };
}

/** Texto para "Compartilhar lista" (o prestador manda a quem quiser, ele mesmo). */
export function textoMala(mala: MalaVespera, rotuloDia: string, marcados: ReadonlySet<string> = new Set()): string {
  const linhas = [`Mala para ${rotuloDia}:`];
  for (const i of mala.separar) linhas.push(`${marcados.has(i.id) ? '[x]' : '[ ]'} ${i.texto}`);
  const semDados = mala.grupos.filter((g) => g.semDados).length;
  if (semDados) linhas.push(`(${semDados} visita${semDados > 1 ? 's' : ''} sem dados para sugerir material)`);
  return linhas.join('\n');
}

/**
 * A mala aparece? A partir das 19h (relógio do aparelho) e só com visita amanhã.
 * Antes disso a tela não mostra nada — o lugar dela é a véspera.
 */
export function deveMostrarMala(agora: Date, visitasAmanha: number): boolean {
  return agora.getHours() >= HORA_MALA && visitasAmanha > 0;
}
