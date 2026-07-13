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
 * (hidráulica em /01, refrigeração/climatização em /02).
 */

export type VerticalId =
  | 'refrigeracao'
  | 'eletrica'
  | 'hidraulica'
  | 'pintura'
  | 'dedetizacao'
  | 'jardinagem'
  | 'geral';

export type FerramentaId =
  | 'pmoc'
  | 'qr_equipamento'
  | 'checklist_nr10'
  | 'laudo_eletrico'
  | 'laudo_estanqueidade'
  | 'certificado_anvisa'
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
}

/** Catálogo de ferramentas por vertical (o "documento que vale dinheiro"). */
export const FERRAMENTAS: Record<FerramentaId, Ferramenta> = {
  pmoc: { id: 'pmoc', label: 'PMOC', descricao: 'Plano de manutenção com QR por equipamento e periodicidade.', disponivel: true },
  qr_equipamento: { id: 'qr_equipamento', label: 'Etiqueta QR', descricao: 'QR opaco por equipamento, rastreável e revogável.', disponivel: true },
  checklist_nr10: { id: 'checklist_nr10', label: 'Checklist NR-10', descricao: 'Inspeção elétrica no padrão da norma, pronta pro laudo.', disponivel: false },
  laudo_eletrico: { id: 'laudo_eletrico', label: 'Laudo elétrico + ART', descricao: 'Laudo estruturado com campo de ART para o engenheiro assinar.', disponivel: false },
  laudo_estanqueidade: { id: 'laudo_estanqueidade', label: 'Laudo de estanqueidade', descricao: 'Teste de pressão (inicial/final, tempo, foto) — laudo avulso custa R$3-7 mil.', disponivel: false },
  certificado_anvisa: { id: 'certificado_anvisa', label: 'Certificado ANVISA', descricao: 'Certificado de dedetização RDC 52/622 com validade e responsável técnico.', disponivel: true },
  contrato_recorrente: { id: 'contrato_recorrente', label: 'Contrato recorrente', descricao: 'Manutenção mensal/semestral com checklist por visita (reusa o motor do PMOC).', disponivel: false },
  calculadora_tinta: { id: 'calculadora_tinta', label: 'Calculadora de tinta', descricao: 'm² → litros e demãos, dentro do item do orçamento.', disponivel: false },
};

/**
 * Catálogo de verticais. Os CNAEs vêm da tabela CNAE/IBGE (concla.ibge.gov.br);
 * o caso ambíguo 4322-3 é resolvido por subclasse de 7 dígitos.
 */
export const VERTICAIS: readonly Vertical[] = [
  {
    id: 'refrigeracao',
    label: 'Refrigeração e Climatização',
    emoji: '❄️',
    // 4322-3/02 (instalação de ventilação/refrigeração) + 3314-7/10 (manutenção
    // de equipamentos de refrigeração comercial/industrial).
    cnaes: ['4322302', '3314710'],
    ferramentas: ['pmoc', 'qr_equipamento', 'contrato_recorrente'],
  },
  {
    id: 'eletrica',
    label: 'Elétrica',
    emoji: '⚡',
    cnaes: ['43215'], // 4321-5 Instalação elétrica (todas as subclasses).
    ferramentas: ['checklist_nr10', 'laudo_eletrico'],
  },
  {
    id: 'hidraulica',
    label: 'Hidráulica',
    emoji: '🚰',
    cnaes: ['4322301'], // 4322-3/01 instalações hidráulicas/sanitárias/gás.
    ferramentas: ['laudo_estanqueidade'],
  },
  {
    id: 'pintura',
    label: 'Pintura e Acabamento',
    emoji: '🎨',
    cnaes: ['43304'], // 4330-4 Obras de acabamento (inclui pintura de edifícios).
    ferramentas: ['calculadora_tinta'],
  },
  {
    id: 'dedetizacao',
    label: 'Dedetização e Controle de Pragas',
    emoji: '🐜',
    cnaes: ['81222'], // 8122-2 Imunização e controle de pragas urbanas.
    ferramentas: ['certificado_anvisa', 'contrato_recorrente'],
  },
  {
    id: 'jardinagem',
    label: 'Jardinagem e Paisagismo',
    emoji: '🌿',
    cnaes: ['81303'], // 8130-3 Atividades paisagísticas.
    ferramentas: ['contrato_recorrente'],
  },
];

/** A vertical genérica: quando o CNAE não casa com nenhuma especializada. */
export const VERTICAL_GERAL: Vertical = {
  id: 'geral',
  label: 'Serviços em Geral',
  emoji: '🛠️',
  cnaes: [],
  ferramentas: [],
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
 * pega qualquer subclasse elétrica. Nunca lança.
 */
export function deduzirVerticais(
  cnaePrincipal: string | number | null | undefined,
  secundarios: readonly (string | number)[] = [],
): VerticalId[] {
  const codigos = [cnaePrincipal, ...secundarios].map(normalizarCnae).filter((c) => c.length >= 4);
  const encontradas: VerticalId[] = [];
  for (const codigo of codigos) {
    const vertical = casarVertical(codigo);
    if (vertical && !encontradas.includes(vertical)) encontradas.push(vertical);
  }
  return encontradas.length ? encontradas : ['geral'];
}

/** A vertical cujo prefixo de CNAE mais longo casa com o código. `null` se nenhuma. */
function casarVertical(codigo: string): VerticalId | null {
  let melhor: { id: VerticalId; tamanho: number } | null = null;
  for (const v of VERTICAIS) {
    for (const prefixo of v.cnaes) {
      if (codigo.startsWith(prefixo) && (!melhor || prefixo.length > melhor.tamanho)) {
        melhor = { id: v.id, tamanho: prefixo.length };
      }
    }
  }
  return melhor ? melhor.id : null;
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
