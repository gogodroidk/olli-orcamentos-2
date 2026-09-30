/**
 * verticais.ts — o modelo de domínio MULTI-VERTICAL do OLLI (F1 da estratégia,
 * ver docs/ESTRATEGIA_SUPERIOR.md).
 *
 * A tese: cada segmento de serviço de campo tem UMA ferramenta-assinatura que
 * nenhum app genérico entrega. O cadastro por CNPJ lê o CNAE e DEDUZ a vertical;
 * a partir dela o app sugere as ferramentas certas — mas o usuário AJUSTA livre
 * (a dedução é só o default inteligente, nada é imposto).
 *
 * A dedução mora AQUI (TS puro, testável), não no worker: o worker é um proxy
 * fino da BrasilAPI e devolve o CNAE cru; quem traduz CNAE→vertical é o cliente,
 * em um lugar só. Ver `src/services/cnpj.ts` (busca) e o Onboarding (uso).
 *
 * Formato do CNAE (confirmado ao vivo na BrasilAPI): subclasse de 7 dígitos sem
 * máscara — ex.: "4321-5/00" chega como "4321500", "4322-3/02" como "4322302".
 * O mapa casa por PREFIXO, e o prefixo MAIS LONGO vence (uma subclasse específica
 * ganha da classe genérica) — necessário porque a classe 4322-3 é ambígua
 * (hidráulica em /01, refrigeração/climatização em /02, incêndio em /03).
 *
 * Um mesmo CNAE pode servir a MAIS DE UM ofício: 8129-0/00 cobre limpeza de caixa
 * d'água E tratamento de piscina (IBGE, notas explicativas da subclasse). Nesse caso
 * as verticais empatadas entram todas, na ordem do catálogo — o dono ajusta depois.
 */

export type VerticalId =
  | 'refrigeracao'
  | 'eletrica'
  | 'hidraulica'
  | 'pintura'
  | 'dedetizacao'
  | 'caixa_dagua'
  | 'piscina'
  | 'extintores'
  | 'jardinagem'
  | 'geral';

export type FerramentaId =
  | 'pmoc'
  | 'qr_equipamento'
  | 'checklist_nr10'
  | 'laudo_eletrico'
  | 'laudo_estanqueidade'
  | 'certificado_anvisa'
  | 'certificado_caixa_dagua'
  | 'contrato_recorrente'
  | 'calculadora_tinta';

export interface Ferramenta {
  id: FerramentaId;
  label: string;
  /** O documento/cálculo que vale dinheiro e hoje vive no Word/planilha. */
  descricao: string;
  /** Já existe no app hoje? (as demais são a fila de construção da Fase 4.) */
  disponivel: boolean;
}

export interface Vertical {
  id: VerticalId;
  label: string;
  emoji: string;
  /** Prefixos de CNAE (5 ou 7 dígitos) que deduzem esta vertical. */
  cnaes: readonly string[];
  /** Ferramentas-assinatura sugeridas (o usuário liga/desliga). */
  ferramentas: readonly FerramentaId[];
  /**
   * PÓS-VENDA ("Clientes para lembrar", `utils/posVenda.ts`): de quantos em quantos
   * meses o serviço típico deste ofício se repete, e como a mensagem chama esse
   * serviço ("está chegando a hora de <servico>"). É um default de mercado, não uma
   * regra: serve para o prestador lembrar o cliente no momento certo, nunca é
   * enviado sozinho.
   */
  retorno: { meses: number; servico: string };
}

