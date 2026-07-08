# TECHNOLOGY RADAR — OLLI Orçamentos

> **O que este documento é.** A NOSSA decisão sobre cada ferramenta que a pesquisa
> (`PESQUISA_APROFUNDADA_FERRAMENTAS_OLLI_V2_PMOC.md`, §5 radar e §14 ordem de adoção)
> colocou na mesa. A pesquisa lista opções; aqui a gente **decide** o que serve pra
> stack real do OLLI e quando. Não é resumo da pesquisa — é compromisso.
>
> **Stack real de referência:** Expo SDK 56 / RN 0.85 / TS estrito, SQLite local
> offline-first, Supabase (`yiaeplqinnnnniyvwtls`) com Auth + Postgres + RLS multi-tenant
> (`donos_visiveis()` SECURITY DEFINER) + Storage, Cloudflare Workers (`worker/src/*.js`),
> tema escuro, PT-BR. Fonte da verdade empresarial = Supabase/Postgres; réplica
> operacional = SQLite no aparelho; estado de assinatura = Stripe.
>
> **Última atualização:** 2026-07-08.

---

## 0. O que JÁ está VIVO (não é candidato — é fundação)

Antes de qualquer radar, o que já roda em produção e **não se rediscute** sem ADR:

| Capacidade | Como já resolvemos | Arquivo/serviço | Implicação no radar |
| --- | --- | --- | --- |
| **Assinatura SaaS (nosso plano)** | Stripe Checkout mensal + anual + 12x + Empresa, webhook = fonte da verdade do plano | `worker/src/stripe.js`, `src/services/planos.ts`, `usePlano`, `GatePro` | Stripe assinatura = **VIVO**. Asaas NÃO substitui isso — Asaas é cobrança do prestador ao cliente-final dele, papel diferente. |
| **Sync SQLite ↔ Supabase** | Sync próprio, tombstones/`updated_at`, offline-first | `src/services/cloudSync.ts` | Funciona hoje. PowerSync fica **POC**, nunca troca automática. |
| **IA (assistente + voz)** | Worker chama Gemini; voz por Gemini (não precisa Speech API) | `src/services/olliIA.ts`, `olliAssistente.ts`, `vozNuvem.ts`, worker | 1 provider só → gateway (LiteLLM) e observabilidade paga (Langfuse) ainda NÃO se justificam. |
| **Instrumentação de eventos** | `track()` fire-and-forget grava evento local (`insertEvento`); funil já nomeado `quote_created`/`quote_sent`/`quote_approved`/`ai_used`/`gate_visto` | `src/services/analytics.ts` | PostHog **não parte do zero**: é um *sink* adicional pros eventos que já emitimos. |
| **CEP** | ViaCEP com timeout curto, nunca trava cadastro | `src/services/cep.ts` | Camada de endereço BR já resolvida; Google Address Validation é upgrade opcional, não base. |
| **Mapas (deep-link)** | Abre Google Maps externo pra rota; sem SDK embutido | `src/services/rotas.ts`, `EquipeAoVivoScreen` | Mapa embutido/MapLibre é **DEPOIS**; deep-link já cobre o essencial sem billing. |
| **Google Calendar** | `googleAgenda.ts` completo atrás de flag; falta só OAuth Android (B3) | `src/services/googleAgenda.ts` | Bloqueio é humano (B3), não de decisão técnica. |

---

## 1. Legenda das categorias (a nossa)

- **ADOTAR JÁ** — valor alto, risco baixo, cabe na stack sem POC. Entra no ciclo atual.
- **POC** — promissor mas precisa prova numa branch isolada com métrica antes de virar dependência.
- **DEPOIS** — bom, mas só quando escala/complexidade/uma onda específica justificar.
- **REFERÊNCIA** — estudar o modelo de domínio; **não** incorporar código nem o sistema.
- **REJEITAR** — custo, risco, licença ou sobreposição com o que já temos não compensam agora.

