/**
 * POPUP DE FEEDBACK DO CADEADO — regra PURA (sem React Native), spec do CPO (seção A).
 *
 * Aparece quando a pessoa toca um cadeado do Pro (D-2267) e FECHA SEM ASSINAR: "O que faltou para você
 * assinar o Pro?". Frequência e consentimento moram aqui para o site usar a mesma regra (a copy está em
 * `feedbackCadeadoCopy.ts`).
 *
 * Nunca aparece: antes do 1º envio de orçamento, durante criar/enviar/pagar (rotas sensíveis), com o plano
 * não confirmado, mais de 1 vez por semana, nos 14 dias depois de "agora não" e nunca mais depois de
 * "não perguntar mais". Dúvida (dado que não deu para ler) = não mostra.
 */

export const DIAS_ENTRE_POPUPS = 7;
export const DIAS_AGORA_NAO = 14;
const DIA_MS = 24 * 60 * 60 * 1000;

export interface EstadoFeedbackCadeado {
  /** ISO de quando o popup foi MOSTRADO pela última vez (grava ao mostrar, não ao responder). */
  ultimoMostradoEm?: string;
  /** ISO até quando "agora não" vale. */
  agoraNaoAte?: string;
  /** "Não perguntar mais": nunca volta. */
  naoPerguntarMais?: boolean;
  /** ISO da última resposta enviada. */
  respondeuEm?: string;
}

/** Telas em que a pessoa está CRIANDO, ENVIANDO ou PAGANDO — o popup espera. Nomes de rota do AppNavigator. */
export const ROTAS_SENSIVEIS: readonly string[] = [
  'NovoOrcamento', 'EditarOrcamento', 'EmitirRecibo', 'Planos', 'Assinatura', 'Creditos',
  'Entrar', 'Onboarding', 'OlliVoz', 'OlliChat', 'DiagnosticoIA',
];

export interface ContextoPopup {
  agora: number;
  /** `null` = não deu para saber (carregando/erro): nunca mostra no escuro. */
  jaEnviouOrcamento: boolean | null;
  /** Nome da rota em foco quando o cadeado foi fechado. */
  rotaAtual: string | null;
  /** O plano foi confirmado como não pago? (cartão do cadeado já trata; aqui é a trava final) */
  planoConfirmadoGratis: boolean;
}

export type MotivoSemPopup =
  | 'nunca_mais' | 'primeiro_envio_pendente' | 'envio_desconhecido' | 'rota_sensivel' | 'plano_nao_confirmado' | 'semana' | 'agora_nao';

export type DecisaoPopup = { mostrar: true } | { mostrar: false; motivo: MotivoSemPopup };

const ms = (iso?: string): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

export function decidirPopup(estado: EstadoFeedbackCadeado, ctx: ContextoPopup): DecisaoPopup {
  if (estado.naoPerguntarMais) return { mostrar: false, motivo: 'nunca_mais' };
  if (ctx.jaEnviouOrcamento === null) return { mostrar: false, motivo: 'envio_desconhecido' };
  if (!ctx.jaEnviouOrcamento) return { mostrar: false, motivo: 'primeiro_envio_pendente' };
  if (!ctx.planoConfirmadoGratis) return { mostrar: false, motivo: 'plano_nao_confirmado' };
  if (ctx.rotaAtual && ROTAS_SENSIVEIS.includes(ctx.rotaAtual)) return { mostrar: false, motivo: 'rota_sensivel' };
  const ate = ms(estado.agoraNaoAte);
  if (ate !== null && ctx.agora < ate) return { mostrar: false, motivo: 'agora_nao' };
  const ultimo = ms(estado.ultimoMostradoEm);
  if (ultimo !== null && ctx.agora - ultimo < DIAS_ENTRE_POPUPS * DIA_MS) return { mostrar: false, motivo: 'semana' };
  return { mostrar: true };
}

const iso = (t: number) => new Date(t).toISOString();

export const aposMostrar = (e: EstadoFeedbackCadeado, agora: number): EstadoFeedbackCadeado => ({ ...e, ultimoMostradoEm: iso(agora) });
export const aposAgoraNao = (e: EstadoFeedbackCadeado, agora: number): EstadoFeedbackCadeado => ({ ...e, agoraNaoAte: iso(agora + DIAS_AGORA_NAO * DIA_MS) });
export const aposNaoPerguntarMais = (e: EstadoFeedbackCadeado): EstadoFeedbackCadeado => ({ ...e, naoPerguntarMais: true });
export const aposResposta = (e: EstadoFeedbackCadeado, agora: number): EstadoFeedbackCadeado => ({ ...e, respondeuEm: iso(agora) });

/** Lê o JSON gravado; qualquer coisa estranha vira estado vazio (nunca lança). */
export function lerEstadoFeedbackCadeado(bruto: string | null | undefined): EstadoFeedbackCadeado {
  if (!bruto) return {};
  try {
    const o = JSON.parse(bruto) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return {};
    const s = (v: unknown) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined);
    return {
      ultimoMostradoEm: s(o.ultimoMostradoEm),
      agoraNaoAte: s(o.agoraNaoAte),
      naoPerguntarMais: o.naoPerguntarMais === true ? true : undefined,
      respondeuEm: s(o.respondeuEm),
    };
  } catch {
    return {};
  }
}