/** Catálogo de ferramentas por vertical (o "documento que vale dinheiro"). */
export const FERRAMENTAS: Record<FerramentaId, Ferramenta> = {
  pmoc: { id: 'pmoc', label: 'PMOC', descricao: 'Plano de manutenção com QR por equipamento e periodicidade.', disponivel: true },
  qr_equipamento: { id: 'qr_equipamento', label: 'Etiqueta QR', descricao: 'QR opaco por equipamento, rastreável e revogável.', disponivel: true },
  checklist_nr10: { id: 'checklist_nr10', label: 'Checklist NR-10', descricao: 'Inspeção elétrica no padrão da norma, pronta pro laudo.', disponivel: false },
  laudo_eletrico: { id: 'laudo_eletrico', label: 'Laudo elétrico + ART', descricao: 'Laudo estruturado com campo de ART para o engenheiro assinar.', disponivel: false },
  laudo_estanqueidade: { id: 'laudo_estanqueidade', label: 'Laudo de estanqueidade', descricao: 'Teste de pressão (inicial/final, tempo, foto) — laudo avulso custa R$3-7 mil.', disponivel: false },
  // O id fica `certificado_anvisa` (já gravado em `ferramentasAtivas` de contas reais);
  // o documento é o "comprovante de execução de serviço" do art. 19 da RDC 622/2022,
  // que revogou a RDC 52/2009.
  certificado_anvisa: { id: 'certificado_anvisa', label: 'Comprovante de controle de pragas', descricao: 'Comprovante de execução de serviço com os campos do art. 19 da RDC ANVISA 622/2022 e o responsável técnico.', disponivel: true },
  certificado_caixa_dagua: { id: 'certificado_caixa_dagua', label: "Certificado de limpeza de caixa d'água", descricao: 'Certificado de limpeza e desinfecção do reservatório, com lacre e data da próxima limpeza.', disponivel: true },
  // Ligado com o motor de contrato por ativo (migration 20260930130500). A landing
  // lista esta ferramenta como pronta: publique a landing DEPOIS da migration e do app.
  contrato_recorrente: { id: 'contrato_recorrente', label: 'Contrato recorrente', descricao: 'Contrato por cliente e ativo: cada visita entra sozinha na agenda com o técnico, e a cobrança do mês sai com o seu Pix.', disponivel: true },
  calculadora_tinta: { id: 'calculadora_tinta', label: 'Calculadora de tinta', descricao: 'm² → litros e demãos, dentro do item do orçamento.', disponivel: false },
};

/**
 * Catálogo de verticais. Os CNAEs vêm da tabela CNAE 2.3/IBGE, conferidos subclasse
 * por subclasse em 30/09/2026 na API oficial do IBGE
 * (https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/<código>); o caso
 * ambíguo 4322-3 é resolvido por subclasse de 7 dígitos.
 * A ORDEM importa: é a ordem dos chips de ofício e o desempate de CNAE compartilhado.
 */
