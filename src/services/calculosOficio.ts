import type { VerticalId } from './verticais';

/**
 * calculosOficio.ts — o MOTOR de ferramentas por ofício (data-driven). Cada `CalculoOficio`
 * é uma calculadora de campo: campos de entrada → resultado (linhas + resumo + item de
 * orçamento opcional), aterrada em NORMA/FÓRMULA real (ver docs/FERRAMENTAS_POR_NICHO.md,
 * pesquisado por enxame). A tela `FerramentasOficioScreen` renderiza as que casam com o
 * ofício da empresa (gate por vertical). Adicionar ferramenta = adicionar um item aqui.
 *
 * Tudo puro e offline (sem I/O, sem hardware). Onde não há NBR única, o `aviso` manda o
 * profissional confirmar no manual/norma — nunca finge exatidão que não tem.
 */

export interface CampoCalc {
  key: string;
  label: string;
  tipo: 'numero' | 'opcao';
  /** Para tipo 'opcao'. */
  opcoes?: { v: string; label: string }[];
  default?: string;
  sufixo?: string;
  placeholder?: string;
}

export interface LinhaResultado {
  label: string;
  valor: string;
  destaque?: boolean;
}

export interface ResultadoCalc {
  linhas: LinhaResultado[];
  /** Frase pronta (ex.: para copiar/observação). */
  resumo?: string;
  /** Item pré-montado para "adicionar ao orçamento". */
  itemOrcamento?: { nome: string; descricao: string };
  /** Ressalva técnica (norma/manual) — sempre mostrada quando presente. */
  aviso?: string;
}

export interface CalculoOficio {
  id: string;
  verticais: VerticalId[];
  nome: string;
  icon: string;
  descricao: string;
  /** Norma/base técnica (mostrada no rodapé da ferramenta). */
  base: string;
  campos: CampoCalc[];
  calcular: (v: Record<string, string>) => ResultadoCalc;
}

// ── helpers ────────────────────────────────────────────────
const num = (s: string | undefined) => {
  let t = (s ?? '').trim();
  if (!t) return 0;
  // Formato BR: vírgula = decimal, ponto = milhar. "1.234,56" → 1234.56.
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  // Sem vírgula, mas com grupos de milhar ("1.234" / "1.234.567") → remove os pontos.
  // (Um único "10.5" NÃO casa esse padrão e continua sendo decimal.)
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
};
const br = (n: number, casas = 0) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });

/** Capacidades comerciais de split (BTU/h) para arredondar "para cima". */
const CAPACIDADES_BTU = [9000, 12000, 18000, 22000, 24000, 30000, 36000, 48000, 60000];
function capacidadeComercial(btu: number): number {
  return CAPACIDADES_BTU.find((c) => c >= btu) ?? CAPACIDADES_BTU[CAPACIDADES_BTU.length - 1];
}

