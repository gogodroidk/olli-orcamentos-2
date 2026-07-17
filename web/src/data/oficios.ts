/**
 * OS OFÍCIOS DA LANDING — derivados da FONTE, no build. (P13, Fases 1-2)
 *
 * Regra da casa, criada depois de 5 incidentes de copy inventada: **copy/preço/
 * feature só derivada da fonte**. Aqui isso é levado ao pé da letra — em vez de uma
 * lista escrita à mão que envelhece calada, a landing IMPORTA
 * `src/services/verticais.ts` e `src/services/calculosOficio.ts` (os MESMOS módulos
 * que o app usa para decidir o que mostrar) e usa a MESMA função de gate
 * (`calculosDoOficio`) para contar.
 *
 * Os dois são puros — o `verticais.ts` não tem UM import — então entram no bundle
 * do Astro sem arrastar React Native. Consequência prática: adicionar uma vertical
 * ou uma calculadora **atualiza a landing sozinho**, e remover quebra o build em vez
 * de deixar a página vendendo fantasma.
 *
 * O QUE NÃO É VENDIDO AQUI, e por quê:
 *  - As `ferramentas` de `verticais.ts` têm flag `disponivel`. Hoje `checklist_nr10`,
 *    `laudo_eletrico`, `laudo_estanqueidade`, `calculadora_tinta` e
 *    `contrato_recorrente` são **false** — só Refrigeração (PMOC + Etiqueta QR) e
 *    Dedetização (Certificado ANVISA) têm documento pronto. Anunciar "laudo de
 *    estanqueidade" para encanador repetiria o erro que a landing já cometeu com
 *    "equipe no mapa em tempo real": vender o "(em breve)" como pronto.
 *  - "Montagem de móveis" e "Marido de aluguel" estavam no briefing como cards, mas
 *    **não existem** em `verticais.ts`. Em vez de inventá-los, a página usa o
 *    `VERTICAL_GERAL` (que existe na fonte) para dizer a verdade: ofício sem vertical
 *    dedicada continua atendido — só sem ferramenta especializada.
 */
import { CALCULOS, calculosDoOficio } from '../../../src/services/calculosOficio';
import { FERRAMENTAS, VERTICAIS, VERTICAL_GERAL } from '../../../src/services/verticais';
import type { VerticalId } from '../../../src/services/verticais';

export interface OficioLanding {
  id: VerticalId;
  label: string;
  emoji: string;
  /** Calculadoras de campo REAIS deste ofício (contadas pelo gate do app). */
  calculadoras: number;
  /** Só as ferramentas com `disponivel: true`. Promessa não entra. */
  documentos: string[];
  /** Uma linha honesta sobre o que ele ganha HOJE. */
  tagline: string;
}

/** Só o que está pronto — `disponivel: false` é promessa, não produto. */
function documentosProntos(ferramentas: readonly string[]): string[] {
  return ferramentas
    .map((f) => FERRAMENTAS[f as keyof typeof FERRAMENTAS])
    .filter((f) => f?.disponivel)
    .map((f) => f.label);
}

function taglineDe(calculadoras: number, documentos: string[]): string {
  const partes: string[] = [];
  if (documentos.length) partes.push(documentos.join(' e '));
  if (calculadoras) partes.push(`${calculadoras} calculadora${calculadoras > 1 ? 's' : ''} de campo`);
  // Sem ferramenta especializada, o valor é o ciclo — que todo ofício tem.
  return partes.length ? partes.join(' · ') : 'Orçamento, OS e recibo do jeito do seu serviço';
}

export const OFICIOS: OficioLanding[] = VERTICAIS.map((v) => {
  // `calculosDoOficio` é a função que o APP usa no gate. Reusá-la (em vez de
  // filtrar na mão aqui) garante que a landing conte exatamente o que o usuário vai
  // encontrar depois de instalar — não uma aproximação parecida.
  const calculadoras = calculosDoOficio(v.id).length;
  const documentos = documentosProntos(v.ferramentas);
  return {
    id: v.id,
    label: v.label,
    emoji: v.emoji,
    calculadoras,
    documentos,
    tagline: taglineDe(calculadoras, documentos),
  };
});