export const VERTICAIS: readonly Vertical[] = [
  {
    id: 'refrigeracao',
    label: 'Refrigeração e Climatização',
    emoji: '❄️',
    // 4322-3/02 (instalação e manutenção de ar-condicionado central, ventilação e
    // refrigeração) + 3314-7/07 (manutenção de refrigeração e ventilação de uso
    // industrial e comercial: câmaras frias, balcões, exaustores). O 3314-7/10 NÃO
    // é refrigeração: é "uso geral não especificado" e inclui extintores (ver abaixo).
    cnaes: ['4322302', '3314707'],
    ferramentas: ['pmoc', 'qr_equipamento', 'contrato_recorrente'],
    // Higienização de split residencial: semestral é a recomendação usual dos
    // fabricantes (o PMOC comercial tem periodicidade própria, por equipamento).
    retorno: { meses: 6, servico: 'a limpeza do ar-condicionado' },
  },
  {
    id: 'eletrica',
    label: 'Elétrica',
    emoji: '⚡',
    cnaes: ['43215'], // 4321-5 Instalação elétrica (todas as subclasses).
    ferramentas: ['checklist_nr10', 'laudo_eletrico'],
    retorno: { meses: 12, servico: 'uma revisão da parte elétrica' },
  },
  {
    id: 'hidraulica',
    label: 'Hidráulica',
    emoji: '🚰',
    cnaes: ['4322301'], // 4322-3/01 instalações hidráulicas/sanitárias/gás.
    ferramentas: ['laudo_estanqueidade'],
    // Limpeza de caixa d'água a cada 6 meses é a orientação das companhias de saneamento.
    retorno: { meses: 6, servico: "a limpeza da caixa d'água e uma revisão hidráulica" },
  },
  {
    id: 'pintura',
    label: 'Pintura e Acabamento',
    emoji: '🎨',
    cnaes: ['43304'], // 4330-4 Obras de acabamento (inclui pintura de edifícios).
    ferramentas: ['calculadora_tinta'],
    retorno: { meses: 24, servico: 'um retoque na pintura' },
  },
  {
    id: 'dedetizacao',
    label: 'Dedetização e Controle de Pragas',
    emoji: '🐜',
    // 8122-2/00 Imunização e controle de pragas urbanas (dedetização, desratização,
    // descupinização). A classe 8122-2 só tem essa subclasse.
    cnaes: ['81222'],
    ferramentas: ['certificado_anvisa', 'contrato_recorrente'],
    // Reaplicação preventiva semestral é o ciclo mais comum em residência. A RDC
    // 622/2022 não fixa periodicidade; restaurante e condomínio costumam contratar menor.
    retorno: { meses: 6, servico: 'a reaplicação da dedetização' },
  },
  {
    id: 'caixa_dagua',
    label: "Limpeza de Caixa d'Água",
    emoji: '💧',
    // 8129-0/00 inclui "limpeza de caixas de água e caixas de gordura" (IBGE). A mesma
    // subclasse cobre piscina: o empate deduz os dois ofícios (ver `deduzirVerticais`).
    cnaes: ['8129000'],
    ferramentas: ['certificado_caixa_dagua', 'contrato_recorrente'],
    // Em SP a lei exige a limpeza a cada 360 dias em comércio, condomínio e escola
    // (Lei municipal 10.770/1989); as companhias de saneamento orientam a cada 6 meses.
    // O lembrete usa o prazo menor: avisar cedo nunca faz o cliente perder o prazo legal.
    retorno: { meses: 6, servico: "a limpeza da caixa d'água" },
  },
  {
    id: 'piscina',
    label: 'Piscinas',
    emoji: '🏊',
    // 8129-0/00 inclui "limpeza e tratamento de piscinas" (IBGE).
    cnaes: ['8129000'],
    ferramentas: ['contrato_recorrente'],
    // Piscina é visita semanal ou quinzenal: cliente sem serviço há 1 mês já saiu da rotina.
    retorno: { meses: 1, servico: 'a manutenção da piscina' },
  },
  {
    id: 'extintores',
    label: 'Extintores e Prevenção de Incêndio',
    emoji: '🧯',
    // 4322-3/03 Instalações de sistema de prevenção contra incêndio + 3314-7/10, que
    // inclui "manutenção e reparação de extintores de incêndio" (IBGE). O 3314-7/10 é
    // mais largo (máquinas de embalar, de venda automática…), mas no público do OLLI
    // é o recarregador de extintor; a dedução é só o default e o dono ajusta.
    cnaes: ['4322303', '3314710'],
    // Sem `qr_equipamento` por enquanto: as telas de equipamento/QR ainda são do gate
    // de climatização, e a landing anuncia toda ferramenta `disponivel` da vertical.
    ferramentas: ['contrato_recorrente'],
    // NBR 12962: inspeção anual; a recarga segue o nível de manutenção de cada extintor.
    retorno: { meses: 12, servico: 'a inspeção e a recarga dos extintores' },
  },
  {
    id: 'jardinagem',
    label: 'Jardinagem e Paisagismo',
    emoji: '🌿',
    cnaes: ['81303'], // 8130-3 Atividades paisagísticas.
    ferramentas: ['contrato_recorrente'],
    retorno: { meses: 3, servico: 'a manutenção do jardim (poda e adubação)' },
  },
];

/** A vertical genérica: quando o CNAE não casa com nenhuma especializada. */
export const VERTICAL_GERAL: Vertical = {
  id: 'geral',
  label: 'Serviços em Geral',
  emoji: '🛠️',
  cnaes: [],
  ferramentas: [],
  // 6 meses: o mesmo horizonte (~150 dias) que o antigo radar de clientes já usava
  // para todo mundo — quem não escolheu ofício não sente o radar mudar de ritmo.
  retorno: { meses: 6, servico: 'uma revisão do serviço' },
};

