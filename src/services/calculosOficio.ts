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
// ─────────── HVAC / refrigeração — diagnóstico e instalação ───────────
{
  id: 'sh_sc',
  verticais: ['refrigeracao'],
  nome: 'Superaquecimento e Subresfriamento (SH/SC)',
  icon: 'thermometer',
  descricao: 'Diagnóstico rápido da carga de gás a partir das temperaturas de sucção e de líquido.',
  base: 'SH = T_sucção − T_saturação_evap; SC = T_saturação_cond − T_linha_líquido (temperaturas de saturação lidas na escala P-T do manifold para o gás usado). Alvo típico em TXV/EEV: SC ≈4–7 °C (8–12 °F). Em capilar/orifício fixo, o alvo de SH segue o Target Superheat Chart do fabricante (Copeland/Carrier) — ajuste os campos de alvo, pois variam com bulbo seco externo e úmido interno.',
  campos: [
    { key: 'gas', label: 'Gás refrigerante', tipo: 'opcao', default: 'r410a', opcoes: [
      { v: 'r410a', label: 'R410A' }, { v: 'r22', label: 'R22' }, { v: 'r404a', label: 'R404A' },
      { v: 'r32', label: 'R32' }, { v: 'r290', label: 'R290' }, { v: 'r134a', label: 'R134a' },
    ] },
    { key: 'valvula', label: 'Tipo de válvula de expansão', tipo: 'opcao', default: 'txv', opcoes: [
      { v: 'txv', label: 'TXV / EEV (termostática/eletrônica)' }, { v: 'fixo', label: 'Capilar / orifício fixo' },
    ] },
    { key: 'tSuccao', label: 'Temp. da linha de sucção (bulbo)', tipo: 'numero', sufixo: '°C', placeholder: 'Ex.: 12' },
    { key: 'tSatEvap', label: 'Temp. de saturação de evaporação (P-T do gás)', tipo: 'numero', sufixo: '°C', placeholder: 'Ex.: 5' },
    { key: 'tLiquido', label: 'Temp. da linha de líquido', tipo: 'numero', sufixo: '°C', placeholder: 'Ex.: 40' },
    { key: 'tSatCond', label: 'Temp. de saturação de condensação (P-T do gás)', tipo: 'numero', sufixo: '°C', placeholder: 'Ex.: 45' },
    { key: 'alvoSh', label: 'Superaquecimento alvo (SH)', tipo: 'numero', sufixo: '°C', default: '6' },
    { key: 'alvoSc', label: 'Subresfriamento alvo (SC)', tipo: 'numero', sufixo: '°C', default: '6' },
    { key: 'tolerancia', label: 'Tolerância de diagnóstico', tipo: 'numero', sufixo: '°C', default: '2' },
  ],
  calcular: (v) => {
    const sh = num(v.tSuccao) - num(v.tSatEvap);
    const sc = num(v.tSatCond) - num(v.tLiquido);
    const alvoSh = num(v.alvoSh) || 6;
    const alvoSc = num(v.alvoSc) || 6;
    const tol = Math.max(0.5, num(v.tolerancia) || 2);

    const shAlto = sh > alvoSh + tol;
    const shBaixo = sh < alvoSh - tol;
    const scAlto = sc > alvoSc + tol;
    const scBaixo = sc < alvoSc - tol;

    let veredito: string;
    if (shAlto && scBaixo) veredito = 'Carga BAIXA (SH alto + SC baixo)';
    else if (shBaixo && scAlto) veredito = 'Carga ALTA / excesso (SH baixo + SC alto)';
    else if (!shAlto && !shBaixo && !scAlto && !scBaixo) veredito = 'Carga CORRETA (SH e SC dentro da faixa-alvo)';
    else veredito = 'Indefinido — SH e SC não convergem para um mesmo diagnóstico; revise leituras/válvula';

    const gasLabel = (v.gas || 'r410a').toUpperCase();
    let aviso = `Temperaturas de saturação devem ser lidas na escala P-T do manifold para ${gasLabel} (ou tabela do gás). Diagnóstico indicativo — não substitui a análise do técnico.`;
    if (v.valvula === 'fixo') {
      aviso += ' Em capilar/orifício fixo, o alvo de SH real vem do Target Superheat Chart do fabricante (varia com bulbo seco externo e úmido interno) — o valor acima é só um ponto de partida editável.';
    } else {
      aviso += ' Em TXV/EEV, confirme a faixa de SC recomendada no manual do fabricante (varia por modelo).';
    }

    return {
      linhas: [
        { label: 'Superaquecimento (SH)', valor: `${br(sh, 1)} °C`, destaque: true },
        { label: 'Subresfriamento (SC)', valor: `${br(sc, 1)} °C`, destaque: true },
        { label: 'Alvo SH / SC', valor: `${br(alvoSh, 1)} °C / ${br(alvoSc, 1)} °C` },
        { label: 'Diagnóstico', valor: veredito, destaque: true },
      ],
      resumo: `SH ${br(sh, 1)} °C · SC ${br(sc, 1)} °C (${gasLabel}) → ${veredito}.`,
      itemOrcamento: {
        nome: 'Diagnóstico de carga de refrigerante',
        descricao: `SH ${br(sh, 1)} °C / SC ${br(sc, 1)} °C (${gasLabel}) — ${veredito}.`,
      },
      aviso,
    };
  },
},
{
  id: 'disjuntor_compressor',
  verticais: ['refrigeracao'],
  nome: 'Disjuntor e bitola do compressor',
  icon: 'fuse',
  descricao: 'Disjuntor e seção mínima do condutor pela corrente de placa do compressor, com margem de partida.',
  base: 'NBR 5410 §5.3.4.1: Ib ≤ In ≤ Iz, com margem prática de +25% sobre a corrente nominal para a partida do motor (In comercial já cobre I2 ≤ 1,45·Iz dos disjuntores termomagnéticos padrão). Ampacidade de referência: tabela do método B1 (eletroduto embutido em alvenaria, cobre/PVC 70 °C) — a mais conservadora entre os métodos comuns de instalação; em método aparente/ventilado (B2/C) a bitola pode ser otimizada consultando a tabela completa da norma. Curvas conforme NBR IEC 60898 (D: 10–20× In, típica para motores em partida direta).',
  campos: [
    { key: 'ib', label: 'Corrente nominal do compressor (placa)', tipo: 'numero', sufixo: 'A', placeholder: 'Ex.: 8.5' },
    { key: 'circuito', label: 'Circuito', tipo: 'opcao', default: 'mono', opcoes: [
      { v: 'mono', label: 'Monofásico' }, { v: 'tri', label: 'Trifásico' },
    ] },
    { key: 'tensao', label: 'Tensão do circuito', tipo: 'opcao', default: '220', opcoes: [
      { v: '127', label: '127 V' }, { v: '220', label: '220 V' }, { v: '380', label: '380 V' }, { v: '440', label: '440 V' },
    ] },
    { key: 'curva', label: 'Curva do disjuntor (partida do motor)', tipo: 'opcao', default: 'd', opcoes: [
      { v: 'c', label: 'C (5–10× In)' }, { v: 'd', label: 'D (10–20× In, motores)' },
    ] },
    { key: 'comprimento', label: 'Comprimento até o quadro (p/ queda de tensão)', tipo: 'numero', sufixo: 'm', default: '0' },
    { key: 'resistividade', label: 'Resistividade do cobre (ref., a quente)', tipo: 'numero', sufixo: 'Ω·mm²/m', default: '0.0178' },
  ],
  calcular: (v) => {
    const SECOES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95];
    const AMPACIDADE_B1 = [14.5, 19.5, 26, 34, 46, 61, 80, 99, 119, 151, 182]; // NBR 5410, método B1, 3 condutores carregados
    const DISJUNTORES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];

    const ib = Math.max(0.1, num(v.ib));
    const inCalc = ib * 1.25;
    const disjuntor = DISJUNTORES.find((d) => d >= inCalc) ?? DISJUNTORES[DISJUNTORES.length - 1];
    const idx = AMPACIDADE_B1.findIndex((a) => a >= disjuntor);
    const secaoIdx = idx === -1 ? AMPACIDADE_B1.length - 1 : idx;
    const secao = SECOES[secaoIdx];
    const curva = (v.curva || 'd').toUpperCase();

    const L = Math.max(0, num(v.comprimento));
    const V = num(v.tensao) || 220;
    const rho = num(v.resistividade) || 0.0178;
    const fator = v.circuito === 'tri' ? Math.sqrt(3) : 2;
    const quedaPct = L > 0 ? (fator * rho * L * ib) / (secao * V) * 100 : 0;

    let aviso = 'Ampacidade de referência: NBR 5410, método B1 (a mais conservadora entre os métodos comuns) — em instalação aparente/ventilada a bitola pode ser otimizada consultando a tabela completa da norma. A curva do disjuntor deve considerar o método real de partida do compressor (direta, com capacitor ou soft-starter) — confirme no manual.';
    if (L > 0 && quedaPct > 4) {
      aviso += ` Atenção: queda de tensão estimada (${br(quedaPct, 2)}%) excede o limite de 4% da NBR 5410 para circuito terminal — considere aumentar a bitola.`;
    }

    return {
      linhas: [
        { label: 'Corrente de projeto (Ib × 1,25)', valor: `${br(inCalc, 1)} A` },
        { label: 'Disjuntor recomendado', valor: `${disjuntor} A curva ${curva}`, destaque: true },
        { label: 'Seção mínima do condutor', valor: `${br(secao, 1)} mm²`, destaque: true },
        ...(L > 0 ? [{ label: 'Queda de tensão estimada', valor: `${br(quedaPct, 2)} %` }] : []),
      ],
      resumo: `Compressor ${br(ib, 1)} A → disjuntor ${disjuntor} A curva ${curva} + condutor ${br(secao, 1)} mm² (método B1).`,
      itemOrcamento: {
        nome: 'Circuito do compressor',
        descricao: `Disjuntor ${disjuntor} A curva ${curva}, condutor ${br(secao, 1)} mm² (${v.circuito === 'tri' ? 'trifásico' : 'monofásico'}, ${br(V)} V).`,
      },
      aviso,
    };
  },
},
{
  id: 'vacuo',
  verticais: ['refrigeracao'],
  nome: 'Laudo de vácuo e estanqueidade',
  icon: 'gauge',
  descricao: 'Check rápido do teste de vácuo (bomba isolada) contra a exigência de garantia do fabricante.',
  base: 'Exigência usual de FABRICANTE para validar garantia: vácuo-alvo ≤500 microns (0,5 torr), com decaimento dentro da tolerância após isolar a bomba. Sem NBR residencial específica — diretrizes de fabricante/RETA/ASHRAE; confirme o valor-alvo no manual do equipamento instalado.',
  campos: [
    { key: 'vacuoAtingido', label: 'Vácuo atingido (bomba ligada)', tipo: 'numero', sufixo: 'microns', placeholder: 'Ex.: 300' },
    { key: 'alvo', label: 'Vácuo-alvo (garantia do fabricante)', tipo: 'numero', sufixo: 'microns', default: '500' },
    { key: 'tempoEspera', label: 'Tempo de espera (bomba isolada)', tipo: 'numero', sufixo: 'min', default: '10' },
    { key: 'vacuoAposEspera', label: 'Vácuo após o tempo de espera (isolado)', tipo: 'numero', sufixo: 'microns', placeholder: 'Ex.: 450' },
    { key: 'decaimentoMax', label: 'Decaimento máx. aceitável no teste', tipo: 'numero', sufixo: 'microns', default: '250' },
  ],
  calcular: (v) => {
    const atingido = Math.max(0, num(v.vacuoAtingido));
    const alvo = Math.max(1, num(v.alvo) || 500);
    const aposEspera = Math.max(0, num(v.vacuoAposEspera));
    const decaimento = aposEspera - atingido;
    const decaimentoMax = Math.max(0, num(v.decaimentoMax) || 250);
    const tempoEspera = Math.max(0, num(v.tempoEspera) || 10);

    const aprovado = atingido <= alvo && decaimento <= decaimentoMax;
    const veredito = aprovado ? 'APROVADO' : 'REPROVADO';

    return {
      linhas: [
        { label: 'Vácuo atingido', valor: `${br(atingido)} microns (alvo ≤${br(alvo)})` },
        { label: `Vácuo após ${br(tempoEspera)} min isolado`, valor: `${br(aposEspera)} microns` },
        { label: 'Decaimento no teste', valor: `${br(decaimento)} microns (máx. ${br(decaimentoMax)})` },
        { label: 'Resultado', valor: veredito, destaque: true },
      ],
      resumo: `Vácuo de ${br(atingido)} microns (alvo ≤${br(alvo)}); após ${br(tempoEspera)} min isolado subiu para ${br(aposEspera)} microns (decaimento de ${br(decaimento)}) → ${veredito}.`,
      itemOrcamento: {
        nome: 'Teste de vácuo e estanqueidade',
        descricao: `Vácuo ${br(atingido)} microns, decaimento ${br(decaimento)} microns em ${br(tempoEspera)} min → ${veredito}.`,
      },
      aviso: 'Vácuo ≤500 microns é exigência usual de FABRICANTE para validar a garantia (sem NBR residencial específica) — confirme o valor no manual do equipamento. Decaimento acentuado e contínuo indica vazamento; estabilização num patamar alto pode indicar umidade residual (nova evacuação tripla). Diagnóstico fino segue diretrizes RETA/ASHRAE e a experiência do técnico — este check é rápido, não substitui o laudo assinado.',
    };
  },
},

