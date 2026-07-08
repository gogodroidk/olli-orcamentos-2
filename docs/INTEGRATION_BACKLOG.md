# INTEGRATION_BACKLOG — integrações externas priorizadas

> Fonte: pesquisa (`PESQUISA_APROFUNDADA_FERRAMENTAS_OLLI_V2_PMOC.md` §5, §9, §10)
> **decidida contra a nossa stack real** — não é o radar cru, é o que serve pro
> OLLI. Regra da casa: **UI → caso de uso → porta → adaptador → API externa**;
> nenhuma tela chama API externa direto. As interfaces já existem, aditivas e
> declarativas, em `src/services/ports/` (nenhuma impl concreta ainda). Cada item
> abaixo casa 1:1 com uma porta. Bloqueios humanos referenciam `KNOWN_BLOCKERS.md`
> (B1–B6); decisões referenciam `DECISIONS.md` (D-01…D-14). Atualizado 2026-07-08.

## Como ler a prioridade

- **P0** — já operante como impl de-facto; só falta formalizar o adaptador (baixo risco).
- **P1** — próximo a fiar; problema real e caminho claro, entra na onda indicada.
- **P2** — depende de onda anterior fechar (financeiro/CRM) ou de prova de conceito.
- **P3** — só quando escala/complexidade justificar; hoje seria over-engineering.

Antes de ligar QUALQUER item novo, passar pela matriz de avaliação da pesquisa §11
(mínimo 75/100) e registrar a decisão em `DECISIONS.md`. Proibido botão "em breve"
e prometer integração que depende de credencial ausente (pesquisa §15).

---

## Backlog

| # | Porta | Problema real que resolve | Provider decidido | Impl de-facto hoje | Se cair (fallback) | Bloqueio humano | Onda | Prioridade |
|---|---|---|---|---|---|---|---|---|
| SUB | `SubscriptionProvider` | Receita do SaaS: prestador assina Pro/Empresa (mensal/anual/12x) e gerencia no portal. | **Stripe** (Checkout + Portal); webhook = fonte da verdade do plano (D-03). | `PlanosScreen.tsx` + `worker/src/stripe.js` + `planos.ts` (lê `assinaturas`). **Já em produção.** | Plano cai no cache local por 7 dias de graça (`planos.ts`); nunca bloqueia quem pagou e ficou offline. | **B1** (installments + 3 Prices no dashboard) p/ 12x/Empresa live. | Onda 1 (concluída) | **P0** |
| AI | `AiProvider` | O diferencial da OLLI: diagnóstico por código de erro, orçamento por voz/texto, chat. | Worker `olli-diagnostico` com **Gemini** (Claude opcional); chave = secret do worker. | `olliIA.ts` (`diagnosticarCaso`) + `olliAssistente.ts` (voz/chat) + `vozNuvem.ts` (`/transcrever`). **Já em produção.** | Cache local + **base de 698 códigos offline** (`fallbackBase`); voz/chat mostram mensagem amigável e caminho manual. Nunca lança. | — (opera hoje) | operante | **P0** |
| ANALYTICS | `AnalyticsProvider` | Enxergar o funil (signup→orçamento→enviado→aprovado), uso de IA, gate — pro painel MASTER do dono. | **PostHog** como destino remoto (mascarado); local continua. | `analytics.ts` (`track` → `insertEvento`, SQLite). **Já grava local desde o dia 1.** | Fire-and-forget: se o remoto cair, o evento fica no SQLite local; a UX nunca sente (nunca lança). | Criar projeto PostHog (leve). | Fase 1 (estabilidade) | **P1** |
| EMAIL | `EmailProvider` | Entregar orçamento/recibo/boas-vindas/convite por e-mail (hoje só WhatsApp/mailto). | **Resend**, remetente `mail.olliorcamentos.online` (D-06); DKIM via Hostinger MCP. | Nenhuma. Fallback atual = `mailto:`/WhatsApp deep-link (`utils/exportarDocumento.ts`). | Deep-link `mailto:`/WhatsApp offline; log `emails_enviados` marca não-enviados p/ retentar. | **B2** (conta + API key Resend, ~5 min). | Onda 6 | **P1** |
| STORAGE | `StorageProvider` | Logo/fotos/PDF com URL consistente em web+mobile+e-mail (hoje logo é URI local e some). | **Supabase Storage** com RLS por owner (D-13); `storage.limit_mb` reservado. | Nenhuma. Logo/fotos vivem como URI local (`Step4Personalizacao.tsx`, `utils/fotosOrcamento.ts`). | Enquanto não sobe, segue URI local no aparelho; e-mail com logo aguarda a fiação. | — (Supabase já provisionado). | Onda 7 (PDF v2) | **P1** |
| PAY | `PaymentProvider` | Prestador COBRA o cliente final dele (PIX/boleto/cartão/link) — não é a assinatura SaaS. | **Asaas** (candidato BR); segredo só no worker. | Nenhuma cobrança online. Hoje só **registro manual** de pagamento (`pagamentos.ts` → `registrarPagamento`). | Segue registro manual + recibo (`EmitirReciboScreen`); nada quebra sem a cobrança online. | Conta Asaas + sandbox (pós-financeiro). | Onda 9 (Financeiro) | **P2** |
| MAPS | `MapsProvider` | Geocodificar/validar endereço dos locais de atendimento (CRM) e abrir mapa no destino. | **Google** (Geocoding/Places/Address Validation) inicial; MapLibre p/ visualização futura. | `rotas.ts` (`abrirRotaGoogleMaps`, deep-link sem chave) + flag `mapaEmbutidoDisponivel`. | Deep-link público do Google Maps sempre funciona; sem geocoding, cadastro aceita endereço livre (nunca trava, pesquisa §9). | **B4** (billing Google) só p/ mapa embutido. | Onda 8/12 | **P2** |
| ROUTING | `RoutingProvider` | Tempo/distância com trânsito e ordenar as paradas do dia do técnico (roteiro). | **Google Routes API** inicial; OSRM/GraphHopper self-hosted quando houver volume. | Nenhum cálculo interno; só deep-link abre o Maps que mostra o trânsito (`rotas.ts`). | Deep-link do Maps (o próprio app mostra tempo/rota); o roteiro fica manual até fiar. | **B4** (billing Google). | Onda 12 (Agenda) | **P2** |
| CALENDAR | `CalendarProvider` | Compromisso do OLLI aparecer também no Google Agenda do técnico. | **Google Calendar** (Calendar API v3); OAuth. | `googleAgenda.ts` **completo atrás de flag** (PKCE + refresh + push/delete evento). | Lembrete LOCAL (`agenda.ts`, 60 min antes) já avisa mesmo sem Google conectado. | **B3** (OAuth client Android + SHA-1) p/ APK. | Onda 12 (Agenda) | **P2** |
| NOTIF | `NotificationProvider` | Lembrar compromisso e alertar (orçamento parado, pagamento vencendo) — local hoje, push depois. | **expo-notifications** (local, atual) + **FCM** (push futuro); Novu multi-canal = PoC. | `agenda.ts` (canal Android, permissão, `agendarLembrete`, cancelar). **Local já em produção.** | Sem push, o lembrete local cobre o essencial; alertas remotos caem no e-mail (Onda 6). | Push remota exige o prebuild único (D-10). | Onda 12 | **P2** |
| SIGNATURE | `SignatureProvider` | Assinatura FORMAL com trilha (contrato, termo, PMOC, múltiplos signatários). | **Documenso** (open-source, webhooks, certificado). | Aceite LEVE já resolvido pela Onda 3 (`clienteLink.ts` → `trilhaDoLink`); assinatura como imagem no recibo. | Aprovar/recusar no portal + trilha já cobre o orçamento; documento formal aguarda a fiação. | Instância/conta Documenso (self-host ou SaaS). | Onda 11+ (contratos/PMOC) | **P3** |
| FISCAL | `FiscalProvider` | Emitir NFS-e/NF-e do serviço, consultar, cancelar, baixar XML — por município. | **Nuvem Fiscal** (candidato); rollout por município, homologação primeiro; cert. só no backend. | Nenhuma — e **proibido** emitir nota antes de financeiro + status sólidos (pesquisa §15). | Recibo comercial atual (não fiscal) segue valendo; nada depende da nota para o ciclo. | Certificado digital + credenciamento municipal. | pós-Onda 9 | **P3** |