Uma ferramenta só passa de **POC → ADOTAR** ou de **DEPOIS → POC** com nota **≥ 75/100** na matriz da §4 **e** ADR registrada quando a §5 exigir.

---

## 2. O RADAR — nossa decisão por ferramenta

Colunas: **Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença**.
"Onda alvo" usa o roadmap reconciliado (Onda 1 monetização ✅, Onda 2 multi-tenant, Onda 3 ciclo comercial, … Onda 6 e-mail, Onda 9 financeiro, Onda 11 HVAC/PMOC, Onda 12 agenda+Google).

### 2.1 Observabilidade e produto

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **Sentry** | **ADOTAR JÁ** | Zero visibilidade de crash hoje. Já queimamos um APK (v6, `TextDecoder latin1` no Hermes) que só quebrava no aparelho — Sentry teria pego. Cobre Expo + Workers + web num lugar só, com release/build tracking. | `AnalyticsProvider` não cobre erro; adicionar `ErrorReporter` fino (`captureException`, `setUser(pseudo)`). Nada de tela chama Sentry direto. | **Onda 2/estabilização** (antes de escalar multi-tenant) | **DSN** (criar projeto Sentry) — grátis no self/dev tier | BSL 1.1 (SDK cliente é MIT/Apache) — uso como SaaS é livre |
| **PostHog** | **ADOTAR JÁ** | Já emitimos os eventos certos localmente (`analytics.ts`); falta o funil visível (signup→orçamento→enviado→aprovado→plano), feature flags e session replay mascarado. Flags substituem os nossos `EXPO_PUBLIC_*` booleanos por rollout controlado. | Estender `track()`: além do `insertEvento` local, `posthog.capture`. Interface `AnalyticsProvider` com 2 sinks (local + PostHog). **Nada de CPF/CNPJ/telefone/valor** em propriedade — só IDs pseudonimizados. | **Onda 2** (flags ajudam já no rollout de org) | **API key** PostHog (cloud grátis até volume) | MIT (client libs) / PostHog OSS |
| **Langfuse** | **DEPOIS** | Só faz sentido quando a IA virar recurso **pago** e a gente quiser medir custo/latência/qualidade por prompt. Hoje é 1 provider (Gemini) e IA é limitada (3/mês grátis). Prematuro. | `AiProvider` já existe conceitualmente no worker; plugar trace depois. Pseudonimizar cliente/equipamento antes de enviar. | Pós-Onda 5 (quando IA for diferencial cobrado) | Conta Langfuse (self-host ou cloud) | MIT (core) — features enterprise à parte |
| **LiteLLM** | **REJEITAR** (por ora) | Gateway multi-modelo só paga a pena com >1 provider em produção. Temos 1 (Gemini via worker). Uma abstração `AiProvider` própria no worker resolve fallback simples sem mais uma dependência. | Nossa própria porta no worker basta. Reavaliar se entrar 2º provider. | — | — | MIT |
| **Formbricks** | **DEPOIS** | NPS/pesquisa pós-serviço e motivo de abandono são ouro pra retenção, mas não antes do ciclo comercial e da operação de campo existirem. SDK RN existe. | `SurveyProvider` fino; disparo por evento (`quote_approved`, OS concluída). | Pós-Onda 8/CRM | Conta Formbricks (self-host possível) | AGPL-3.0 (core) — **rodar como serviço externo**, não embutir código no app |