// ─────────── Elétrica ───────────
{
  id: 'dimensionamento_circuito',
  verticais: ['eletrica'],
  nome: 'Dimensionador de Circuito',
  icon: 'flash',
  descricao: 'A bitola do condutor e o disjuntor certos pela carga do circuito — NBR 5410.',
  base: 'NBR 5410 §6.2.5: Ib ≤ In ≤ Iz (corrente de projeto ≤ disjuntor ≤ ampacidade do cabo). Ampacidade de referência = Tabela 36 (cobre, isolação PVC 70°C, 30°C ambiente, métodos B1 e C, sem fator de agrupamento). Seção mínima 1,5 mm² p/ iluminação e 2,5 mm² p/ tomadas (NBR 5410 §6.2.3.1). Curvas de disjuntor NBR IEC 60898: B (3–5×In, resistivo/iluminação), C (5–10×In, motor pequeno).',
  campos: [
    { key: 'potencia', label: 'Potência da carga', tipo: 'numero', sufixo: 'W', placeholder: 'Ex.: 5500 (chuveiro)' },
    { key: 'tensao', label: 'Tensão do circuito', tipo: 'opcao', default: '220', opcoes: [
      { v: '127', label: '127 V' }, { v: '220', label: '220 V' }, { v: '380', label: '380 V' },
    ] },
    { key: 'fases', label: 'Tipo de circuito', tipo: 'opcao', default: 'mono', opcoes: [
      { v: 'mono', label: 'Monofásico / bifásico (F+N ou F+F)' }, { v: 'tri', label: 'Trifásico (3F ou 3F+N)' },
    ] },
    { key: 'tipoCircuito', label: 'Natureza da carga', tipo: 'opcao', default: 'tug', opcoes: [
      { v: 'iluminacao', label: 'Iluminação (mín. 1,5 mm²)' },
      { v: 'tug', label: 'Tomadas de uso geral (mín. 2,5 mm²)' },
      { v: 'resistivo', label: 'Chuveiro / forno / resistivo' },
      { v: 'motor', label: 'Motor / compressor / bomba' },
    ] },
    { key: 'metodo', label: 'Método de instalação', tipo: 'opcao', default: 'B1', opcoes: [
      { v: 'B1', label: 'Eletroduto embutido em alvenaria (B1)' },
      { v: 'C', label: 'Direto na parede / eletrocalha (C)' },
    ] },
  ],
  calcular: (v) => {
    const tensaoV = num(v.tensao) || 220;
    const potencia = Math.max(0, num(v.potencia));
    const fasesTri = v.fases === 'tri';
    const ib = fasesTri ? potencia / (tensaoV * Math.sqrt(3)) : potencia / tensaoV;
    const carregados = fasesTri ? 3 : 2;
    const minima = v.tipoCircuito === 'iluminacao' ? 1.5 : 2.5;
    const curva = v.tipoCircuito === 'motor' ? 'C' : 'B';
    const metodo = v.metodo === 'C' ? 'C' : 'B1';

    const DISJUNTORES = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
    const inNominal = DISJUNTORES.find((d) => d >= ib) ?? DISJUNTORES[DISJUNTORES.length - 1];

    // Tabela 36 (NBR 5410) simplificada: cobre, PVC 70°C, 30°C ambiente, métodos B1/C,
    // ampacidade (A) p/ 2 ou 3 condutores carregados no mesmo eletroduto.
    const TABELA = [
      { s: 1.5, b1_2: 17.5, b1_3: 15.5, c_2: 19.5, c_3: 17.5 },
      { s: 2.5, b1_2: 24, b1_3: 21, c_2: 27, c_3: 24 },
      { s: 4, b1_2: 32, b1_3: 28, c_2: 36, c_3: 32 },
      { s: 6, b1_2: 41, b1_3: 36, c_2: 46, c_3: 41 },
      { s: 10, b1_2: 57, b1_3: 50, c_2: 63, c_3: 57 },
      { s: 16, b1_2: 76, b1_3: 68, c_2: 85, c_3: 76 },
      { s: 25, b1_2: 101, b1_3: 89, c_2: 112, c_3: 101 },
      { s: 35, b1_2: 125, b1_3: 111, c_2: 138, c_3: 125 },
      { s: 50, b1_2: 151, b1_3: 134, c_2: 168, c_3: 151 },
      { s: 70, b1_2: 192, b1_3: 171, c_2: 213, c_3: 192 },
      { s: 95, b1_2: 232, b1_3: 207, c_2: 258, c_3: 232 },
      { s: 120, b1_2: 269, b1_3: 239, c_2: 299, c_3: 269 },
    ];
    let escolhido = TABELA[TABELA.length - 1];
    for (const sec of TABELA) {
      if (sec.s < minima) continue;
      const iz = metodo === 'C' ? (carregados >= 3 ? sec.c_3 : sec.c_2) : (carregados >= 3 ? sec.b1_3 : sec.b1_2);
      if (iz >= inNominal) { escolhido = sec; break; }
    }
    const iz = metodo === 'C' ? (carregados >= 3 ? escolhido.c_3 : escolhido.c_2) : (carregados >= 3 ? escolhido.b1_3 : escolhido.b1_2);

    return {
      linhas: [
        { label: 'Corrente de projeto (Ib)', valor: `${br(ib, 1)} A` },
        { label: 'Disjuntor recomendado', valor: `${inNominal} A · curva ${curva}`, destaque: true },
        { label: 'Bitola mínima do condutor', valor: `${br(escolhido.s, 1)} mm²`, destaque: true },
        { label: 'Ampacidade do cabo escolhido (Iz)', valor: `${br(iz, 1)} A` },
      ],
      resumo: `${br(potencia)} W (${tensaoV} V, ${fasesTri ? 'trifásico' : 'monofásico'}) → Ib ${br(ib, 1)} A → disjuntor ${inNominal} A curva ${curva} + condutor ${br(escolhido.s, 1)} mm².`,
      itemOrcamento: {
        nome: `Circuito ${br(escolhido.s, 1)} mm² · disjuntor ${inNominal} A`,
        descricao: `Carga de ${br(potencia)} W em ${tensaoV} V — disjuntor ${inNominal} A curva ${curva}, condutor ${br(escolhido.s, 1)} mm² (método ${metodo}).`,
      },
      aviso: 'Cálculo de referência (Ib≤In≤Iz, NBR 5410 §6.2.5) com fator de potência ≈1 e ampacidade da Tabela 36 sem fator de agrupamento (base: 30°C ambiente, PVC 70°C). Mais de 1 circuito no mesmo eletroduto, temperatura ambiente acima de 30°C ou motor com partida pesada (pode exigir curva D) reduzem a ampacidade/mudam a curva — confirme com um memorial de dimensionamento em instalações maiores.',
    };
  },
},

