/**
 * CÓDIGO DE ERRO VIRA ORÇAMENTO EM 1 TOQUE (jogada B2 do plano OLLI Inteligente).
 *
 * O técnico achou o código na base offline (698 códigos, 23 marcas) e, no mesmo
 * minuto, quer o orçamento na mão do cliente. Esta regra PURA monta o rascunho:
 *
 *   - itens sugeridos: mão de obra e peças comuns para AQUELE tipo de defeito,
 *     ligados ao CATÁLOGO DO PRÓPRIO PRESTADOR (nome e preço dele). Sem item
 *     parecido no catálogo, o item entra SEM preço (0) e o editor obriga a
 *     conferir — nunca inventamos preço;
 *   - descrição técnica do defeito (vai para o laudo técnico, editável);
 *   - cliente e equipamento quando o técnico veio pelo QR da etiqueta.
 *
 * O que NÃO faz, de propósito:
 *   - não sugere "troca de placa": a regra de ouro da tela é "nunca troque a placa
 *     sem testar". Para defeito de placa/potência, a sugestão é o DIAGNÓSTICO da
 *     placa; a troca é decisão do técnico depois de medir;
 *   - não chama IA nem rede: roda offline, no porão, sem sinal;
 *   - não grava nada: só devolve o rascunho. Quem salva é o editor de orçamento,
 *     depois que o prestador confere (o mesmo caminho do "Salvar").
 *
 * Sem import de React Native: roda em `scripts/teste-orcamento-do-defeito.ts`.
 */
import type { CodigoErro } from '../types/index.ts';

/** O mínimo de um item de catálogo que a regra precisa (serviço ou produto). */
export interface ItemCatalogoDefeito {
  id: string;
  nome: string;
  preco: number;
  unidade?: string;
  descricao?: string;
}

/** O mínimo do equipamento (ficha do QR) que entra no laudo. */
export interface EquipamentoDoDefeito {
  fabricante?: string;
  modelo?: string;
  numeroSerie?: string;
  localizacao?: string;
  capacidadeBtu?: number;
}

export type OrigemSugestao =
  /** Casou com um item do catálogo do prestador: nome e preço DELE. */
  | 'catalogo'
  /** Sugestão da base de defeitos, sem item parecido no catálogo: sem preço. */
  | 'sugestao';

export interface ItemSugeridoDefeito {
  /** Chave estável da sugestão (dedupe e testes). */
  chave: string;
  tipo: 'servico' | 'produto';
  nome: string;
  descricao?: string;
  /** Preço do catálogo; 0 quando a origem é 'sugestao' (o editor pede o preço). */
  preco: number;
  unidade: string;
  /** Id do item no catálogo quando `origem === 'catalogo'`. */
  catalogoId?: string;
  origem: OrigemSugestao;
  /** Por que este item está aqui, em 1 frase curta para a tela. */
  motivo: string;
}

export interface RascunhoDoDefeito {
  itens: ItemSugeridoDefeito[];
  /** Texto do laudo técnico (o prestador edita antes de enviar). */
  laudoTecnico: string;
  /** Quantos itens vieram com o preço do próprio catálogo. */
  comPrecoDoCatalogo: number;
}

// ─── Normalização ────────────────────────────────────────────────────────────

/** minúsculas, sem acento, espaços colapsados. Escapes unicode de propósito. */
export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── A tabela de sugestões ───────────────────────────────────────────────────

interface Sugestao {
  chave: string;
  tipo: 'servico' | 'produto';
  nome: string;
  /** Termos (já normalizados) que identificam o item no catálogo do prestador, do mais específico ao mais genérico. */
  termosCatalogo: readonly string[];
  /** Itens do catálogo que NÃO servem para esta sugestão, mesmo casando o termo (nome normalizado). */
  excluirDoCatalogo?: RegExp;
  motivo: string;
  unidade?: string;
}