---

## Regras que valem para TODO item de pagamento/webhook

Da pesquisa §5.2 (Asaas) e §4.3 — **não implementar sem**: sandbox, idempotência,
fila (Cloudflare Queues), verificação de assinatura do webhook, **webhook
persistido antes de processar**, conciliação, tratamento de estorno/chargeback,
status intermediários e **segredo apenas no backend**. O mesmo vale para Stripe
(SUB) e Fiscal. O `ResultadoPorta<T>` (em `ports/comum.ts`) já padroniza a falha
esperada sem lançar, pro caso de uso ter sempre um fallback.

## Observabilidade (porta-irmã, fora de `ports/` por enquanto)

**Sentry** (erros/crashes Expo + Workers, com scrubbing de PII, `sendDefaultPii`
off) é Fase-1 junto com PostHog. Não virou porta em `ports/` ainda porque é
transversal (captura global), não um caso de uso chamado pela UI — quando entrar,
segue as mesmas regras de PII do `AnalyticsProvider`.

## O que NÃO entra (decidido contra a nossa realidade)

- **n8n como cérebro** — núcleo do negócio fica no código/banco do OLLI; n8n só
  integração externa opcional, e ainda exige análise da Sustainable Use License.
- **PowerSync agora** — nosso sync SQLite↔Supabase funciona; só PoC em branch
  isolada quando multi-técnico/conflitos doerem (pesquisa §5.2). Sem porta ainda.
- **Gotenberg / PDF no servidor** — PoC futura; hoje o PDF é gerado no app
  (`utils/pdfGenerator.ts`) e serve. Vira relevante com documento autoritativo/hash.
- **Meilisearch/Typesense** — Postgres (trigram/full-text) primeiro. Sem porta.
- **LiteLLM** — só se operarmos >1 provedor de IA em produção; a abstração
  própria (`AiProvider`) basta com um provedor.
- **Copiar schema/código de ERPNext/Odoo/Twenty/OCA** — AGPL/GPL: estudar
  entidades e estados, nunca copiar (pesquisa §12). São REFERÊNCIA, não dependência.
