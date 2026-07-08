/**
 * Camada de PORTAS (ports) do OLLI — ponto único de importação.
 *
 * O QUE É: um conjunto de interfaces ("portas") atrás das quais cada integração
 * externa deve viver. Nenhuma tela deve chamar uma API externa direto; o fluxo
 * alvo é `UI → caso de uso → porta → adaptador → API externa` (pesquisa §10).
 * Trocar de provider passa a ser trocar um adaptador, sem desmontar o produto.
 *
 * O QUE ESTA CAMADA NÃO É (ainda): não há NENHUMA implementação concreta aqui.
 * Cada porta é 100% declarativa e aditiva. Vários services JÁ são a "impl
 * de-facto" de uma porta (ex.: `olliIA.ts` para AiProvider, `analytics.ts` para
 * AnalyticsProvider, `googleAgenda.ts` para CalendarProvider) — o JSDoc de cada
 * interface aponta exatamente qual arquivo é a impl atual e em que onda a fiação
 * formal (injetar um adaptador que implemente a interface) acontece. Até lá,
 * os call-sites atuais continuam intactos: importar deste barrel não muda nada
 * em runtime nem no typecheck.
 *
 * MAPA porta → impl de-facto → onda de fiação (resumo; detalhe no JSDoc de cada):
 *   PaymentProvider      → (nenhuma; registro manual em pagamentos.ts) → Onda 9
 *   SubscriptionProvider → PlanosScreen + worker/stripe.js + planos.ts → operante
 *   EmailProvider        → (nenhuma; mailto/WhatsApp fallback)         → Onda 6 (B2)
 *   NotificationProvider → agenda.ts (expo-notifications, local)       → Onda 12
 *   MapsProvider         → rotas.ts (deep-link) + localizacaoEquipe.ts → Onda 8/12
 *   RoutingProvider      → (nenhuma; só deep-link em rotas.ts)         → Onda 12 (B4)
 *   CalendarProvider     → googleAgenda.ts (atrás de flag)             → Onda 12 (B3)
 *   StorageProvider      → (nenhuma; URI local)                        → Onda 7
 *   SignatureProvider    → clienteLink.ts (aceite leve) / imagem       → Onda 11+
 *   FiscalProvider       → (nenhuma; proibido antes do financeiro)     → pós-Onda 9
 *   AiProvider           → olliIA.ts + olliAssistente.ts + vozNuvem.ts → operante
 *   AnalyticsProvider    → analytics.ts (local)                        → Fase 1
 *
 * Backlog priorizado e critérios (fallback, bloqueio humano): docs/INTEGRATION_BACKLOG.md
 */

export type {
  Centavos,
  Moeda,
  ResultadoPorta,
  MotivoFalhaPorta,
  PortaDisponivel,
} from './comum';

export type {
  PaymentProvider,
  FormaCobranca,
  StatusCobranca,
  CriarCobrancaInput,
  Cobranca,
} from './PaymentProvider';

export type {
  SubscriptionProvider,
  PlanoCheckout,
  AssinaturaAtual,
} from './SubscriptionProvider';

export type {
  EmailProvider,
  TemplateEmail,
  EnviarEmailInput,
} from './EmailProvider';

export type {
  NotificationProvider,
  NotificacaoLocalInput,
} from './NotificationProvider';

export type {
  MapsProvider,
  Coordenada,
} from './MapsProvider';

export type {
  RoutingProvider,
  Trajeto,
  Roteiro,
} from './RoutingProvider';

export type {
  CalendarProvider,
  EventoCalendarioInput,
} from './CalendarProvider';

export type {
  StorageProvider,
  CategoriaArquivo,
  EnviarArquivoInput,
  ArquivoArmazenado,
} from './StorageProvider';

export type {
  SignatureProvider,
  Signatario,
  SolicitarAssinaturaInput,
  StatusAssinatura,
  PedidoAssinatura,
} from './SignatureProvider';

export type {
  FiscalProvider,
  NotaServicoInput,
  StatusFiscal,
  DocumentoFiscal,
} from './FiscalProvider';

export type {
  AiProvider,
  DiagnosticoInputPort,
  DiagnosticoSaidaPort,
  ItemOrcamentoIA,
  MensagemChatPort,
} from './AiProvider';

export type { AnalyticsProvider } from './AnalyticsProvider';
