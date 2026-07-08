import type { PortaDisponivel, ResultadoPorta } from './comum';

/**
 * CalendarProvider — sincroniza um compromisso do OLLI com o CALENDÁRIO do
 * usuário (o compromisso também aparece na agenda do celular/Google). É
 * diferente de NotificationProvider (que só lembra) e de RoutingProvider (que só
 * calcula rota): aqui espelhamos o evento num calendário externo.
 *
 * Provider escolhido: Google Calendar (Calendar API v3, scope calendar.events).
 * Autorização OAuth; o client Android exige SHA-1 do keystore de release —
 * bloqueio B3. Tokens no SecureStore do aparelho, nunca no bundle.
 *
 * Impl de-facto HOJE (completa, atrás de flag): `src/services/googleAgenda.ts`
 *   - `googleAgendaDisponivel()` (liga por `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID`);
 *   - `conectarGoogleAgenda` / `desconectarGoogleAgenda` / `estaConectado`;
 *   - `pushAgendamento` (cria/atualiza evento) / `deleteEventoGoogle`.
 * Todo o fluxo PKCE + refresh já está escrito; só o client Android (B3) falta
 * para ligar em produção. `disponivel()` desta porta espelha
 * `googleAgendaDisponivel()`.
 *
 * Onda de fiação: Onda 12 (Agenda avançada + Google) — bloqueada por B3 no APK
 * final; no web o login Google já funciona.
 */
export interface CalendarProvider extends PortaDisponivel {
  /** `true` se há uma conexão de calendário ativa (tokens salvos). */
  conectado(): Promise<boolean>;

  /** Inicia o fluxo de autorização (abre login do provedor). */
  conectar(): Promise<ResultadoPorta<void>>;

  /** Remove a conexão local (não revoga no lado do provedor). */
  desconectar(): Promise<void>;

  /**
   * Cria ou atualiza o evento correspondente ao agendamento no calendário
   * externo. `agendamentoId` é a chave de idempotência (um evento por
   * agendamento). Espelha `googleAgenda.ts.pushAgendamento`.
   */
  espelharEvento(input: EventoCalendarioInput): Promise<ResultadoPorta<{ eventoId: string }>>;

  /** Remove o evento externo correspondente ao agendamento, se existir. */
  removerEvento(agendamentoId: string): Promise<void>;
}

export interface EventoCalendarioInput {
  /** Chave estável do agendamento local (ver Agendamento em src/types). */
  agendamentoId: string;
  titulo: string;
  /** Início/fim em ISO 8601. */
  inicio: string;
  fim?: string;
  local?: string;
}