// ── as calculadoras ────────────────────────────────────────
export const CALCULOS: CalculoOficio[] = [
  // ─────────── HVAC / refrigeração ───────────
  {
    id: 'btu',
    verticais: ['refrigeracao'],
    nome: 'Calculadora de BTU',
    icon: 'air-conditioner',
    descricao: 'A capacidade certa do ar-condicionado pelo ambiente — sem sub ou superdimensionar.',
    base: 'Regra prática do setor (≈NBR 16401-1): 600 BTU/h·m² sem sol, 800 com sol; +600 por pessoa acima de 2 e +600 por eletrônico relevante.',
    campos: [
      { key: 'area', label: 'Área do ambiente', tipo: 'numero', sufixo: 'm²', placeholder: 'Ex.: 20' },
      { key: 'sol', label: 'Recebe sol / cobertura?', tipo: 'opcao', default: 'nao', opcoes: [{ v: 'nao', label: 'Sombra / sem sol' }, { v: 'sim', label: 'Sol direto / laje' }] },
      { key: 'pessoas', label: 'Pessoas no ambiente', tipo: 'numero', default: '2' },
      { key: 'eletronicos', label: 'Eletrônicos que esquentam (TV, PC, forno)', tipo: 'numero', default: '0' },
    ],
    calcular: (v) => {
      const area = Math.max(0, num(v.area));
      const porM2 = v.sol === 'sim' ? 800 : 600;
      const pessoasExtra = Math.max(0, num(v.pessoas) - 2);
      const btu = area * porM2 + pessoasExtra * 600 + Math.max(0, num(v.eletronicos)) * 600;
      const cap = capacidadeComercial(btu);
      return {
        linhas: [
          { label: 'Carga térmica calculada', valor: `${br(btu)} BTU/h` },
          { label: 'Aparelho recomendado', valor: `${br(cap)} BTU/h`, destaque: true },
        ],
        resumo: `Ambiente de ${br(area, 1)} m² → recomendado ${br(cap)} BTU/h.`,
        itemOrcamento: {
          nome: `Ar-condicionado ${br(cap)} BTU/h`,
          descricao: `Dimensionado para ${br(area, 1)} m² (${br(btu)} BTU/h de carga térmica).`,
        },
        aviso: 'Triagem rápida. Projeto grande/comercial exige memorial de carga térmica (NBR 16401 / ASHRAE).',
      };
    },
  },
  {
    id: 'carga_gas',
    verticais: ['refrigeracao'],
    nome: 'Carga de gás adicional',
    icon: 'gas-cylinder',
    descricao: 'Quantos gramas completar quando a tubulação passa do comprimento de fábrica.',
    base: 'Prática de fabricantes p/ R410A: ~20 g por metro excedente (9–12k BTU) e ~30 g/m (18–30k). Confirme a taxa no manual.',
    campos: [
      { key: 'cap', label: 'Capacidade do aparelho', tipo: 'opcao', default: '12000', opcoes: [
        { v: '9000', label: '9.000 BTU' }, { v: '12000', label: '12.000 BTU' }, { v: '18000', label: '18.000 BTU' },
        { v: '22000', label: '22.000 BTU' }, { v: '24000', label: '24.000 BTU' }, { v: '30000', label: '30.000+ BTU' },
      ] },
      { key: 'tubulacao', label: 'Comprimento real da tubulação', tipo: 'numero', sufixo: 'm', placeholder: 'Ex.: 7' },
      { key: 'padrao', label: 'Comprimento de fábrica (sem carga extra)', tipo: 'numero', sufixo: 'm', default: '5' },
      { key: 'cargaFabrica', label: 'Carga de fábrica (etiqueta, opcional)', tipo: 'numero', sufixo: 'g', default: '0' },
    ],
    calcular: (v) => {
      const cap = num(v.cap);
      const excedente = Math.max(0, num(v.tubulacao) - num(v.padrao));
      const taxa = cap >= 18000 ? 30 : 20; // g/m R410A
      const adicional = Math.round(excedente * taxa);
      const total = adicional + Math.max(0, num(v.cargaFabrica));
      return {
        linhas: [
          { label: 'Metros excedentes', valor: `${br(excedente, 1)} m` },
          { label: 'Taxa aplicada (R410A)', valor: `${taxa} g/m` },
          { label: 'Gás a completar', valor: `${br(adicional)} g`, destaque: true },
          ...(num(v.cargaFabrica) > 0 ? [{ label: 'Carga total no sistema', valor: `${br(total)} g` }] : []),
        ],
        resumo: `Completar ${br(adicional)} g de R410A (${br(excedente, 1)} m × ${taxa} g/m).`,
        aviso: 'Taxa e comprimento padrão variam por marca e por gás (R22/R32). Confirme sempre no manual do equipamento instalado.',
      };
    },
  },

  // ─────────── Hidráulica ───────────
  {
    id: 'caixa_agua',
    verticais: ['hidraulica'],
    nome: "Caixa d'água / reservatório",
    icon: 'water-outline',
    descricao: 'O volume do reservatório pelo número de moradores e a reserva desejada.',
    base: 'Consumo per capita usual 150–200 L/hab·dia; reserva de 1 dia (+ reserva de incêndio quando exigida). Ver NBR 5626.',
    campos: [
      { key: 'pessoas', label: 'Moradores / ocupantes', tipo: 'numero', placeholder: 'Ex.: 4' },
      { key: 'consumo', label: 'Consumo por pessoa/dia', tipo: 'numero', sufixo: 'L', default: '200' },
      { key: 'dias', label: 'Dias de reserva', tipo: 'numero', default: '1' },
    ],
    calcular: (v) => {
      const litros = Math.max(0, num(v.pessoas)) * Math.max(0, num(v.consumo)) * Math.max(1, num(v.dias));
      const comerciais = [310, 500, 750, 1000, 1500, 2000, 3000, 5000];
      const sugerida = comerciais.find((c) => c >= litros) ?? Math.ceil(litros / 1000) * 1000;
      return {
        linhas: [
          { label: 'Reserva necessária', valor: `${br(litros)} L` },
          { label: 'Caixa comercial sugerida', valor: `${br(sugerida)} L`, destaque: true },
        ],
        resumo: `${br(num(v.pessoas))} pessoas → reservatório de ${br(sugerida)} L.`,
        aviso: 'Some a reserva técnica de incêndio quando a edificação exigir (norma local/corpo de bombeiros).',
      };
    },
  },

  // ─────────── Pintura ───────────
  {
    id: 'massa',
    verticais: ['pintura'],
    nome: 'Massa / textura por m²',
    icon: 'wall',
    descricao: 'Quilos de massa corrida/textura pela área e demãos.',
    base: 'Rendimento típico: massa corrida ~1 kg/m² por demão; textura ~1–1,3 kg/m². Confira a embalagem do produto.',
    campos: [
      { key: 'area', label: 'Área a aplicar', tipo: 'numero', sufixo: 'm²', placeholder: 'Ex.: 40' },
      { key: 'demaos', label: 'Demãos', tipo: 'numero', default: '2' },
      { key: 'rendimento', label: 'Rendimento (kg/m² por demão)', tipo: 'numero', default: '1' },
    ],
    calcular: (v) => {
      const area = Math.max(0, num(v.area));
      const demaos = Math.max(1, Math.round(num(v.demaos)));
      const rend = Math.max(0.1, num(v.rendimento) || 1);
      const kg = Math.ceil(area * demaos * rend);
      return {
        linhas: [
          { label: 'Área total', valor: `${br(area, 1)} m² · ${demaos} demão${demaos > 1 ? 's' : ''}` },
          { label: 'Massa/textura necessária', valor: `${br(kg)} kg`, destaque: true },
        ],
        resumo: `${br(area, 1)} m² · ${demaos} demãos → ${br(kg)} kg.`,
        itemOrcamento: { nome: 'Massa / textura', descricao: `${br(area, 1)} m² · ${demaos} demãos → ${br(kg)} kg` },
        aviso: 'O rendimento varia por marca e por textura da superfície — confira a lata.',
      };
    },
  },

  // ─────────── Dedetização ───────────
  {
    id: 'diluicao',
    verticais: ['dedetizacao'],
    nome: 'Diluição e consumo de produto',
    icon: 'flask-outline',
    descricao: 'Quanto de produto concentrado e de calda para a área a tratar.',
    base: 'Calda = área × taxa de aplicação (L/m²); concentrado = calda × (diluição %). Siga o rótulo/FDS do saneante registrado na ANVISA.',
    campos: [
      { key: 'area', label: 'Área a tratar', tipo: 'numero', sufixo: 'm²', placeholder: 'Ex.: 200' },
      { key: 'taxa', label: 'Taxa de aplicação', tipo: 'numero', sufixo: 'L/m²', default: '0.05' },
      { key: 'diluicao', label: 'Diluição do produto', tipo: 'numero', sufixo: '%', default: '2', placeholder: 'Ex.: 2' },
    ],
    calcular: (v) => {
      const area = Math.max(0, num(v.area));
      const taxa = Math.max(0, num(v.taxa));
      const dil = Math.max(0, num(v.diluicao)) / 100;
      const calda = area * taxa; // litros
      const concentrado = calda * dil * 1000; // ml
      const agua = Math.max(0, calda - concentrado / 1000);
      return {
        linhas: [
          { label: 'Calda total', valor: `${br(calda, 2)} L` },
          { label: 'Produto concentrado', valor: `${br(concentrado)} ml`, destaque: true },
          { label: 'Água', valor: `${br(agua, 2)} L` },
        ],
        resumo: `${br(area)} m² → ${br(calda, 2)} L de calda (${br(concentrado)} ml de produto a ${br(num(v.diluicao))}%).`,
        aviso: 'A taxa e a diluição corretas vêm do RÓTULO/FDS do saneante registrado na ANVISA — este cálculo é auxiliar.',
      };
    },
  },

  // ─────────── Jardinagem ───────────
  {
    id: 'grama',
    verticais: ['jardinagem'],
    nome: 'Grama em placa + adubo',
    icon: 'grass',
    descricao: 'Placas de grama e adubo de plantio pela área.',
    base: 'Placa de grama cobre ~0,5 m² (padrão comum); +5–10% de perda no corte/ajuste. Adubo de plantio conforme o produto.',
    campos: [
      { key: 'area', label: 'Área a gramar', tipo: 'numero', sufixo: 'm²', placeholder: 'Ex.: 100' },
      { key: 'placa', label: 'Cobertura por placa', tipo: 'numero', sufixo: 'm²', default: '0.5' },
      { key: 'perda', label: 'Perda (corte/ajuste)', tipo: 'numero', sufixo: '%', default: '8' },
      { key: 'adubo', label: 'Adubo de plantio', tipo: 'numero', sufixo: 'g/m²', default: '100' },
    ],
    calcular: (v) => {
      const area = Math.max(0, num(v.area));
      const cobertura = Math.max(0.01, num(v.placa) || 0.5);
      const perda = 1 + Math.max(0, num(v.perda)) / 100;
      const placas = Math.ceil((area / cobertura) * perda);
      const aduboKg = (area * Math.max(0, num(v.adubo))) / 1000;
      return {
        linhas: [
          { label: 'Placas de grama', valor: `${br(placas)} placas`, destaque: true },
          { label: 'Adubo de plantio', valor: `${br(aduboKg, 1)} kg` },
        ],
        resumo: `${br(area)} m² → ${br(placas)} placas + ${br(aduboKg, 1)} kg de adubo.`,
        itemOrcamento: { nome: 'Grama em placa', descricao: `${br(area)} m² → ${br(placas)} placas (${br(num(v.perda))}% de perda)` },
      };
    },
  },
];

/**
 * As calculadoras que um ofício vê (gate por vertical). Aceita a LISTA de verticais
 * da empresa (multi-ofício) — mostra as calculadoras de QUALQUER uma. Sem vertical,
 * lista vazia, ou 'geral' = todas.
 */
export function calculosDoOficio(verticais: VerticalId | VerticalId[] | undefined): CalculoOficio[] {
  const arr = verticais == null ? [] : Array.isArray(verticais) ? verticais : [verticais];
  if (arr.length === 0 || arr.includes('geral')) return CALCULOS;
  return CALCULOS.filter((c) => c.verticais.some((v) => arr.includes(v)));
}

/**
 * Há ALGUMA calculadora visível para este ofício? Usa a MESMA função de gate do
 * resto do app (`mostraVertical`, de useVerticais) — assim o atalho "Ferramentas
 * do ofício" só aparece para quem tem calculadora (some p/ elétrica, que ainda
 * não tem; aparece p/ HVAC, pintura, etc.), sem duplicar a regra de backward-compat.
 */
export function haCalculoParaOficio(mostraVertical: (v: VerticalId) => boolean): boolean {
  return CALCULOS.some((c) => c.verticais.some((v) => mostraVertical(v)));
}