/** Sempre entra: sem visita/diagnóstico não existe orçamento de defeito. */
const VISITA: Sugestao = {
  chave: 'visita_diagnostico',
  tipo: 'servico',
  nome: 'Visita técnica e diagnóstico',
  termosCatalogo: ['visita tecnica', 'diagnostico', 'visita'],
  motivo: 'A visita e o teste que confirmam o defeito.',
};

interface Familia {
  id: string;
  /** Casa com o código se QUALQUER padrão casar com categoria + falha + causa (normalizados). */
  padroes: readonly RegExp[];
  sugestoes: readonly Sugestao[];
}

/**
 * Famílias de defeito → mão de obra e peças comuns. A ordem importa só para a
 * ordem dos itens no orçamento (o que o técnico faz primeiro vem primeiro).
 */
const FAMILIAS: readonly Familia[] = [
  {
    id: 'sensor',
    padroes: [/sensor/, /termistor/, /\bntc\b/],
    sugestoes: [
      {
        chave: 'sensor_temperatura', tipo: 'produto', nome: 'Sensor de temperatura (termistor)',
        termosCatalogo: ['termistor', 'sensor de temperatura', 'sensor'],
        motivo: 'Peça mais comum neste defeito: o sensor aberto ou em curto.',
      },
      {
        chave: 'troca_sensor', tipo: 'servico', nome: 'Troca e teste do sensor',
        termosCatalogo: ['troca de sensor', 'substituicao de sensor', 'sensor'],
        motivo: 'Medir a resistência e trocar o sensor se estiver fora da tabela.',
      },
    ],
  },
  {
    id: 'refrigerante',
    // "carga" sozinho casaria "sobrecarga" (proteção elétrica): só carga DE gás/fluido.
    padroes: [/frigorifico/, /refrigera/, /\bgas\b/, /vazamento/, /pressao/, /\beev\b/, /carga de (gas|fluido|refrigerante)/],
    sugestoes: [
      {
        chave: 'teste_vazamento', tipo: 'servico', nome: 'Teste de vazamento e reparo da tubulação',
        termosCatalogo: ['vazamento', 'solda', 'reparo de tubulacao'],
        motivo: 'Falta de gás quase sempre é vazamento: achar e reparar antes de recarregar.',
      },
      {
        chave: 'carga_gas', tipo: 'servico', nome: 'Carga de gás refrigerante',
        termosCatalogo: ['carga de gas', 'recarga de gas', 'gas refrigerante', 'carga de fluido', 'r410', 'r32', 'r22', 'gas'],
        motivo: 'Completar a carga pelo peso da etiqueta depois do reparo.',
      },
    ],
  },
  {
    id: 'dreno',
    padroes: [/dreno/, /condensado/, /\bboia\b/],
    sugestoes: [
      {
        chave: 'desobstrucao_dreno', tipo: 'servico', nome: 'Desobstrução e teste do dreno',
        termosCatalogo: ['desobstrucao', 'limpeza do dreno', 'dreno'],
        motivo: 'Dreno entupido é a causa mais comum deste código.',
      },
      {
        chave: 'bomba_dreno', tipo: 'produto', nome: 'Bomba de dreno',
        termosCatalogo: ['bomba de dreno', 'bomba dreno', 'mini bomba'],
        motivo: 'Se a bomba não liga no teste, ela é a peça.',
      },
    ],
  },
  {
    id: 'ventilacao',
    // Sem "motor" sozinho: "motor do compressor" não é defeito de ventilação.
    padroes: [/ventila/, /turbina/, /\bfan\b/],
    sugestoes: [
      {
        chave: 'motor_ventilador', tipo: 'produto', nome: 'Motor do ventilador',
        termosCatalogo: ['motor ventilador', 'motor do ventilador', 'motor da turbina', 'motor'],
        motivo: 'Se o motor não gira ou não manda o sinal de rotação, ele é a peça.',
      },
      {
        chave: 'revisao_ventilacao', tipo: 'servico', nome: 'Revisão do conjunto de ventilação',
        termosCatalogo: ['revisao de ventilacao', 'ventilacao', 'turbina'],
        motivo: 'Conferir rolamento, hélice/turbina, conector e o sinal da placa.',
      },
    ],
  },
  {
    id: 'compressor',
    padroes: [/compressor/],
    sugestoes: [
      {
        chave: 'teste_compressor', tipo: 'servico', nome: 'Teste do compressor (isolamento, corrente e partida)',
        termosCatalogo: ['teste do compressor', 'compressor'],
        motivo: 'Medir antes de condenar o compressor: corrente, isolamento e partida.',
      },
    ],
  },
  {
    id: 'placa',
    padroes: [/placa/, /eeprom/, /inverter/, /\bipm\b/, /\bpfc\b/, /potencia/],
    sugestoes: [
      {
        chave: 'diagnostico_placa', tipo: 'servico', nome: 'Diagnóstico e reparo da placa eletrônica',
        // "Troca de placa" do catálogo NÃO entra no lugar do diagnóstico (regra de ouro).
        excluirDoCatalogo: /troca|substitui|placa nova/,
        termosCatalogo: ['reparo de placa', 'diagnostico de placa', 'placa eletronica', 'placa'],
        motivo: 'Testar a placa antes de trocar: a regra de ouro do diagnóstico.',
      },
    ],
  },
  {
    id: 'comunicacao',
    padroes: [/comunica/, /\bcabo\b/, /fiacao/, /enderec/, /controle/],
    sugestoes: [
      {
        chave: 'revisao_comunicacao', tipo: 'servico', nome: 'Revisão de cabos e conexões de comunicação',
        termosCatalogo: ['cabo de comunicacao', 'comunicacao', 'revisao eletrica', 'fiacao'],
        motivo: 'Mau contato e cabo trocado entre as unidades causam este código.',
      },
    ],
  },
  {
    id: 'eletrica',
    padroes: [/eletric/, /tensao/, /disjuntor/, /aterramento/, /alimentacao/, /corrente/],
    sugestoes: [
      {
        chave: 'revisao_eletrica', tipo: 'servico', nome: 'Revisão elétrica (tensão, disjuntor e aterramento)',
        termosCatalogo: ['revisao eletrica', 'eletrica', 'disjuntor'],
        motivo: 'Tensão baixa ou disjuntor errado disparam a proteção.',
      },
    ],
  },
];