{
  id: 'eletroduto',
  verticais: ['eletrica'],
  nome: 'Calculadora de Eletroduto',
  icon: 'pipe',
  descricao: 'O diâmetro mínimo do eletroduto pela quantidade e diâmetro dos cabos — taxa de ocupação NBR 5410.',
  base: 'NBR 5410 §6.2.11.1: taxa de ocupação máxima 53% (1 cabo), 31% (2 cabos), 40% (3 ou mais cabos). Diâmetro externo aproximado (cabo flexível PVC 450/750 V, referência de catálogo — ajuste ao cabo real): 1,5mm²≈2,8mm · 2,5mm²≈3,3mm · 4mm²≈3,8mm · 6mm²≈4,4mm · 10mm²≈5,9mm · 16mm²≈6,9mm · 25mm²≈8,3mm.',
  campos: [
    { key: 'bitola', label: 'Bitola do cabo (só p/ referência no resultado)', tipo: 'numero', sufixo: 'mm²', default: '2.5', placeholder: 'Ex.: 2,5' },
    { key: 'diametroCabo', label: 'Diâmetro externo do cabo', tipo: 'numero', sufixo: 'mm', default: '3.3', placeholder: 'Ver tabela acima ↑' },
    { key: 'quantidade', label: 'Quantidade de cabos no mesmo eletroduto', tipo: 'numero', default: '3', placeholder: 'Ex.: 3 (fase+neutro+terra)' },
  ],
  calcular: (v) => {
    const qtd = Math.max(1, Math.round(num(v.quantidade)) || 1);
    const d = Math.max(0.1, num(v.diametroCabo) || 3.3);
    const bitolaRef = num(v.bitola) || 2.5;
    const areaCabos = qtd * (Math.PI / 4) * d * d;
    const taxaMax = qtd === 1 ? 0.53 : qtd === 2 ? 0.31 : 0.4;
    const diMin = 2 * Math.sqrt(areaCabos / taxaMax / Math.PI);

    // Diâmetros internos aproximados de eletroduto rígido roscável PVC (referência de catálogo).
    const COMERCIAIS = [
      { nome: '1/2"', di: 16.5 },
      { nome: '3/4"', di: 22.0 },
      { nome: '1"', di: 28.0 },
      { nome: '1.1/4"', di: 36.9 },
      { nome: '1.1/2"', di: 42.7 },
      { nome: '2"', di: 54.3 },
      { nome: '2.1/2"', di: 62.9 },
      { nome: '3"', di: 78.5 },
      { nome: '4"', di: 102.3 },
    ];
    const sugerido = COMERCIAIS.find((c) => c.di >= diMin) ?? COMERCIAIS[COMERCIAIS.length - 1];
    const areaEletrodutoEscolhido = (Math.PI / 4) * sugerido.di * sugerido.di;
    const ocupacaoReal = (areaCabos / areaEletrodutoEscolhido) * 100;

    return {
      linhas: [
        { label: 'Cabos no eletroduto', valor: `${qtd} × ${br(bitolaRef, 1)} mm² (Ø${br(d, 1)} mm cada)` },
        { label: 'Taxa máxima de ocupação (NBR 5410)', valor: `${br(taxaMax * 100)}%` },
        { label: 'Diâmetro interno mínimo', valor: `${br(diMin, 1)} mm` },
        { label: 'Eletroduto comercial sugerido', valor: sugerido.nome, destaque: true },
        { label: 'Ocupação real no eletroduto sugerido', valor: `${br(ocupacaoReal, 1)}%` },
      ],
      resumo: `${qtd} cabos (Ø${br(d, 1)} mm) → eletroduto ${sugerido.nome} (ocupação ${br(ocupacaoReal, 1)}% de ${br(taxaMax * 100)}% máx.).`,
      itemOrcamento: {
        nome: `Eletroduto ${sugerido.nome}`,
        descricao: `${qtd} cabos de ${br(bitolaRef, 1)} mm² no mesmo eletroduto — ocupação de ${br(ocupacaoReal, 1)}%.`,
      },
      aviso: 'Diâmetro externo do cabo é referência de catálogo (cabo flexível PVC 450/750 V) — cabo rígido ou de outro fabricante muda o valor; confirme na ficha técnica. O diâmetro interno do eletroduto também varia ~1 mm entre marcas — tabela acima é aproximada (NBR 5410 §6.2.11.1).',
    };
  },
},