### 2.2 Plataforma / backend assíncrono

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **Cloudflare Queues** | **ADOTAR JÁ** | Já vivemos no Cloudflare Workers. Envio de e-mail, processamento de webhook (Stripe/Asaas), geração de PDF e follow-up **não podem** ficar no caminho do clique. Padrão outbox→fila→consumidor idempotente é a espinha do ciclo comercial (Onda 3) e do e-mail (Onda 6). | Já é nossa infra (Workers). Criar `enqueue()` + tabela `outbox` no Postgres; consumidores idempotentes por tipo de job. | **Onda 3** (webhook de pagamento) e **Onda 6** (e-mail) | Nenhum (plano Workers já pago) — Queues exige Workers **Paid** ($5/mês), já dentro do nosso Cloudflare | Proprietário Cloudflare (serviço) |
| **Cloudflare Workflows** | **POC → ADOTAR** | Orquestração durável de "orçamento aprovado → congelar versão → aguardar entrada → criar OS → notificar" é exatamente o fluxo da Onda 3/4. Poderoso, mas queremos provar que a durabilidade + espera humana casa com nosso modelo antes de depender. | Mesma infra Workers. Um workflow por processo de negócio; passos idempotentes lendo da fonte da verdade (Postgres). | **Onda 3** POC, **Onda 4** produção (OS) | Nenhum além do Workers Paid | Proprietário Cloudflare |
| **n8n** | **DEPOIS** (só integração externa) | Útil pra automações administrativas e conectores externos (Sheets/Drive/CRM externo) — **nunca** pro núcleo. Regra dura: cálculo de orçamento, status, autorização, RLS, conciliação e qualquer coisa offline ficam no **nosso** código/banco. | Fica **fora** do produto: consome nossos webhooks/API. Não é adapter interno. | Pós-Onda 9 | Instância n8n (self-host) | **Sustainable Use License** — restringe uso comercial/revenda. **Exige revisão jurídica antes de embutir/oferecer ao cliente.** Uso interno como orquestrador externo é o caminho seguro. |

### 2.3 Sync e documentos

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **PowerSync** | **POC** | Nosso sync (`cloudSync.ts`) funciona hoje e é fonte da verdade da nossa competência offline (é diferencial de marca). PowerSync brilha com muitos técnicos/conflitos/tombstones em escala — mas troca de motor de sync é decisão irreversível de alto risco. **Só com branch isolada, 2 dispositivos, conflito, exclusão, anexo, perda de rede e app fechado no upload, medindo custo e lock-in.** | Nosso código já isola persistência; a comparação é motor-vs-motor. Não migrar sem ADR (ADR-0001) que **prove** ganho. | Reavaliar na Onda de operação de campo (pós-Onda 4) | Conta PowerSync (self-host ou cloud) pro teste | Apache-2.0 (client SDK) — serviço tem tier pago |
| **Gotenberg** | **POC** | PDF hoje é gerado no aparelho (frágil no Hermes — já mordeu). Um PDF **autoritativo, imutável, com hash**, gerado no servidor a partir de HTML versionado, é o certo pra documento enviado/auditado (orçamento congelado, recibo, futuro PMOC). Mas é **serviço Docker separado** — não cabe dentro de Worker. | `DocumentRenderer` (porta): `renderPdf(htmlVersionado) → {pdf, hash}`. Fila (Queues) chama Gotenberg fora do Worker. Local (mobile) continua como preview/fallback. | **Onda 7 (PDF v2)** como POC; produção quando houver host Docker | **Host Docker** (VPS/Fly/Render) — decisão de infra do dono | Apache-2.0 |
| **Documenso** | **DEPOIS** | Assinatura com trilha jurídica (contratos, PMOC, termo de responsabilidade técnica) é real pro HVAC/PMOC. Mas o "aprovar orçamento" da Onda 3 **não precisa** disso — nosso portal já registra visualizado/aprovado com IP e trilha própria. Overkill agora. | `SignatureProvider`: `requestSignature`, webhook de conclusão. Só entra quando existir contrato/PMOC formal. | **Onda 11 (HVAC/PMOC)** / contratos | Instância Documenso (self-host) + certificado | GPL-3.0 (+ arquivos enterprise) — **serviço externo via API**, não copiar código pro nosso repo |

