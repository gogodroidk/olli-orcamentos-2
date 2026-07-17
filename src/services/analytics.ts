import { insertEvento } from '../database/database';
import { generateId } from '../utils/id';
import { analyticsRemotoLigado, enviarEvento, pseudonimo } from './analyticsRemoto';
import { getCurrentUser } from './supabase';

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
  // Gate de plano (Onda 1 — funil de conversão do freemium).
  // gateVisto: o usuário topou num recurso bloqueado (preview borrado + CTA).
  // gateCta: o usuário tocou em "Ver planos" a partir de um gate.
  gateVisto: 'gate_visto',
  gateCta: 'gate_cta',
  // Central de Ajuda + Suporte (Frente 3).
  ajudaArtigoAberto: 'ajuda_artigo_aberto',
  ajudaBuscou: 'ajuda_buscou',
  ajudaSuporteContato: 'ajuda_suporte_contato',
} as const;

export type EventoNome = (typeof Eventos)[keyof typeof Eventos] | string;

export function track(evento: EventoNome, props?: Record<string, unknown>): void {
  // não await: dispara e esquece; insertEvento já engole erros internamente
  void insertEvento(generateId(), evento, props);
  // DUPLA ESCRITA (P9): o mesmo evento vai para o PostHog quando
  // EXPO_PUBLIC_POSTHOG_KEY existe. Sem a chave, é no-op — o app pode ser
  // publicado hoje e a chave entra depois, sem tocar em nenhum call site (era
  // exatamente o contrato prometido em ports/AnalyticsProvider.ts).
  //
  // O LOCAL continua sendo a fonte de verdade do funil: ele guarda o evento
  // COMPLETO (é do dono, no aparelho dele). O remoto recebe a versão faxinada —
  // sem PII, com id pseudonimizado. As duas pontas divergirem em conteúdo é o
  // desenho, não um bug: são públicos diferentes.
  void enviarRemoto(evento, props);
}

/**
 * Espelha no PostHog. Isolado do `track` para manter o `track` SÍNCRONO (todos os
 * call sites contam com isso) enquanto o pseudônimo, que é um hash assíncrono,
 * resolve por fora.
 *
 * Sem sessão, não envia: um evento sem dono não ajuda o funil e ainda criaria um
 * `distinct_id` anônimo por chamada, inflando "usuários" no painel com fantasmas.
 */
async function enviarRemoto(evento: EventoNome, props?: Record<string, unknown>): Promise<void> {
  try {
    if (!analyticsRemotoLigado()) return; // sem chave: nem toca em rede/sessão
    const user = await getCurrentUser();
    if (!user?.id) return;
    enviarEvento(evento, await pseudonimo(user.id), props);
  } catch {
    // analytics jamais quebra a UX
  }
}