/** Gatilhos por palavra na causa/falha (independem da família). */
const GATILHOS: readonly { padrao: RegExp; sugestao: Sugestao }[] = [
  {
    padrao: /capacitor/,
    sugestao: {
      chave: 'capacitor', tipo: 'produto', nome: 'Capacitor',
      termosCatalogo: ['capacitor'],
      motivo: 'A causa cita o capacitor: peça barata que costuma resolver.',
    },
  },
  {
    // Só sujeira/obstrução DITA na causa ou na ação ("sensor da serpentina" não é sujeira).
    padrao: /\bsuj|obstru|entupi|higieniz/,
    sugestao: {
      chave: 'limpeza', tipo: 'servico', nome: 'Limpeza e higienização do equipamento',
      termosCatalogo: ['higienizacao', 'limpeza completa', 'limpeza'],
      motivo: 'A causa cita sujeira ou obstrução: a limpeza entra junto.',
    },
  },
];

/** Máximo de itens sugeridos (orçamento de defeito curto se lê melhor). */
export const MAX_ITENS_SUGERIDOS = 4;

/** As famílias de defeito em que o código se encaixa (pela categoria, falha e causa). */
export function familiasDoCodigo(c: Pick<CodigoErro, 'catApp' | 'catBruta' | 'falha' | 'causa'>): string[] {
  const texto = normalizarTexto([c.catApp, c.catBruta, c.falha, c.causa].filter(Boolean).join(' '));
  return FAMILIAS.filter((f) => f.padroes.some((p) => p.test(texto))).map((f) => f.id);
}