### 2.4 Notificações e e-mail

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **React Email** | **ADOTAR JÁ** | A Onda 6 é e-mail transacional (orçamento, recibo, boas-vindas, convite de equipe). Templates versionados, com preview local e identidade OLLI, evitam HTML de e-mail feito na mão. Gera só o HTML — o envio é do provider (Resend). | Componentes em `packages`/`emails/`; a porta `EmailProvider.send(html)` desacopla do Resend. | **Onda 6** | Nenhum (é lib de build) | MIT |
| **Resend** *(provider de envio — decisão nossa, não estava no radar cru)* | **ADOTAR JÁ** | Já é a decisão registrada (B2): subdomínio `mail.olliorcamentos.online`, DNS/DKIM via MCP Hostinger. É o *provider* que entrega o HTML do React Email. | `EmailProvider` (porta) → adapter Resend no worker `/email`; segredo **só** no backend. Fallback `mailto:` offline já previsto. | **Onda 6** | **API key Resend** (B2, ~5 min do dono) | Serviço (SaaS) |
| **Novu** | **DEPOIS** | Central de notificação multicanal (in-app inbox + e-mail + push + preferências + digest) é bom quando os canais crescerem. Hoje precisamos de push (nome do owner, Onda 2) e e-mail (Onda 6) — construímos a **porta própria** primeiro e só comparamos Novu depois. | Definir `NotificationProvider { send(cmd): Promise<DeliveryResult> }` **nosso** primeiro. Novu vira 1 adapter possível, não o padrão. | Pós-Onda 6 | Instância Novu (self-host) | MIT (community) — features à parte |

### 2.5 Pagamentos e fiscal (Brasil)

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **Asaas** | **DEPOIS** | Cobrança do **prestador ao cliente-final dele** (PIX/boleto/cartão/recorrência/link) — papel que Stripe (nossa assinatura SaaS) **não** ocupa. Real e brasileiro, mas só depois de OS + financeiro operacional existirem (senão não há o que cobrar). | `PaymentProvider` (porta, separado de `SubscriptionProvider`=Stripe): sandbox, idempotência, fila pro webhook, conciliação, estorno/chargeback, status intermediários, **segredo só no backend**. | **Onda 9 (financeiro)** | Conta Asaas + credenciais sandbox→prod | Serviço (SaaS) |
| **Nuvem Fiscal** | **DEPOIS** | NFS-e/NF-e por município via provider especializado. Emissão fiscal **depois** de financeiro e status sólidos — emitir nota sobre dado instável é problema, não feature. | `FiscalProvider { issueServiceInvoice, cancelDocument, getStatus }` — **não** espalhar chamadas pela tela. Rollout por município, ambiente de homologação. | Pós-Onda 9 | Conta Nuvem Fiscal + **certificado digital** do prestador | Serviço (SaaS) |

### 2.6 Mapas e roteamento

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **MapLibre + OSRM/GraphHopper** | **DEPOIS** | Mapa próprio e roteamento reduzem dependência do Google, mas "OSM grátis" **não** é infra sem custo (tiles/geocoding/rota exigem servidor ou provider). Hoje deep-link Google resolve; billing do Google (B4) é opcional. Só quando houver despacho com muitas equipes. | `MapsProvider` + `RoutingProvider` (portas). Google como provider inicial de qualidade de endereço; MapLibre pra visualização; OSRM/GraphHopper como opção futura. | **Onda 12 (agenda avançada)** | Servidor de tiles/roteamento (self-host) OU billing Google (B4) | MapLibre BSD-3 · OSRM BSD-2 · GraphHopper Apache-2.0 (core) |

### 2.7 Busca e suporte

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **Meilisearch / Typesense** | **REJEITAR** (por ora) | Antes de subir um serviço de busca, Postgres com `pg_trgm` + full-text tem que ser testado — provavelmente já resolve clientes/equipamentos/OS no nosso volume. Adotar sem esse teste é complexidade gratuita. | Se um dia entrar: `SearchProvider`. Antes, índice trigram no Supabase. | Sem onda até Postgres provar insuficiente | Instância de busca (self-host) | Meilisearch MIT · Typesense GPL-3.0 |
| **Chatwoot** | **DEPOIS** | Caixa de suporte pro **próprio OLLI** primeiro (não contact-center embutido no cliente). Hoje suporte é WhatsApp deep-link em toda superfície de erro — suficiente no estágio atual. | Externo ao produto; integrar canais depois. | Pós-Onda 10 | Instância Chatwoot (self-host) | MIT (community) — enterprise à parte |