{
  id: 'queda_tensao',
  verticais: ['eletrica'],
  nome: 'Queda de Tensão',
  icon: 'sine-wave',
  descricao: 'A queda de tensão (%) no circuito pela bitola, distância e corrente — dentro do limite da NBR 5410?',
  base: 'ΔV = k·ρ·L·I / S (k=2 monofásico [ida+volta], k=√3 trifásico); %ΔV = ΔV/V×100. Limites NBR 5410: 4% no circuito terminal, 3% da origem ao quadro de distribuição, 7% no total origem-uso.',
  campos: [
    { key: 'corrente', label: 'Corrente do circuito', tipo: 'numero', sufixo: 'A', placeholder: 'Ex.: 25' },
    { key: 'secao', label: 'Bitola do condutor', tipo: 'numero', sufixo: 'mm²', placeholder: 'Ex.: 2,5' },
    { key: 'comprimento', label: 'Distância até a carga (só ida)', tipo: 'numero', sufixo: 'm', placeholder: 'Ex.: 20' },
    { key: 'tensao', label: 'Tensão', tipo: 'opcao', default: '220', opcoes: [
      { v: '127', label: '127 V' }, { v: '220', label: '220 V' }, { v: '380', label: '380 V' },
    ] },
    { key: 'fases', label: 'Circuito', tipo: 'opcao', default: 'mono', opcoes: [
      { v: 'mono', label: 'Monofásico / bifásico' }, { v: 'tri', label: 'Trifásico' },
    ] },
    { key: 'resistividade', label: 'Resistividade do condutor (cobre ≈0,0225; alumínio ≈0,036)', tipo: 'numero', sufixo: 'Ω·mm²/m', default: '0.0225' },
    { key: 'trecho', label: 'Trecho avaliado', tipo: 'opcao', default: 'terminal', opcoes: [
      { v: 'terminal', label: 'Circuito terminal (limite 4%)' },
      { v: 'origem-qd', label: 'Origem até o quadro (limite 3%)' },
      { v: 'total', label: 'Origem até o uso (limite 7%)' },
    ] },
  ],
  calcular: (v) => {
    const tensaoV = num(v.tensao) || 220;
    const fasesTri = v.fases === 'tri';
    const k = fasesTri ? Math.sqrt(3) : 2;
    const secao = Math.max(0.1, num(v.secao));
    const comprimento = Math.max(0, num(v.comprimento));
    const corrente = Math.max(0, num(v.corrente));
    const resistividade = num(v.resistividade) || 0.0225;
    const deltaV = (k * resistividade * comprimento * corrente) / secao;
    const percentual = tensaoV > 0 ? (deltaV / tensaoV) * 100 : 0;
    const limites: Record<string, number> = { terminal: 4, 'origem-qd': 3, total: 7 };
    const limite = limites[v.trecho] ?? 4;
    const dentro = percentual <= limite;
    const trechoLabel = v.trecho === 'origem-qd' ? 'origem→QD' : v.trecho === 'total' ? 'origem→uso' : 'circuito terminal';

    return {
      linhas: [
        { label: 'Queda de tensão', valor: `${br(deltaV, 2)} V` },
        { label: 'Queda percentual', valor: `${br(percentual, 2)}%`, destaque: true },
        { label: `Limite NBR 5410 (${trechoLabel})`, valor: `${limite}%` },
        { label: 'Situação', valor: dentro ? 'Dentro do limite' : 'ACIMA DO LIMITE — aumente a bitola', destaque: !dentro },
      ],
      resumo: `${br(secao, 1)} mm² · ${br(comprimento, 1)} m · ${br(corrente, 1)} A (${fasesTri ? 'trifásico' : 'monofásico'}, ${tensaoV} V) → queda de ${br(percentual, 2)}% (limite ${limite}%) — ${dentro ? 'dentro do limite' : 'acima do limite'}.`,
      aviso: 'Fórmula resistiva simplificada (ΔV=k·ρ·L·I/S; fator de potência ≈1) — NBR 5410 admite 4% no circuito terminal, 3% da origem ao quadro de distribuição e 7% no total origem-uso. 0,0225 Ω·mm²/m é referência do cobre a ~70°C de operação (ajuste para alumínio ≈0,036 ou outra temperatura); motores com reatância relevante podem exigir cálculo com impedância.',
    };
  },
},