/** Só os dígitos de um CNAE (remove máscara "0000-0/00" se vier formatado). */
export function normalizarCnae(cnae: string | number | null | undefined): string {
  return String(cnae ?? '').replace(/\D/g, '');
}

/**
 * Deduz as verticais a partir do CNAE principal + secundários. Retorna a lista
 * ORDENADA por relevância (o principal primeiro), sem repetição, e cai em
 * ['geral'] quando nada casa. Casa por PREFIXO com o mais longo vencendo — assim
 * '4322302' (refrigeração) ganha de uma regra genérica '4322', e a classe '43215'
 * pega qualquer subclasse elétrica. Empate no mesmo prefixo (8129000 → caixa d'água
 * e piscina) devolve todas as empatadas, na ordem do catálogo. Nunca lança.
 */
export function deduzirVerticais(
  cnaePrincipal: string | number | null | undefined,
  secundarios: readonly (string | number)[] = [],
): VerticalId[] {
  const codigos = [cnaePrincipal, ...secundarios].map(normalizarCnae).filter((c) => c.length >= 4);
  const encontradas: VerticalId[] = [];
  for (const codigo of codigos) {
    for (const vertical of casarVerticais(codigo)) {
      if (!encontradas.includes(vertical)) encontradas.push(vertical);
    }
  }
  return encontradas.length ? encontradas : ['geral'];
}

/** As verticais cujo prefixo de CNAE mais longo casa com o código (vazio se nenhuma). */
function casarVerticais(codigo: string): VerticalId[] {
  let tamanho = 0;
  let ids: VerticalId[] = [];
  for (const v of VERTICAIS) {
    for (const prefixo of v.cnaes) {
      if (!codigo.startsWith(prefixo) || prefixo.length < tamanho) continue;
      if (prefixo.length > tamanho) {
        tamanho = prefixo.length;
        ids = [];
      }
      if (!ids.includes(v.id)) ids.push(v.id);
    }
  }
  return ids;
}

/** Busca uma vertical pelo id (cai na genérica). */
export function verticalPorId(id: VerticalId): Vertical {
  return VERTICAIS.find((v) => v.id === id) ?? VERTICAL_GERAL;
}

/** As ferramentas sugeridas (dedupe) para um conjunto de verticais. */
export function ferramentasSugeridas(verticais: readonly VerticalId[]): FerramentaId[] {
  const set = new Set<FerramentaId>();
  for (const id of verticais) {
    for (const f of verticalPorId(id).ferramentas) set.add(f);
  }
  return [...set];
}

/**
 * A empresa deve VER as ferramentas/telas da vertical `id`? É o GATE central da
 * personalização (docs/SISTEMA_SUPERIOR.md). BACKWARD-COMPAT deliberado: empresa SEM
 * verticais definidas (todo usuário existente) ou com `'geral'` vê TUDO — como hoje.
 * O gate só ESCONDE quando a empresa escolheu verticais específicas que não incluem `id`.
 * A dedução nunca tira nada de quem não escolheu.
 */
export function empresaMostraVertical(
  verticaisEmpresa: readonly VerticalId[] | undefined,
  id: VerticalId,
): boolean {
  // BACKWARD-COMPAT: SEM ofício (undefined/vazio) = mostra tudo (todo usuário antigo).
  if (!verticaisEmpresa || verticaisEmpresa.length === 0) return true;
  // 'geral' (Serviços em Geral) é ofício ESCOLHIDO, não "sem ofício": vê só o núcleo
  // genérico e ESCONDE ferramentas de nicho (nenhuma é 'geral'). NÃO é coringa — era o
  // que fazia HVAC/dedetização/etc. verem pintura.
  return verticaisEmpresa.includes(id);
}

/** Atalho: mostrar as ferramentas de HVAC (PMOC, equipamentos, códigos de erro, diagnóstico)? */
export function empresaMostraHvac(verticaisEmpresa: readonly VerticalId[] | undefined): boolean {
  return empresaMostraVertical(verticaisEmpresa, 'refrigeracao');
}