### 2.8 Referências de domínio (estudar, NÃO incorporar)

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **OCA Field Service** | **REFERÊNCIA** | Melhor modelo aberto de field service: territórios, ordens, equipamentos, contratos, portal, recorrência. Estudar **entidades, estados, permissões e fluxos** e montar matriz de equivalência pro nosso schema (Ondas 4/11). **Não** copiar código nem misturar banco Odoo com Supabase. | — (não incorporar) | Estudo p/ Ondas 4 e 11 | — | **AGPL-3.0** (+ por módulo) — copiar código contaminaria o produto |
| **ERPNext** | **REFERÊNCIA** | Referência de nomenclatura/estrutura de financeiro, estoque, compras, centros de custo (Ondas 9+). Estudar, não virar camada visual de ERPNext. | — (não incorporar) | Estudo p/ Onda 9+ | — | **GPL-3.0** |
| **Twenty CRM** | **REFERÊNCIA** | Referência do conceito de **metadados configuráveis / custom fields / views** — vale pro catálogo por segmento e pacotes de operação. Estudar o modelo, não o código. | — (não incorporar) | Estudo p/ CRM (Onda 8) e catálogo | — | **AGPL-3.0** (+ arquivos comerciais) |

### 2.9 Ecossistema Google

| Ferramenta | Categoria | Por que pra nós | Adapter/port | Onda alvo | Bloqueio humano | Licença |
| --- | --- | --- | --- | --- | --- | --- |
| **Google Identity (login)** | **ADOTAR JÁ** | Login social reduz atrito no signup. Web já funciona; falta o client Android. | Já atrás de `EXPO_PUBLIC_GOOGLE_OAUTH_ANDROID_CLIENT_ID`. | Onda 2/APK final | **B3** OAuth client Android (SHA-1 do keystore) | Serviço Google |
| **Google Calendar** | **ADOTAR JÁ** | Sync de agenda é esperado por quem já vive no Google Agenda. `googleAgenda.ts` está completo atrás de flag. | `CalendarProvider` (porta) já isolada. | **Onda 12** | **B3** (mesmo OAuth Android) | Serviço Google |
| **FCM (push)** | **ADOTAR JÁ** | Push é requisito da Onda 2 (técnico recebe em nome do owner) e das automações da Onda 12. | `NotificationProvider` → adapter FCM. | Onda 2 (push) | Config FCM no projeto Firebase | Serviço Google |
| **Places / Geocoding / Address Validation / Routes** | **POC** | Melhoram qualidade de endereço acima do ViaCEP e habilitam rota real. Úteis, mas **exigem billing** e restrição de chave/quota/alerta de gasto antes de ligar. | `MapsProvider`/`RoutingProvider`; cache agressivo; fallback ViaCEP. | **Onda 12** | **B4** billing Google Cloud + restrição de chave | Serviço Google |
| **Google Maps SDK embutido** | **DEPOIS** | Mapa dentro do app é bom pra "ver equipe ao vivo", mas deep-link já entrega o essencial sem billing. Ligar só quando despacho justificar. | `MapsProvider`. | Onda 12 | **B4** billing Google | Serviço Google |
| **Vision / Document AI** | **DEPOIS** | OCR de etiqueta/placa/nota (número de série de equipamento, nota fiscal) casa com HVAC/PMOC. Não antes. | `OcrProvider` (porta). | Pós-Onda 11 | Billing Google + quota | Serviço Google |
| **Drive / Sheets / Docs / Business Profile** | **DEPOIS** (condicional) | Exportação e anexos autorizados; Sheets **só exporta**, nunca é banco. Só com caso de uso + consentimento. | `StorageProvider`/export adapters. | Sob demanda | OAuth + consentimento do usuário | Serviço Google |

---