{
    id: 'agua_fria_pesos',
    verticais: ['hidraulica'],
    nome: 'Tubulação de água fria (método dos pesos)',
    icon: 'pipe',
    descricao: 'O diâmetro mínimo do trecho pelas peças de utilização atendidas.',
    base: 'NBR 5626: Q (L/s) = 0,30 × √(ΣPesos); diâmetro escolhido p/ velocidade ≤ 3,0 m/s (di aprox. de tubo soldável PVC, NBR 5648). Pressão estática máx. recomendada: 400 kPa.',
    campos: [
      { key: 'bacia', label: 'Bacia sanitária (caixa de descarga)', tipo: 'numero', default: '0' },
      { key: 'lavatorio', label: 'Lavatório', tipo: 'numero', default: '0' },
      { key: 'chuveiro', label: 'Chuveiro / ducha', tipo: 'numero', default: '0' },
      { key: 'pia', label: 'Pia de cozinha', tipo: 'numero', default: '0' },
      { key: 'tanque', label: 'Tanque de lavagem', tipo: 'numero', default: '0' },
      { key: 'maquina', label: 'Máquina de lavar roupa', tipo: 'numero', default: '0' },
      { key: 'banheira', label: 'Banheira', tipo: 'numero', default: '0' },
      { key: 'torneira', label: 'Torneira de jardim / uso geral', tipo: 'numero', default: '0' },
      { key: 'pressao', label: 'Pressão estática disponível no trecho', tipo: 'numero', sufixo: 'kPa', placeholder: 'Ex.: 200' },
    ],
    calcular: (v) => {
      const PESOS: Record<string, number> = { bacia: 0.3, lavatorio: 0.3, chuveiro: 0.4, pia: 0.7, tanque: 0.3, maquina: 1.0, banheira: 1.0, torneira: 0.4 };
      const somaPesos = Object.keys(PESOS).reduce((acc, k) => acc + Math.max(0, num(v[k])) * PESOS[k], 0);
      const qLs = 0.3 * Math.sqrt(somaPesos);
      const qM3s = qLs / 1000;
      // Diâmetros comerciais de tubo soldável PVC (NBR 5648) — di aproximado (mm), confirmar no fabricante.
      const TUBOS = [
        { nom: 20, di: 17.0, pol: '1/2"' },
        { nom: 25, di: 21.6, pol: '3/4"' },
        { nom: 32, di: 27.8, pol: '1"' },
        { nom: 40, di: 35.2, pol: '1.1/4"' },
        { nom: 50, di: 44.0, pol: '1.1/2"' },
        { nom: 60, di: 53.4, pol: '2"' },
        { nom: 75, di: 66.6, pol: '2.1/2"' },
      ];
      let escolhido = TUBOS[TUBOS.length - 1];
      let velocidade = 0;
      for (const t of TUBOS) {
        const areaM2 = (Math.PI / 4) * Math.pow(t.di / 1000, 2);
        const vel = qM3s / areaM2;
        if (vel <= 3.0) { escolhido = t; velocidade = vel; break; }
        velocidade = vel;
      }
      const pressaoKPa = Math.max(0, num(v.pressao));
      const pressaoAlta = pressaoKPa > 400;
      return {
        linhas: [
          { label: 'Peso total do trecho (ΣP)', valor: br(somaPesos, 2) },
          { label: 'Vazão estimada (Q)', valor: `${br(qLs, 2)} L/s` },
          { label: 'Diâmetro mínimo', valor: `${escolhido.nom} mm (${escolhido.pol})`, destaque: true },
          { label: 'Velocidade no trecho', valor: `${br(velocidade, 2)} m/s` },
        ],
        resumo: `ΣP=${br(somaPesos, 2)} → Q=${br(qLs, 2)} L/s → tubo mínimo Ø${escolhido.nom} mm (${escolhido.pol}).`,
        itemOrcamento: {
          nome: `Tubulação água fria Ø${escolhido.nom} mm`,
          descricao: `Dimensionado pelo método dos pesos (NBR 5626): ΣP=${br(somaPesos, 2)}, Q=${br(qLs, 2)} L/s, V=${br(velocidade, 2)} m/s.`,
        },
        aviso:
          (pressaoAlta ? `ATENÇÃO: pressão estática de ${br(pressaoKPa)} kPa acima do limite da NBR 5626 (400 kPa) — preveja válvula redutora de pressão. ` : '') +
          'Pesos relativos e diâmetros internos são valores de referência (tabela usual NBR 5626 / tubo soldável PVC NBR 5648) — confira peças especiais e o catálogo do fabricante. Bacia sanitária com VÁLVULA de descarga (não caixa) não entra neste método: exige ramal e vazão dedicados por projeto.',
      };
    },
  },
  {
    id: 'perda_carga',
    verticais: ['hidraulica'],
    nome: 'Perda de carga (Hazen-Williams)',
    icon: 'gauge',
    descricao: 'Quanta pressão o trecho perde do reservatório até o ponto de utilização.',
    base: 'Fórmula de Hazen-Williams (Azevedo Netto): J = 10,643 × (Q/C)^1,85 × D^-4,87 (Q em m³/s, D em m). C: PVC/CPVC ≈150, cobre ≈140, ferro galvanizado ≈100–130 (ajustável).',
    campos: [
      { key: 'vazao', label: 'Vazão do trecho', tipo: 'numero', sufixo: 'L/s', placeholder: 'Ex.: 0.5' },
      { key: 'diametro', label: 'Diâmetro interno do tubo', tipo: 'numero', sufixo: 'mm', placeholder: 'Ex.: 25' },
      { key: 'comprimento', label: 'Comprimento real do trecho', tipo: 'numero', sufixo: 'm', placeholder: 'Ex.: 15' },
      { key: 'acrescimo', label: 'Acréscimo p/ conexões (perda localizada)', tipo: 'numero', sufixo: '%', default: '20' },
      { key: 'c', label: 'Coeficiente de rugosidade (C)', tipo: 'numero', default: '150', placeholder: 'PVC/CPVC 150 · cobre 140 · galv. 100–130' },
      { key: 'pressaoDisponivel', label: 'Pressão disponível na entrada do trecho', tipo: 'numero', sufixo: 'mca', placeholder: 'Ex.: 10' },
      { key: 'pressaoMinima', label: 'Pressão mínima exigida no ponto/aparelho', tipo: 'numero', sufixo: 'mca', default: '0.5' },
    ],
    calcular: (v) => {
      const qLs = Math.max(0, num(v.vazao));
      const dMm = Math.max(1, num(v.diametro));
      const comprimento = Math.max(0, num(v.comprimento));
      const acrescimo = Math.max(0, num(v.acrescimo)) / 100;
      const c = Math.max(1, num(v.c) || 150);
      const qM3s = qLs / 1000;
      const dM = dMm / 1000;
      const j = qLs > 0 ? 10.643 * Math.pow(qM3s / c, 1.85) * Math.pow(dM, -4.87) : 0; // mca/m
      const comprimentoEquiv = comprimento * (1 + acrescimo);
      const perdaTotal = j * comprimentoEquiv;
      const pDisponivel = Math.max(0, num(v.pressaoDisponivel));
      const pMinima = Math.max(0, num(v.pressaoMinima));
      const pResidual = pDisponivel - perdaTotal;
      const abaixoDoMinimo = pDisponivel > 0 && pResidual < pMinima;
      return {
        linhas: [
          { label: 'Perda de carga unitária (J)', valor: `${br(j, 4)} mca/m` },
          { label: 'Comprimento equivalente', valor: `${br(comprimentoEquiv, 1)} m` },
          { label: 'Perda de carga total', valor: `${br(perdaTotal, 2)} mca`, destaque: true },
          ...(pDisponivel > 0 ? [{ label: 'Pressão residual no ponto', valor: `${br(pResidual, 2)} mca`, destaque: true }] : []),
        ],
        resumo: `Trecho de ${br(comprimento, 1)} m (Ø${br(dMm)} mm, C=${br(c)}) → perda de ${br(perdaTotal, 2)} mca.`,
        aviso:
          (abaixoDoMinimo
            ? `ATENÇÃO: pressão residual (${br(pResidual, 2)} mca) abaixo da mínima exigida (${br(pMinima, 2)} mca) — reveja diâmetro ou pressão de entrada. `
            : '') +
          'C de Hazen-Williams e o acréscimo por conexões são aproximados — ajuste conforme o material real e o nº de conexões/registros do trecho.',
      };
    },
  },
  {
    id: 'fossa_septica',
    verticais: ['hidraulica'],
    nome: 'Fossa séptica (volume)',
    icon: 'water-well',
    descricao: 'O volume útil do tanque séptico pelo número de contribuintes.',
    base: 'NBR 7229: V = 1000 + N×(C×T + K×Lf). C/Lf (Tabela 1) por tipo de ocupação, T (Tabela 2) pela contribuição diária, K (Tabela 3) pelo intervalo de limpeza e clima.',
    campos: [
      { key: 'pessoas', label: 'Nº de pessoas / contribuintes', tipo: 'numero', placeholder: 'Ex.: 5' },
      {
        key: 'tipo', label: 'Tipo de ocupação', tipo: 'opcao', default: 'residencia_medio',
        opcoes: [
          { v: 'residencia_alto', label: 'Residência — padrão alto' },
          { v: 'residencia_medio', label: 'Residência — padrão médio' },
          { v: 'residencia_baixo', label: 'Residência — padrão baixo' },
          { v: 'hotel', label: 'Hotel / alojamento' },
          { v: 'escritorio', label: 'Escritório / edifício comercial' },
          { v: 'fabrica', label: 'Fábrica em geral' },
        ],
      },
      {
        key: 'intervalo', label: 'Intervalo entre limpezas', tipo: 'opcao', default: '3',
        opcoes: [
          { v: '1', label: '1 ano' }, { v: '2', label: '2 anos' }, { v: '3', label: '3 anos' },
          { v: '4', label: '4 anos' }, { v: '5', label: '5 anos' },
        ],
      },
      {
        key: 'clima', label: 'Temperatura média do mês mais frio', tipo: 'opcao', default: 'medio',
        opcoes: [
          { v: 'frio', label: 'Abaixo de 10°C' },
          { v: 'medio', label: 'Entre 10°C e 20°C' },
          { v: 'quente', label: 'Acima de 20°C' },
        ],
      },
    ],
    calcular: (v) => {
      const TABELA_C_LF: Record<string, { c: number; lf: number; label: string }> = {
        residencia_alto: { c: 160, lf: 1, label: 'Residência padrão alto' },
        residencia_medio: { c: 130, lf: 1, label: 'Residência padrão médio' },
        residencia_baixo: { c: 100, lf: 1, label: 'Residência padrão baixo' },
        hotel: { c: 100, lf: 1, label: 'Hotel/alojamento' },
        escritorio: { c: 50, lf: 0.2, label: 'Escritório/edifício comercial' },
        fabrica: { c: 70, lf: 0.3, label: 'Fábrica em geral' },
      };
      const TABELA_K: Record<string, Record<string, number>> = {
        '1': { frio: 94, medio: 65, quente: 57 },
        '2': { frio: 134, medio: 105, quente: 97 },
        '3': { frio: 174, medio: 145, quente: 137 },
        '4': { frio: 214, medio: 185, quente: 177 },
        '5': { frio: 254, medio: 225, quente: 217 },
      };
      const periodoDetencao = (contribDiaria: number) => {
        if (contribDiaria <= 1500) return 1.0;
        if (contribDiaria <= 3000) return 0.92;
        if (contribDiaria <= 4500) return 0.83;
        if (contribDiaria <= 6000) return 0.75;
        if (contribDiaria <= 7500) return 0.67;
        if (contribDiaria <= 9000) return 0.58;
        return 0.5;
      };
      const n = Math.max(0, num(v.pessoas));
      const tipo = TABELA_C_LF[v.tipo] ?? TABELA_C_LF.residencia_medio;
      const contribDiaria = n * tipo.c;
      const t = periodoDetencao(contribDiaria);
      const k = (TABELA_K[v.intervalo] ?? TABELA_K['3'])[v.clima] ?? TABELA_K['3'].medio;
      const volumeL = 1000 + n * (tipo.c * t + k * tipo.lf);
      const volumeM3 = volumeL / 1000;
      return {
        linhas: [
          { label: 'Contribuição diária de esgoto', valor: `${br(contribDiaria)} L/dia` },
          { label: 'Período de detenção (T)', valor: `${br(t, 2)} dia(s)` },
          { label: 'Taxa de acumulação de lodo (K)', valor: `${k} dias` },
          { label: 'Volume útil do tanque séptico', valor: `${br(volumeL)} L (${br(volumeM3, 2)} m³)`, destaque: true },
        ],
        resumo: `${br(n)} pessoas (${tipo.label}) → tanque séptico de ${br(volumeL)} L (${br(volumeM3, 2)} m³).`,
        itemOrcamento: {
          nome: 'Tanque séptico',
          descricao: `Volume útil de ${br(volumeL)} L (${br(volumeM3, 2)} m³) para ${br(n)} pessoas (NBR 7229).`,
        },
        aviso:
          'Volume calculado pela NBR 7229 (tabelas 1–3, valores de referência). Dimensões finais (profundidade, L×B) e o sumidouro/vala de infiltração (NBR 13969) dependem do solo e devem ser confirmados com o órgão ambiental local.',
      };
    },
  },