/**
 * O item do catálogo que corresponde à sugestão: o primeiro termo (do mais
 * específico ao mais genérico) que aparece no nome de algum item. Empate no mesmo
 * termo: o nome mais curto (o mais "puro"). Nada parecido → null.
 */
export function casarNoCatalogo(
  sugestao: Pick<Sugestao, 'termosCatalogo' | 'excluirDoCatalogo'>,
  catalogo: readonly ItemCatalogoDefeito[],
  jaUsados: ReadonlySet<string> = new Set(),
): ItemCatalogoDefeito | null {
  const candidatos = catalogo.filter((i) => i?.id && i.nome && !jaUsados.has(i.id)
    && !(sugestao.excluirDoCatalogo && sugestao.excluirDoCatalogo.test(normalizarTexto(i.nome))));
  for (const termo of sugestao.termosCatalogo) {
    const achados = candidatos
      .filter((i) => normalizarTexto(i.nome).includes(termo))
      .sort((a, b) => a.nome.length - b.nome.length);
    if (achados.length) return achados[0];
  }
  return null;
}

function precoValido(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}

/** Linha "marca modelo · nº de série · local" do equipamento (vazio se nada). */
export function linhaDoEquipamento(eq: EquipamentoDoDefeito | null | undefined): string {
  if (!eq) return '';
  const marcaModelo = [eq.fabricante, eq.modelo].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  const btu = typeof eq.capacidadeBtu === 'number' && eq.capacidadeBtu > 0
    ? `${eq.capacidadeBtu.toLocaleString('pt-BR')} BTU/h`
    : '';
  const serie = eq.numeroSerie?.trim() ? `nº de série ${eq.numeroSerie.trim()}` : '';
  return [marcaModelo, btu, serie, eq.localizacao?.trim() ?? ''].filter(Boolean).join(' · ');
}

/**
 * Laudo técnico do defeito, em português claro para o cliente ler no PDF. Diz o
 * que a base aponta como CAUSA PROVÁVEL e deixa explícito que a confirmação é
 * feita no teste — código genérico não é diagnóstico.
 */
export function montarLaudoDoDefeito(c: CodigoErro, eq?: EquipamentoDoDefeito | null): string {
  const cab = [c.marca, c.familia].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  const linhas: string[] = [];
  const equipamento = linhaDoEquipamento(eq);
  if (equipamento) linhas.push(`Equipamento: ${equipamento}.`);
  const codigo = c.codigo?.trim();
  const falha = c.falha?.trim();
  if (codigo || falha) {
    linhas.push(`Defeito apresentado: ${codigo ? `código ${codigo}` : 'falha'}${cab ? ` (${cab})` : ''}${falha ? `: ${falha.replace(/\.$/, '')}` : ''}.`);
  }
  if (c.causa?.trim()) linhas.push(`Causa provável: ${c.causa.trim().replace(/\.$/, '')}.`);
  if (c.acao?.trim()) linhas.push(`Procedimento: ${c.acao.trim().replace(/\.$/, '')}.`);
  linhas.push('O código indica o caminho; o defeito é confirmado com teste no local antes da troca de qualquer peça.');
  return linhas.join('\n');
}

/**
 * Monta o rascunho do orçamento do defeito. Nunca lança: catálogo vazio ou
 * inválido vira "sem preço", nunca erro.
 */