/**
 * "E se o meu ofício não estiver na lista?" — existe na fonte (`VERTICAL_GERAL`),
 * não é invenção. Tem 0 calculadoras de propósito: `'geral'` NÃO é coringa no gate
 * (ver o comentário em `calculosDoOficio`), então o card promete só o ciclo, que é
 * o que ele realmente entrega.
 */
export const OFICIO_GERAL: OficioLanding = {
  id: VERTICAL_GERAL.id,
  label: VERTICAL_GERAL.label,
  emoji: VERTICAL_GERAL.emoji,
  calculadoras: calculosDoOficio(VERTICAL_GERAL.id).length,
  documentos: [],
  tagline: 'Não achou o seu? O ciclo é o mesmo: orçamento, OS e recibo pra qualquer serviço',
};

/** Total REAL de calculadoras — a página não chuta número. */
export const TOTAL_CALCULADORAS = CALCULOS.length;

/* ───────────────────────── SEO: as páginas /para/[oficio] ─────────────────────── */

/**
 * `VerticalId` → slug da URL. É um `Record` EXAUSTIVO de propósito (mesmo truque do
 * `TENANT_DA_TABELA` do painel): adicionar uma vertical nova em `verticais.ts` sem
 * decidir o slug **não compila** — em vez de a página sumir do site em silêncio.
 *
 * Os slugs são a PROFISSÃO, não a categoria: quem procura no Google digita
 * "app para eletricista", não "app para elétrica". A vertical é a nossa taxonomia
 * interna; o slug é a palavra do usuário. Por isso os dois existem separados.
 */
export const SLUG_POR_OFICIO: Record<VerticalId, string> = {
  refrigeracao: 'climatizacao-e-refrigeracao',
  eletrica: 'eletricista',
  hidraulica: 'encanador',
  pintura: 'pintor',
  dedetizacao: 'dedetizadora',
  jardinagem: 'jardinagem',
  geral: 'prestador-de-servico',
};

/** Como o profissional se chama (entra no H1 e no title). */
export const PROFISSAO_POR_OFICIO: Record<VerticalId, string> = {
  refrigeracao: 'climatização e refrigeração',
  eletrica: 'eletricista',
  hidraulica: 'encanador',
  pintura: 'pintor',
  dedetizacao: 'dedetizadora',
  jardinagem: 'jardinagem e paisagismo',
  geral: 'prestador de serviço',
};

/**
 * A DOR de cada ofício, em uma linha. É o único texto desta página escrito à mão —
 * e por isso é a única parte que pode envelhecer. Fica curto e sobre o CICLO
 * (orçamento → OS → recibo), que é verdade para todos, em vez de prometer
 * ferramenta que talvez não exista.
 */
export const DOR_POR_OFICIO: Record<VerticalId, string> = {
  refrigeracao: 'Orçamento na hora da visita, PMOC sem planilha e o histórico de cada máquina no QR.',
  eletrica: 'Orçamento de quadro, circuito e ponto — com o cálculo feito no celular, sem app de terceiro.',
  hidraulica: 'Do vazamento ao recibo: orçamento com o material certo e a OS assinada na tela.',
  pintura: 'Quantos litros, quantas demãos, quanto cobrar — e o orçamento sai pronto do mesmo lugar.',
  dedetizacao: 'Certificado ANVISA, dosagem calculada e o comprovante que o cliente exige.',
  jardinagem: 'Poda, adubação e contrato mensal — orçamento e recibo sem caderninho.',
  geral: 'Do áudio do cliente ao recibo pago, sem planilha e sem depender de escritório.',
};