// ─────────── Pintura (extra: diluição, secagem, selador) ───────────
{
  id: 'diluicao_tinta',
  verticais: ['pintura'],
  nome: 'Diluição por tipo de tinta',
  icon: 'water-percent',
  descricao: 'O diluente certo e o quanto usar, por tipo de tinta.',
  base: 'NBR 13245: diluição conforme fabricante/substrato. Base água (acrílica/textura): só água, até ~5%. Base solvente (esmalte/verniz): aguarrás/thinner, tipicamente 5–15% — nunca diluir com água.',
  campos: [
    { key: 'tipo', label: 'Tipo de tinta', tipo: 'opcao', default: 'acrilica', opcoes: [
      { v: 'acrilica', label: 'Acrílica / látex (base água)' },
      { v: 'textura', label: 'Textura acrílica (base água)' },
      { v: 'esmalte', label: 'Esmalte sintético (base solvente)' },
      { v: 'verniz', label: 'Verniz (base solvente)' },
    ] },
    { key: 'quantidade', label: 'Quantidade de tinta', tipo: 'numero', sufixo: 'L', placeholder: 'Ex.: 18' },
    { key: 'percentual', label: 'Diluição desejada', tipo: 'numero', sufixo: '%', default: '5' },
  ],
  calcular: (v) => {
    const TIPOS: Record<string, { label: string; diluente: string; min: number; max: number }> = {
      acrilica: { label: 'Acrílica/látex', diluente: 'água', min: 0, max: 5 },
      textura: { label: 'Textura acrílica', diluente: 'água', min: 0, max: 5 },
      esmalte: { label: 'Esmalte sintético', diluente: 'aguarrás/thinner', min: 5, max: 15 },
      verniz: { label: 'Verniz', diluente: 'aguarrás/thinner', min: 5, max: 15 },
    };
    const tipo = TIPOS[v.tipo] ?? TIPOS.acrilica;
    const qtd = Math.max(0, num(v.quantidade));
    const pct = Math.max(0, num(v.percentual));
    const diluenteLitros = qtd * (pct / 100);
    const diluenteTxt = diluenteLitros < 1 ? `${br(diluenteLitros * 1000)} ml` : `${br(diluenteLitros, 2)} L`;
    const foraDaFaixa = pct > tipo.max || pct < tipo.min;
    return {
      linhas: [
        { label: 'Diluente indicado', valor: tipo.diluente },
        { label: 'Faixa usual', valor: `${br(tipo.min)}–${br(tipo.max)}%` },
        { label: `Diluente (${br(pct, 1)}%)`, valor: diluenteTxt, destaque: true },
        { label: 'Volume final da mistura', valor: `${br(qtd + diluenteLitros, 2)} L` },
      ],
      resumo: `${br(qtd, 1)} L de ${tipo.label} + ${diluenteTxt} de ${tipo.diluente} (${br(pct, 1)}% de diluição).`,
      itemOrcamento: {
        nome: `Diluente (${tipo.diluente})`,
        descricao: `${diluenteTxt} para ${br(qtd, 1)} L de ${tipo.label} a ${br(pct, 1)}%`,
      },
      aviso: foraDaFaixa
        ? `Fora da faixa usual (${br(tipo.min)}–${br(tipo.max)}%) para ${tipo.label} — confira a ficha técnica do fabricante antes de aplicar. Nunca troque o diluente (água ↔ aguarrás/thinner) entre tipos.`
        : 'Diluição sempre conforme a ficha técnica do fabricante e o substrato (NBR 13245); nunca troque o diluente (água ↔ aguarrás/thinner) entre tipos.',
    };
  },
},
{
  id: 'secagem_demaos',
  verticais: ['pintura'],
  nome: 'Tempo de secagem entre demãos',
  icon: 'timer-sand',
  descricao: 'Quanto esperar até a próxima demão (ou liberar o ambiente), por tipo de tinta e temperatura.',
  base: 'Fichas técnicas de fabricante: acrílica ~4h para repintura; esmalte sintético ~16h; verniz 12–24h (varia bastante por marca). Faixa de aplicação 10–40°C (NBR 13245); abaixo de 10°C, dobre o intervalo.',
  campos: [
    { key: 'tipo', label: 'Tipo de tinta', tipo: 'opcao', default: 'acrilica', opcoes: [
      { v: 'acrilica', label: 'Acrílica / látex' },
      { v: 'esmalte', label: 'Esmalte sintético' },
      { v: 'verniz', label: 'Verniz' },
    ] },
    { key: 'temperatura', label: 'Temperatura ambiente', tipo: 'numero', sufixo: '°C', default: '25' },
    { key: 'ultimaDemao', label: 'É a última demão?', tipo: 'opcao', default: 'nao', opcoes: [
      { v: 'nao', label: 'Não — vem mais demão' },
      { v: 'sim', label: 'Sim — liberar o ambiente' },
    ] },
  ],
  calcular: (v) => {
    const temp = num(v.temperatura);
    const frio = temp < 10;
    const quente = temp > 40;
    const fator = frio ? 2 : 1;
    let minH = 4, maxH = 4; // acrílica (default)
    if (v.tipo === 'esmalte') { minH = 16; maxH = 16; }
    if (v.tipo === 'verniz') { minH = 12; maxH = 24; }
    minH *= fator; maxH *= fator;
    const faixaTxt = minH === maxH ? `${br(minH)} h` : `${br(minH)}–${br(maxH)} h`;
    const ultima = v.ultimaDemao === 'sim';
    const nomeTinta = v.tipo === 'esmalte' ? 'Esmalte sintético' : v.tipo === 'verniz' ? 'Verniz' : 'Acrílica/látex';
    return {
      linhas: [
        { label: ultima ? 'Liberação do ambiente' : 'Tempo até a próxima demão', valor: faixaTxt, destaque: true },
        ...(frio ? [{ label: 'Ajuste por frio (<10°C)', valor: 'Intervalo dobrado' }] : []),
      ],
      resumo: `${nomeTinta} a ${br(temp, 1)}°C → ${faixaTxt}${ultima ? ' até liberar o ambiente' : ' até a próxima demão'}.`,
      aviso: (frio || quente
        ? 'Temperatura fora da faixa recomendada de aplicação (10–40°C, NBR 13245) — o tempo real pode variar bastante. '
        : '') + 'Verniz varia muito por marca (12–24h é típico) — confira sempre a ficha técnica. Em ambiente externo, chuva, umidade alta e vento também atrasam a secagem.',
    };
  },
},
{
  id: 'rendimento_selador',
  verticais: ['pintura'],
  nome: 'Rendimento de selador/primer',
  icon: 'format-paint',
  descricao: 'Litros de selador/primer e nº de embalagens pela área e demãos.',
  base: 'Rendimento típico de selador/primer acrílico: ~40 m²/L por demão (ficha técnica de fabricante — varia por marca e por substrato, por isso é editável aqui). Mesmo motor do Tier 0: qtd = área × consumo × demãos × (1+perda), arredondado para embalagem comercial.',
  campos: [
    { key: 'area', label: 'Área a selar', tipo: 'numero', sufixo: 'm²', placeholder: 'Ex.: 80' },
    { key: 'rendimento', label: 'Rendimento do produto', tipo: 'numero', sufixo: 'm²/L por demão', default: '40' },
    { key: 'demaos', label: 'Demãos', tipo: 'numero', default: '1' },
    { key: 'perda', label: 'Perda (respingo/porosidade)', tipo: 'numero', sufixo: '%', default: '10' },
    { key: 'embalagem', label: 'Embalagem comercial', tipo: 'opcao', default: '18', opcoes: [
      { v: '3.6', label: 'Galão 3,6 L' },
      { v: '18', label: 'Lata 18 L' },
    ] },
  ],
  calcular: (v) => {
    const area = Math.max(0, num(v.area));
    const rend = Math.max(0.1, num(v.rendimento) || 40);
    const demaos = Math.max(1, Math.round(num(v.demaos) || 1));
    const perda = 1 + Math.max(0, num(v.perda)) / 100;
    const litros = (area / rend) * demaos * perda;
    const embalagem = num(v.embalagem) || 18;
    const latas = Math.ceil(litros / embalagem);
    return {
      linhas: [
        { label: 'Selador/primer necessário', valor: `${br(litros, 2)} L`, destaque: true },
        { label: `Embalagens de ${br(embalagem, 1)} L`, valor: `${br(latas)} un.` },
      ],
      resumo: `${br(area, 1)} m² · ${demaos} demão${demaos > 1 ? 's' : ''} → ${br(litros, 2)} L (${br(latas)} un. de ${br(embalagem, 1)} L).`,
      itemOrcamento: {
        nome: 'Selador/primer',
        descricao: `${br(area, 1)} m² · ${demaos} demão${demaos > 1 ? 's' : ''} → ${br(litros, 2)} L (${br(latas)} un. de ${br(embalagem, 1)} L)`,
      },
      aviso: 'Rendimento varia por porosidade do substrato e marca — confira a ficha técnica do produto; reboco novo/gesso pode reduzir o rendimento em até 30%.',
    };
  },
},

