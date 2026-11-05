/**
 * O Jev devolve a distribuição. Quem ordena é o valor esperado e o limiar,
 * nunca o argmax sozinho. Nenhuma ação daqui envia mensagem nem gasta anúncio:
 * o máximo é fila humana.
 */

export const LIMIAR_CONFIANCA = 0.6;
export const LIMIAR_SAIDA = 0.5;
export const LIMIAR_FORA = 0.5;
export const LIMIAR_RISCO_LEGAL = 0.7;

export type Acao = 'descartar' | 'fila_humana' | 'revisar_humano';

export type Motivo =
  | 'saida'
  | 'dado_sensivel'
  | 'limpeza_incompleta'
  | 'resposta_incompleta'
  | 'fora_do_nicho'
  | 'confianca_baixa'
  | 'triagem';

export type Decisao = {
  acao: Acao;
  motivo: Motivo;
  chamaApi: boolean;
  prioridade: number;
  probabilidadePedido: number | null;
  urgenciaEsperada: number | null;
  confianca: number | null;
};

export type RespostaChoice = {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type RespostaScore = {
  type?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type RespostaNoul = {
  type?: string;
  noul?: number;
};

export function valorEsperado(probabilities: Record<string, number>): number {
  let soma = 0;
  for (const [nivel, peso] of Object.entries(probabilities)) {
    const n = Number(nivel);
    if (!Number.isFinite(n) || !Number.isFinite(peso)) {
      throw new Error('probabilidade invalida');
    }
    soma += n * peso;
  }
  return soma;
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

function mapa(valor: unknown): Record<string, number> | null {
  if (!valor || typeof valor !== 'object') return null;
  const saida: Record<string, number> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    saida[k] = v;
  }
  return saida;
}

export function decisaoLocal(motivo: 'saida' | 'dado_sensivel' | 'limpeza_incompleta'): Decisao {
  return {
    acao: motivo === 'saida' ? 'descartar' : 'fila_humana',
    motivo,
    chamaApi: false,
    prioridade: 0,
    probabilidadePedido: null,
    urgenciaEsperada: null,
    confianca: null,
  };
}

export function triarPelasRespostas(answers: Record<string, unknown> | null | undefined): Decisao {
  const base = {
    chamaApi: true,
    prioridade: 0,
    probabilidadePedido: null as number | null,
    urgenciaEsperada: null as number | null,
    confianca: null as number | null,
  };
  if (!answers) {
    return { ...base, acao: 'fila_humana', motivo: 'resposta_incompleta' };
  }
  const intencao = answers.intencao as RespostaChoice | undefined;
  const urgencia = answers.urgencia as RespostaScore | undefined;
  const optOut = answers.opt_out as RespostaNoul | undefined;
  const probs = mapa(intencao?.probabilities);
  const probsUrg = mapa(urgencia?.probabilities);
  const confInt = numero(intencao?.confidence);
  const confUrg = numero(urgencia?.confidence);
  const noul = numero(optOut?.noul);
  if (!probs || !probsUrg || confInt === null || confUrg === null || noul === null) {
    return { ...base, acao: 'fila_humana', motivo: 'resposta_incompleta' };
  }
  const pPedido = probs.pedido_servico ?? 0;
  const pFora = probs.fora_do_nicho ?? 0;
  const pSaida = probs.saida ?? 0;
  let urgenciaEsperada = 0;
  try {
    urgenciaEsperada = valorEsperado(probsUrg);
  } catch {
    return { ...base, acao: 'fila_humana', motivo: 'resposta_incompleta' };
  }
  const confianca = Math.min(confInt, confUrg);
  const prioridade = pPedido * (1 + urgenciaEsperada);
  const comum = {
    ...base,
    prioridade,
    probabilidadePedido: pPedido,
    urgenciaEsperada,
    confianca,
  };
  if (noul >= LIMIAR_SAIDA || pSaida >= LIMIAR_SAIDA) {
    return { ...comum, acao: 'descartar', motivo: 'saida', prioridade: 0 };
  }
  if (pFora > pPedido && pFora >= LIMIAR_FORA) {
    return { ...comum, acao: 'descartar', motivo: 'fora_do_nicho', prioridade: 0 };
  }
  if (confianca < LIMIAR_CONFIANCA) {
    return { ...comum, acao: 'revisar_humano', motivo: 'confianca_baixa' };
  }
  return { ...comum, acao: 'revisar_humano', motivo: 'triagem' };
}

export type PontuacaoIdeia = {
  id: string;
  impactoEsperado: number;
  confianca: number;
  riscoLegal: number;
  precisaParecer: boolean;
  soPista: boolean;
  esforco: string | null;
};

export function pontuarIdeia(
  id: string,
  answers: {
    impacto?: RespostaScore;
    risco_legal?: RespostaNoul;
    esforco?: RespostaChoice;
  },
): PontuacaoIdeia | null {
  const probs = mapa(answers.impacto?.probabilities);
  const confianca = numero(answers.impacto?.confidence);
  const risco = numero(answers.risco_legal?.noul);
  if (!probs || confianca === null || risco === null) return null;
  let impactoEsperado = 0;
  try {
    impactoEsperado = valorEsperado(probs);
  } catch {
    return null;
  }
  return {
    id,
    impactoEsperado,
    confianca,
    riscoLegal: risco,
    precisaParecer: risco >= LIMIAR_RISCO_LEGAL,
    soPista: confianca < LIMIAR_CONFIANCA,
    esforco: typeof answers.esforco?.choice === 'string' ? answers.esforco.choice : null,
  };
}

export function ordenarIdeias(itens: PontuacaoIdeia[]): PontuacaoIdeia[] {
  return [...itens].sort((a, b) => b.impactoEsperado - a.impactoEsperado || a.id.localeCompare(b.id));
}