## 3. Onde cada uma entra na ordem de adoção (visão condensada)

Mapeando o radar sobre o roadmap reconciliado + §14 da pesquisa:

| Onda | Ferramentas que entram |
| --- | --- |
| **Onda 2 — multi-tenant / estabilização** | **Sentry** (ADOTAR), **PostHog** + feature flags (ADOTAR), **FCM** push, base de **outbox** |
| **Onda 3 — ciclo comercial** | **Cloudflare Queues** (ADOTAR — webhook pagamento), **Cloudflare Workflows** (POC) |
| **Onda 4 — OS mínima** | Workflows em produção; POC de **PowerSync** aberta em paralelo |
| **Onda 6 — e-mail** | **React Email** (ADOTAR) + **Resend** (ADOTAR, dep. B2), Queues no envio |
| **Onda 7 — PDF v2** | **Gotenberg** (POC, dep. host Docker) |
| **Onda 8 — CRM** | Estudo **Twenty CRM** (referência); **Formbricks** entra depois |
| **Onda 9 — financeiro** | **Asaas** (dep. conta); estudo **ERPNext** (referência) |
| **Onda 11 — HVAC/PMOC** | **Documenso** (contratos/RT), **Nuvem Fiscal** (dep. certificado), estudo **OCA Field Service** |
| **Onda 12 — agenda + Google** | **Google Calendar** (dep. B3), **Places/Routes/Maps** (POC, dep. B4), **MapLibre/OSRM** (DEPOIS) |
| **Sem onda / rejeitadas por ora** | **LiteLLM**, **Meilisearch/Typesense**, **Novu** (porta própria primeiro), **Langfuse** (IA paga), **n8n** (só integração externa), **Chatwoot** (pós-suporte) |

---

## 4. Matriz de avaliação (gate: ≥ 75/100)

Toda ferramenta que sair de POC/DEPOIS pra dentro do produto **preenche esta matriz** e só passa com ≥ 75. Pesos da §11 da pesquisa, adotados como nossos:

| Critério | Peso |
| --- | ---: |
| Valor para o usuário | 25 |
| Compatibilidade com a stack (Expo/RN/TS/Supabase/Cloudflare) | 15 |
| Segurança e LGPD | 15 |
| Manutenção | 10 |
| Offline (não pode degradar nosso diferencial) | 10 |
| Custo total | 10 |
| Licença | 10 |
| Lock-in | 5 |
| **Total** | **100** |

### 15 perguntas obrigatórias antes de instalar

1. Qual problema real resolve? 2. Já existe solução no projeto? (ver §0) 3. É núcleo ou integração?
4. Opera atrás de adaptador? 5. O que acontece se sair do ar? 6. E se o preço subir?
7. Há exportação dos dados? 8. A licença permite o uso? 9. Há SDK compatível com Expo/RN?
10. Há webhook? 11. Há idempotência? 12. Há sandbox? 13. Há logs? 14. Há limite/quota?
15. Quais dados pessoais recebe? (regra: **nunca** CPF/CNPJ/telefone/endereço/valor de orçamento em analytics, IA ou label.)

### Notas de partida (nossa avaliação inicial — refinar na ADR)

| Ferramenta | Nota estimada | Veredito |
| --- | ---: | --- |
| Sentry | 88 | Passa — ADOTAR |
| PostHog | 85 | Passa — ADOTAR |
| Cloudflare Queues | 90 | Passa — ADOTAR (infra já nossa) |
| React Email | 86 | Passa — ADOTAR |
| Resend | 84 | Passa — ADOTAR (dep. B2) |
| Cloudflare Workflows | 82 | Passa — POC→ADOTAR |
| Gotenberg | 78 | Passa condicional — POC (host Docker) |
| PowerSync | ~70 (a medir) | **Não migrar sem POC provar >75** |
| Asaas | 80 | Passa — mas só na Onda 9 |
| Documenso | 76 | Passa — Onda 11 |
| n8n | 62 | Reprova como núcleo — só integração externa |
| LiteLLM | 55 | Reprova — 1 provider só |
| Meilisearch/Typesense | 58 | Reprova — testar Postgres antes |