{
    id: 'adubacao_npk',
    verticais: ['jardinagem'],
    nome: 'Adubação NPK (dose por m²)',
    icon: 'sprout',
    descricao: 'Quantidade de adubo NPK por aplicação e por ano, pela área e pela cultura.',
    base: 'Gramado: NPK 10-10-10, 30–50 g/m², mín. 3 aplicações/ano, sempre seguidas de irrigação (prática consolidada do setor, ver docs/FERRAMENTAS_POR_NICHO.md). Outras culturas: faixas usuais de adubação de cobertura — sempre confirmar com análise de solo (referência geral: SBCS/CQFS, Manual de Adubação e Calagem).',
    campos: [
      { key: 'area', label: 'Área a adubar', tipo: 'numero', sufixo: 'm²', placeholder: 'Ex.: 50' },
      { key: 'cultura', label: 'Cultura', tipo: 'opcao', default: 'gramado', opcoes: [
        { v: 'gramado', label: 'Gramado' },
        { v: 'canteiro', label: 'Canteiro / ornamentais' },
        { v: 'horta', label: 'Horta / hortaliças' },
      ] },
      { key: 'dose', label: 'Dose por aplicação', tipo: 'numero', sufixo: 'g/m²', default: '40', placeholder: 'Ex.: 40' },
      { key: 'frequencia', label: 'Aplicações por ano', tipo: 'numero', default: '3' },
    ],
    calcular: (v) => {
      const area = Math.max(0, num(v.area));
      const dose = Math.max(0, num(v.dose) || 40);
      const freq = Math.max(1, Math.round(num(v.frequencia)) || 3);
      const porAplicacaoKg = (area * dose) / 1000;
      const anualKg = porAplicacaoKg * freq;

      const FAIXAS: Record<string, { min: number; max: number; formula: string; obs: string; label: string }> = {
        gramado: { min: 30, max: 50, formula: 'NPK 10-10-10', obs: 'mín. 3 aplicações/ano, sempre seguidas de irrigação', label: 'gramado' },
        canteiro: { min: 40, max: 60, formula: 'NPK 04-14-08 ou 10-10-10', obs: 'a cada 30–45 dias, na fase de crescimento/floração', label: 'canteiro/ornamentais' },
        horta: { min: 20, max: 30, formula: 'NPK 04-14-08 (cobertura)', obs: 'a cada 15–20 dias, dose leve e frequente', label: 'horta/hortaliças' },
      };
      const faixa = FAIXAS[v.cultura] ?? FAIXAS.gramado;

      return {
        linhas: [
          { label: 'Adubo por aplicação', valor: `${br(porAplicacaoKg, 2)} kg`, destaque: true },
          { label: 'Total no ano', valor: `${br(anualKg, 2)} kg (${freq}× ao ano)` },
          { label: 'Faixa usual p/ esta cultura', valor: `${faixa.min}–${faixa.max} g/m² · ${faixa.formula}` },
        ],
        resumo: `${br(area)} m² de ${faixa.label} → ${br(porAplicacaoKg, 2)} kg por aplicação (${freq}×/ano = ${br(anualKg, 2)} kg).`,
        itemOrcamento: {
          nome: 'Adubação NPK',
          descricao: `${br(area)} m² de ${faixa.label} — ${br(porAplicacaoKg, 2)} kg/aplicação × ${freq}×/ano (${faixa.formula})`,
        },
        aviso: `Faixa usual para ${faixa.label}: ${faixa.min}–${faixa.max} g/m² (${faixa.obs}). A dose ideal depende da análise de solo — ajuste o campo "Dose" conforme o produto e o resultado da análise.`,
      };
    },
  },
  {
    id: 'mudas_cerca_viva',
    verticais: ['jardinagem'],
    nome: 'Mudas para cerca viva',
    icon: 'fence',
    descricao: 'Número de mudas pelo comprimento da cerca e o espaçamento entre plantas.',
    base: 'mudas = (comprimento ÷ espaçamento) + 1 por fileira (CPT/Árvores do Brasil, ver docs/FERRAMENTAS_POR_NICHO.md). O espaçamento entre mudas varia por espécie — confirme na ficha da planta escolhida.',
    campos: [
      { key: 'comprimento', label: 'Comprimento da cerca', tipo: 'numero', sufixo: 'm', placeholder: 'Ex.: 20' },
      { key: 'espacamento', label: 'Espaçamento entre mudas', tipo: 'numero', sufixo: 'm', default: '0.4' },
      { key: 'fileiras', label: 'Disposição', tipo: 'opcao', default: '1', opcoes: [
        { v: '1', label: 'Fileira única' },
        { v: '2', label: 'Fileira dupla (zig-zag)' },
      ] },
      { key: 'perda', label: 'Margem p/ falhas e replantio', tipo: 'numero', sufixo: '%', default: '5' },
    ],
    calcular: (v) => {
      const comprimento = Math.max(0, num(v.comprimento));
      const espacamento = Math.max(0.05, num(v.espacamento) || 0.4);
      const fileiras = num(v.fileiras) === 2 ? 2 : 1;
      const perda = Math.max(0, num(v.perda)) / 100;
      const porFileira = comprimento / espacamento + 1;
      const baseTotal = porFileira * fileiras;
      const comMargem = Math.ceil(baseTotal * (1 + perda) - 1e-9);
      return {
        linhas: [
          { label: 'Mudas por fileira', valor: `${br(porFileira, 1)}` },
          ...(fileiras === 2 ? [{ label: 'Fileiras', valor: '2 (zig-zag)' }] : []),
          { label: 'Mudas a comprar', valor: `${br(comMargem)} mudas`, destaque: true },
        ],
        resumo: `${br(comprimento, 1)} m de cerca, espaçamento ${br(espacamento, 2)} m${fileiras === 2 ? ', fileira dupla' : ''} → ${br(comMargem)} mudas.`,
        itemOrcamento: {
          nome: 'Mudas para cerca viva',
          descricao: `${br(comprimento, 1)} m · espaçamento ${br(espacamento, 2)} m${fileiras === 2 ? ' · fileira dupla' : ''} → ${br(comMargem)} mudas`,
        },
        aviso: 'Espaçamento entre mudas varia por espécie (ex.: arbustos densos ~0,3–0,4 m; espécies de maior porte ~0,5–0,8 m) — confirme na ficha da planta escolhida.',
      };
    },
  },
  {
    id: 'cova_substrato',
    verticais: ['jardinagem'],
    nome: 'Cova + substrato por muda',
    icon: 'shovel',
    descricao: 'Dimensão da cova, volume e sacos de substrato pelo porte da planta.',
    base: 'Covas por porte: 20×20×20 cm (pequeno/forração), 40×40×40 cm (médio/arbustos e cerca viva), 60×60×60 cm (grande/árvores) — prática de plantio (CPT/Árvores do Brasil, ver docs/FERRAMENTAS_POR_NICHO.md). Proporção de composto/adubo orgânico misturado à terra é regra prática (~20–30%); solo pobre pede análise antes do plantio.',
    campos: [
      { key: 'porte', label: 'Porte da planta', tipo: 'opcao', default: 'medio', opcoes: [
        { v: 'pequeno', label: 'Pequeno (forração/muda baixa)' },
        { v: 'medio', label: 'Médio (arbusto/cerca viva)' },
        { v: 'grande', label: 'Grande (árvore)' },
      ] },
      { key: 'numPlantas', label: 'Número de covas/mudas', tipo: 'numero', default: '1', placeholder: 'Ex.: 10' },
      { key: 'percentualComposto', label: 'Composto/adubo orgânico na mistura', tipo: 'numero', sufixo: '%', default: '30' },
      { key: 'tamanhoSaco', label: 'Tamanho do saco de substrato', tipo: 'numero', sufixo: 'L', default: '20' },
    ],
    calcular: (v) => {
      const LADOS: Record<string, number> = { pequeno: 20, medio: 40, grande: 60 };
      const lado = LADOS[v.porte] ?? 40;
      const ladoM = lado / 100;
      const volCovaL = Math.pow(ladoM, 3) * 1000;
      const n = Math.max(1, Math.round(num(v.numPlantas)) || 1);
      const perc = Math.min(100, Math.max(0, num(v.percentualComposto))) / 100;
      const compostoPorCovaL = volCovaL * perc;
      const compostoTotalL = compostoPorCovaL * n;
      const saco = Math.max(1, num(v.tamanhoSaco) || 20);
      const sacos = Math.ceil(compostoTotalL / saco - 1e-9);
      return {
        linhas: [
          { label: 'Dimensão da cova', valor: `${lado}×${lado}×${lado} cm` },
          { label: 'Volume por cova', valor: `${br(volCovaL, 1)} L` },
          { label: 'Composto por cova', valor: `${br(compostoPorCovaL, 1)} L` },
          { label: 'Total de covas', valor: `${br(n)}` },
          { label: 'Substrato total', valor: `${br(compostoTotalL, 1)} L (${sacos} saco${sacos > 1 ? 's' : ''} de ${br(saco)} L)`, destaque: true },
        ],
        resumo: `${br(n)} covas de ${lado}×${lado}×${lado} cm → ${br(compostoTotalL, 1)} L de substrato (${sacos} sacos de ${br(saco)} L).`,
        itemOrcamento: {
          nome: 'Abertura de cova + substrato',
          descricao: `${br(n)} covas ${lado}×${lado}×${lado} cm — ${sacos} sacos de substrato de ${br(saco)} L`,
        },
        aviso: 'Proporção de composto é regra prática (~20–30% do volume da cova); solo de baixa fertilidade pede análise e correção (calagem) antes do plantio.',
      };
    },
  }
];

/**
 * As calculadoras que um ofício vê (gate por vertical). Aceita a LISTA de verticais
 * da empresa (multi-ofício) — mostra as calculadoras de QUALQUER uma. Sem vertical,
 * lista vazia, ou 'geral' = todas.
 */
export function calculosDoOficio(verticais: VerticalId | VerticalId[] | undefined): CalculoOficio[] {
  const arr = verticais == null ? [] : Array.isArray(verticais) ? verticais : [verticais];
  // Sem ofício = todas (backward-compat). 'geral' NÃO é coringa: cai no filtro (nenhuma
  // calculadora é 'geral') → o hub some p/ quem escolheu "Serviços em Geral".
  if (arr.length === 0) return CALCULOS;
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
