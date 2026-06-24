import { insertEvento } from '../database/database';
import { generateId } from '../utils/id';

/**
 * Instrumentação de eventos (Etapa 0.4 do PROCESSO).
 * Gravamos eventos localmente desde o dia 1 para alimentar, mais tarde, o
 * painel MASTER do Igor (funil signup→orçamento→enviado→aprovado, uso de IA,
 * códigos mais buscados, erros não encontrados, custo de IA por usuário…).
 *
 * `track()` é fire-and-forget e NUNCA lança — analytics jamais quebra a UX.
 */
export const Eventos = {
  signup: 'signup',
  quoteCreated: 'quote_created',
  quoteSent: 'quote_sent',
  quoteApproved: 'quote_approved',
  errorCodeSearched: 'error_code_searched',
  errorCodeOpened: 'error_code_opened',
  errorCodeNotFound: 'error_code_not_found',
  aiUsed: 'ai_used',
  segmentoChanged: 'segmento_changed',
  // Ativação do usuário novo (onboarding) + cadastros do essencial.
  onboardingCompleted: 'onboarding_completed',
  onboardingSkipped: 'onboarding_skipped',
  empresaSaved: 'empresa_saved',
  servicoCreated: 'servico_created',
} as const;

export type EventoNome = (typeof Eventos)[keyof typeof Eventos] | string;

export function track(evento: EventoNome, props?: Record<string, unknown>): void {
  // não await: dispara e esquece; insertEvento já engole erros internamente
  void insertEvento(generateId(), evento, props);
}
