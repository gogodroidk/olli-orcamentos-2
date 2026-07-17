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