export function montarRascunhoDoDefeito(entrada: {
  codigo: CodigoErro;
  servicos?: readonly ItemCatalogoDefeito[] | null;
  produtos?: readonly ItemCatalogoDefeito[] | null;
  equipamento?: EquipamentoDoDefeito | null;
}): RascunhoDoDefeito {
  const { codigo } = entrada;
  const servicos = Array.isArray(entrada.servicos) ? entrada.servicos : [];
  const produtos = Array.isArray(entrada.produtos) ? entrada.produtos : [];
  const texto = normalizarTexto([codigo.catApp, codigo.catBruta, codigo.falha, codigo.causa].filter(Boolean).join(' '));

  // Status/"operação normal" não vira orçamento de peça: só a visita.
  const ehStatus = /status|operacao normal|sem falha/.test(texto);
  const sugestoes: Sugestao[] = [VISITA];
  if (!ehStatus) {
    for (const f of FAMILIAS) {
      if (f.padroes.some((p) => p.test(texto))) sugestoes.push(...f.sugestoes);
    }
    // Gatilhos olham só a causa e a ação (o "porquê" e o "o que fazer"), não o nome da falha.
    const causaAcao = normalizarTexto([codigo.causa, codigo.acao].filter(Boolean).join(' '));
    for (const g of GATILHOS) {
      if (g.padrao.test(causaAcao)) sugestoes.push(g.sugestao);
    }
  }

  const vistas = new Set<string>();
  const usados = new Set<string>();
  const itens: ItemSugeridoDefeito[] = [];
  for (const s of sugestoes) {
    if (itens.length >= MAX_ITENS_SUGERIDOS) break;
    if (vistas.has(s.chave)) continue;
    vistas.add(s.chave);
    // Procura primeiro no catálogo do MESMO tipo; depois no outro (há quem
    // cadastre "carga de gás" como produto e quem cadastre como serviço) — mas no
    // outro tipo só pelo termo MAIS específico: "sensor" genérico casaria o
    // serviço "Troca de sensor" no lugar da PEÇA.
    const mesmoTipo = s.tipo === 'servico' ? servicos : produtos;
    const outroTipo = s.tipo === 'servico' ? produtos : servicos;
    let achado = casarNoCatalogo(s, mesmoTipo, usados);
    let tipo = s.tipo;
    if (!achado) {
      achado = casarNoCatalogo(
        { termosCatalogo: s.termosCatalogo.slice(0, 1), excluirDoCatalogo: s.excluirDoCatalogo },
        outroTipo,
        usados,
      );
      if (achado) tipo = s.tipo === 'servico' ? 'produto' : 'servico';
    }
    const preco = achado ? precoValido(achado.preco) : 0;
    if (achado) {
      usados.add(achado.id);
      itens.push({
        chave: s.chave,
        tipo,
        nome: achado.nome.trim(),
        descricao: achado.descricao?.trim() || undefined,
        preco,
        unidade: achado.unidade?.trim() || s.unidade || 'un',
        catalogoId: achado.id,
        origem: 'catalogo',
        motivo: s.motivo,
      });
    } else {
      itens.push({
        chave: s.chave,
        tipo: s.tipo,
        nome: s.nome,
        preco: 0,
        unidade: s.unidade || 'un',
        origem: 'sugestao',
        motivo: s.motivo,
      });
    }
  }

  return {
    itens,
    laudoTecnico: montarLaudoDoDefeito(codigo, entrada.equipamento),
    comPrecoDoCatalogo: itens.filter((i) => i.origem === 'catalogo' && i.preco > 0).length,
  };
}

/** Total dos itens com preço (os sem preço não somam: o editor pede o valor). */
export function totalSugerido(itens: readonly ItemSugeridoDefeito[]): number {
  return Math.round(itens.reduce((s, i) => s + precoValido(i.preco), 0) * 100) / 100;
}

/**
 * Os itens no formato do `prefillItems` da rota NovoOrcamento. O item sem preço
 * vai com `precoSugerido` ausente (o editor trata 0 como "falta o preço" e pede
 * a conferência antes de salvar).
 */
export function itensParaPrefill(itens: readonly ItemSugeridoDefeito[]): Array<{
  tipo: 'servico' | 'produto';
  nome: string;
  descricao?: string;
  unidade?: string;
  precoSugerido?: number;
  catalogoId?: string;
}> {
  return itens.map((i) => ({
    tipo: i.tipo,
    nome: i.nome,
    ...(i.descricao ? { descricao: i.descricao } : {}),
    unidade: i.unidade,
    ...(i.preco > 0 ? { precoSugerido: i.preco } : {}),
    ...(i.catalogoId ? { catalogoId: i.catalogoId } : {}),
  }));
}
