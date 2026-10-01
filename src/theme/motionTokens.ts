/**
 * TOKENS PUROS DE MOVIMENTO — a fonte única de todo número de animação do app.
 *
 * Este arquivo NÃO importa `react-native` nem Reanimated de propósito: assim o
 * teste (`scripts/teste-motion-tokens.ts`) roda em Node puro, e tanto o mundo
 * `Animated` (src/theme/motion.ts) quanto o mundo Reanimated
 * (src/components/motion/) leem os MESMOS valores. Componente de motion novo
 * consome daqui; número solto de duração/mola/distância fora deste arquivo é bug.
 *
 * Linguagem: "estilo Apple para Android" — curto, com mola amortecida, sem
 * quique exagerado. Só `transform` e `opacity` são animados (nunca layout).
 */

/** Durações em milissegundos. */
export const DURACAO = {
  /** Retorno de toque: o que precisa parecer imediato. */
  instant: 90,
  /** Microinteração: troca de estado, aparecer/sumir pequeno. */
  fast: 160,
  /** Padrão de entrada/saída de elemento. */
  base: 240,
  /** Elemento grande ou que atravessa a tela. */
  slow: 360,
} as const;

/**
 * Ciclos longos que não são "transição": a contagem de um número e o brilho do
 * skeleton. Ficam separados para não contaminar a escala de durações acima.
 */
export const CICLO = {
  /** Número que conta até o valor (ContadorAnimado). */
  contagem: 720,
  /** Uma passada do brilho do Skeleton. Único loop infinito permitido no app. */
  shimmer: 1200,
} as const;

export type Mola = { readonly damping: number; readonly stiffness: number; readonly mass: number };

/** Molas (Reanimated `withSpring`). */
export const MOLA = {
  /** Volta do toque, chips, toggles: assenta rápido, sem sobra visível. */
  snappy: { damping: 22, stiffness: 320, mass: 0.8 },
  /** Cartões e folhas entrando: macia, sem quique. */
  gentle: { damping: 20, stiffness: 170, mass: 1 },
  /** Celebração pontual (ex.: confirmação): um quique leve, uma vez. */
  bouncy: { damping: 12, stiffness: 220, mass: 1 },
} as const satisfies Record<string, Mola>;

export type Curva = readonly [number, number, number, number];

/** Curvas cubic-bezier (x1, y1, x2, y2), iguais no RN `Easing.bezier` e no Reanimated. */
export const CURVA = {
  /** Mudança de estado dentro da tela. */
  standard: [0.2, 0, 0, 1],
  /** Entrada com ênfase: arranca rápido e assenta devagar. */
  emphasized: [0.05, 0.7, 0.1, 1],
  /** Desaceleração simples (contagem, entrada discreta). */
  decelerate: [0, 0, 0.2, 1],
} as const satisfies Record<string, Curva>;

/** Distâncias de deslocamento em dp (translateY/translateX). */
export const DISTANCIA = {
  /** Deslize quase imperceptível. */
  sutil: 4,
  /** Entrada padrão de card/linha (Aparecer). */
  entrada: 12,
  /** Folha/painel atravessando parte da tela. */
  deslize: 24,
} as const;

/** Escalonamento de listas: atraso por índice e teto (item 40 não espera 2 s). */
export const STAGGER = {
  passo: 40,
  maxItens: 8,
} as const;

/**
 * Gestos de arrastar para dispensar (toast que sobe, folha que desce). O limiar
 * é em dp OU em fração da altura do elemento; a velocidade em dp/s pega o
 * "peteleco" rápido que não chegou a andar muito.
 */
export const GESTO = {
  /** Toast: arrastou pra cima mais que isso → some. */
  limiarDispensa: 24,
  /** Folha: arrastou pra baixo mais que esta fração da própria altura → fecha. */
  fracaoFechar: 0.3,
  /** Peteleco: acima disso (dp/s) dispensa mesmo com pouco deslocamento. */
  velocidadeDispensa: 700,
  /** Arrastar no sentido "errado" anda só esta fração do dedo (borracha). */
  resistencia: 0.15,
  /** Ignora tremida do dedo antes de virar arrasto (dp) — o toque ainda é toque. */
  folgaAtivacao: 8,
} as const;

/** Escala e opacidade do toque. */
export const TOQUE = {
  escalaPressionado: 0.97,
  /** Card/linha larga: a mesma redução em pixel de 0.97 parece um pulo numa área grande. */
  escalaCard: 0.98,
  /** Botão de destaque pequeno e redondo (o "Orçar" central): afunda mais, de propósito. */
  escalaDestaque: 0.92,
  opacidadePressionado: 0.9,
  opacidadeDesabilitado: 0.55,
} as const;

/**
 * Duração respeitando "Reduzir movimento": com a preferência ligada, toda
 * transição vira instantânea (0 ms). O conteúdo final é o mesmo — só some o
 * caminho até ele.
 */
export function duracaoAcessivel(ms: number, reduzirMovimento: boolean): number {
  return reduzirMovimento ? 0 : ms;
}

/** A tabela inteira de durações já ajustada à preferência do sistema. */
export function duracoesAcessiveis(reduzirMovimento: boolean): { [K in keyof typeof DURACAO]: number } {
  return {
    instant: duracaoAcessivel(DURACAO.instant, reduzirMovimento),
    fast: duracaoAcessivel(DURACAO.fast, reduzirMovimento),
    base: duracaoAcessivel(DURACAO.base, reduzirMovimento),
    slow: duracaoAcessivel(DURACAO.slow, reduzirMovimento),
  };
}

/** Atraso de entrada do item `indice` numa lista (0 com "Reduzir movimento"). */
export function atrasoEscalonado(indice: number, reduzirMovimento: boolean): number {
  if (reduzirMovimento || !Number.isFinite(indice) || indice <= 0) return 0;
  return Math.min(Math.floor(indice), STAGGER.maxItens) * STAGGER.passo;
}
