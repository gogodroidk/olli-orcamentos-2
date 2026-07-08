/**
 * AnalyticsProvider — instrumentação de EVENTOS de produto (funil
 * signup→orçamento→enviado→aprovado, uso de IA, gate de plano…). Fire-and-forget
 * e NUNCA lança — analytics jamais quebra a UX (regra que a impl atual já segue).
 *
 * Provider de-facto HOJE (impl concreta): `src/services/analytics.ts` — grava os
 * eventos LOCALMENTE (SQLite via `insertEvento`) desde o dia 1, para alimentar
 * mais tarde o painel MASTER do dono. `track(evento, props)` é a impl direta
 * desta porta; os nomes canônicos vivem em `Eventos` (mesmo arquivo).
 *
 * Provider futuro: PostHog (funil, feature flags, session replay MASCARADO) como
 * destino REMOTO, atrás desta mesma porta. Regra inegociável do backlog e da
 * pesquisa §5.1: NENHUM dado sensível nas propriedades (sem CPF/CNPJ/telefone/
 * endereço/conteúdo de orçamento); IDs pseudonimizados; inputs mascarados. O
 * adaptador PostHog fará dupla escrita (local + remoto) sem trocar os call-sites
 * de `track(...)`. Sentry (erros/crashes) é porta-irmã de observabilidade, não
 * coberta aqui (também com scrubbing de PII) — ver backlog OBSERVABILITY.
 *
 * Onda de fiação: Fase 1 da pesquisa (estabilidade). Como não há bloqueio
 * humano forte além de criar o projeto PostHog, pode entrar cedo; sem onda
 * dedicada no roadmap atual — encaixa como refino de observabilidade.
 */
export interface AnalyticsProvider {
  /**
   * Registra um evento. `evento` é um dos nomes canônicos (ver `Eventos` em
   * analytics.ts) ou uma string livre. `props` NUNCA deve conter PII. Não
   * retorna nada e nunca lança (fire-and-forget) — igual ao `track` atual.
   */
  track(evento: string, props?: Record<string, unknown>): void;
}