---

## 5. ADRs obrigatórias (criar em `docs/ADRS/`)

Decisões grandes exigem ADR no modelo Contexto / Problema / Opções / Critérios / Evidências / Decisão / Consequências / Rollback / Data de revisão. Prioridade:

| ADR | Decisão | Gatilho |
| --- | --- | --- |
| **ADR-0001** | Sync próprio (`cloudSync.ts`) **vs** PowerSync | Antes de qualquer migração de sync — precisa da POC medida |
| **ADR-0002** | Cloudflare Queues + outbox como padrão assíncrono | Onda 3 (primeiro webhook de pagamento) |
| **ADR-0003** | Cloudflare Workflows para processos de negócio duráveis | Onda 3/4 |
| **ADR-0004** | Sentry como observabilidade de erro + política de scrubbing PII | Onda 2 (antes de escalar) |
| **ADR-0005** | PostHog como sink de analytics/flags + regras de privacidade | Onda 2 |
| **ADR-0006** | React Email + Resend como pipeline de e-mail transacional | Onda 6 |
| **ADR-0007** | PDF autoritativo: local (aparelho) **vs** Gotenberg (servidor) | Onda 7 |
| **ADR-0008** | Stripe (assinatura SaaS) **vs** Asaas (cobrança do cliente-final) — fronteira de papéis | Onda 9 |
| **ADR-0009** | `NotificationProvider` próprio **vs** Novu | Antes de multicanal (pós-Onda 6) |
| **ADR-0010** | Google Maps **vs** MapLibre/OSRM + política de billing/quota | Onda 12 |
| **ADR-0011** | Provider fiscal (Nuvem Fiscal) atrás de `FiscalProvider` + rollout por município | Pós-Onda 9 |
| **ADR-0012** | Assinatura interna (trilha do portal) **vs** Documenso para documento juridicamente relevante | Onda 11 |
| **ADR-0013** | Gateway de IA: abstração própria **vs** LiteLLM (revisitar se entrar 2º provider) | Quando surgir 2º provider de IA |
| **ADR-0014** | n8n apenas como orquestrador externo — revisão da Sustainable Use License | Antes de subir n8n |

---

## 6. Regras que o radar não abre mão

- **Toda integração externa fica atrás de uma porta** (`PaymentProvider`, `SubscriptionProvider`, `FiscalProvider`, `EmailProvider`, `NotificationProvider`, `MapsProvider`, `RoutingProvider`, `CalendarProvider`, `StorageProvider`, `SignatureProvider`, `AiProvider`, `AnalyticsProvider`, `DocumentRenderer`, `OcrProvider`, `SearchProvider`). Nenhuma tela chama API externa direto: `UI → caso de uso → porta → adapter → API`.
- **Uma fonte da verdade por domínio.** Supabase/Postgres = empresa; SQLite = réplica local; Stripe = assinatura; Asaas = cobrança do cliente-final; provider fiscal = emissão; objeto versionado+hash = documento enviado. Nunca duas concorrentes.
- **Offline é diferencial, não contingência** — nenhuma adoção pode degradar o funcionamento offline (peso 10 dedicado na matriz).
- **Segredo nunca no cliente.** Stripe, Resend, Asaas, Nuvem Fiscal, chaves Google: só no worker/backend.
- **LGPD por padrão:** sem CPF/CNPJ/telefone/endereço/valor em analytics, IA ou etiqueta; IDs pseudonimizados; scrubbing no Sentry; consentimento onde aplicável.
- **AGPL/GPL = estudar, não copiar.** OCA Field Service, ERPNext, Twenty CRM, Documenso, Formbricks: usados como referência de domínio ou serviço externo via API — código não entra no nosso repo.
- **Nada de "em breve".** Ferramenta em POC/DEPOIS não vira botão morto na UI; ou está viva atrás de porta, ou não aparece.
