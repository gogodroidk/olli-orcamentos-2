import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * NotificationProvider — NOTIFICAÇÕES ao usuário do app (lembrete de
 * compromisso, orçamento parado, pagamento vencendo). Duas naturezas atrás da
 * mesma porta: LOCAL/agendada (dispara no aparelho, funciona offline) e PUSH
 * remota (servidor → aparelho, exige token/registro).
 *
 * Provider de-facto HOJE (local): `expo-notifications` via
 * `src/services/agenda.ts` — canal Android, permissão, `agendarLembrete`
 * (lembrete 60 min antes) e cancelamento. É a impl concreta desta porta para o
 * caso LOCAL e já está em produção.
 *
 * Provider PUSH (futuro): candidato FCM (Firebase Cloud Messaging) para push
 * remota; central multi-canal (in-app + e-mail + push) é o Novu como PROVA DE
 * CONCEITO, atrás desta mesma porta (não adotar sem comparar com a camada
 * própria — ver backlog NOTIF). Push remota exige o prebuild único (D-10).
 *
 * Onda de fiação: local já operante; push remota + automações
 * pré-configuradas na Onda 12 (Agenda avançada + Google), reaproveitando o
 * e-mail da Onda 6 como canal de fallback.
 */
export interface NotificationProvider extends PortaDisponivel {
  /** Garante permissão de notificação (pede se necessário). */
  garantirPermissao(): Promise<boolean>;

  /**
   * Agenda uma notificação LOCAL para `quando` (ISO). Devolve um id para poder
   * cancelar depois. Espelha `agenda.ts.agendarLembrete`.
   */
  agendarLocal(input: NotificacaoLocalInput): Promise<ResultadoPorta<{ id: string }>>;

  /** Cancela uma notificação local agendada. No-op se o id não existir. */
  cancelarLocal(id: string): Promise<void>;
}

export interface NotificacaoLocalInput {
  titulo: string;
  corpo: string;
  /** Momento do disparo (ISO 8601). */
  quando: string;
  /** Payload leve para a UI reagir ao toque (ex.: { agendamentoId }). */
  dados?: Record<string, string>;
}
