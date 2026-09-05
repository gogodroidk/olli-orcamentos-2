# KNOWN_BLOCKERS — bloqueios que dependem de gente, não de código

> Regra do mestre §45: mesmo bloqueado, TODA a parte independente é implementada.
> Reauditado no código em 2026-09-01. Estados de dashboard, credenciais, deploy e banco
> descritos com datas anteriores são **evidência histórica**, não confirmação atual;
> precisam ser revalidados no ambiente correspondente antes de release.

| # | Bloqueio | Causa | Parte independente JÁ FEITA | O que o dono faz | Desbloqueia |
| --- | --- | --- | --- | --- | --- |
| B1 | Fonte única de assinatura SaaS + lifecycle sandbox | Documentos e código citam Stripe e Mercado Pago em responsabilidades concorrentes; nenhum contrato local pode decidir qual será a fonte autoritativa da release | Eventos/trial, reconciliação de entitlement, fixture A/B e journal estão locais e verdes; pagamento/cache isolado não concede plano | Aprovar uma ADR com um único provider/fonte de plano, autorizar credenciais sandbox e executar checkout, webhook assinado, replay, cancelamento, downgrade e renovação sem cobrança real | Experimento Pro mensurável e entitlement confiável; ainda não autoriza produção |
| B2 | Identidade de e-mail + hook/persistência | Falta domínio/remetente verificado, secret oficial do provider, persistência transacional e canário autorizado | Welcome, outbox/retry, supressão/consentimento e composição antes da reserva estão cobertos localmente; nenhum envio real ocorreu | Configurar provider por fluxo oficial, aprovar schema/migration e hook, validar SPF/DKIM/DMARC e autorizar uma caixa/canário de teste | Boas-vindas e notificações transacionais reais sem duplicação |
| B3a | Login Google no Android | Exige configuração oficial vinculada ao pacote/assinatura e integração nativa suportada, seguida de teste no app assinado | Login Google web permanece separado; a configuração pública é fail-closed quando ausente | Definir a integração nativa, criar/configurar o cliente correto com o SHA-1 de release e testar consentimento, login, logout e revogação no APK | Login Google nativo |
| B3b | Google Agenda no Android | O scaffold antigo usa redirect por esquema customizado. A documentação atual do Google não permite tratar esse caminho antigo como pronto no Android; **um client ID sozinho não desbloqueia a Agenda** | `googleAgenda.ts` foi mantido como referência, mas a capacidade nativa está explicitamente desabilitada. Exportação `.ics`/link Google é independente | Aprovar uma arquitetura OAuth nativa suportada, configurar os consentimentos/scopes mínimos e provar em app assinado; referência: [OAuth 2.0 para apps instalados](https://developers.google.com/identity/protocols/oauth2/native-app) | Sincronização Google Agenda nativa |
| B4 | ~~Billing Google Cloud~~ RESOLVIDO 2026-07-10 — falta só o mapa `<MapView>` embutido no app | Billing está LIGADO no projeto `olli-orcamentos` desde 2026-07-10; chave restrita a Routes API + Geocoding API (confirmado ao vivo). O que falta pro mapa visual não é mais billing, é código: `react-native-maps` (exige o prebuild único do gate) + key client-side `EXPO_PUBLIC_MAPS_KEY` (ainda vazia — ver `.env.example`) | Com billing ligado: worker `POST /eta` (Routes API, `computeRoutes` TRAFFIC_AWARE) + `POST /geocodificar` (Geocoding API) em produção — ETA com trânsito ponta-a-ponta funcionando (chip "AO VIVO · PRÓXIMA PARADA" na HomeScreen, coord OU endereço; commits `0e6759d`/`da3635a`). Chave `OLLI_ROUTES_API_KEY` só no worker, nunca no app. Deep-link pro Google Maps (`rotas.ts`, `EquipeAoVivoScreen` "Ver no mapa") continua funcionando sem key nem billing, pra quem não tem o mapa embutido. Voz já é Gemini (não precisa Speech) | Nada pro ETA — já está no ar. Só decidir SE/QUANDO vale a pena o `<MapView>` embutido (prebuild + `EXPO_PUBLIC_MAPS_KEY`) | ETA em texto: JÁ DESBLOQUEADO. Só falta o mapa visual embutido da equipe no APK final |
| B5 | ~~Cloudflare: Workers Build do olli-diagnostico~~ | ✅ **RESOLVIDO — ENCERRADO. NÃO REABRIR.** O dono desconectou o build por Git do `olli-diagnostico` no dashboard e confirmou de novo em **2026-07-16**. Push na main **não apaga mais** secrets nem bindings. **Evidência independente:** o merge do PR #30 não derrubou o worker; o PR #35 foi mergeado na main em 14/07 e, em 16/07, `diagnostico.olliorcamentos.online` responde **200** com o gate de JWT correto (`nao_autorizado`) — worker vivo, código real, secrets intactos. **Este item gerou re-alarme falso em várias sessões porque o índice da memória continuou dizendo "passo humano pendente" enquanto o arquivo de detalhe já dizia FECHADO desde 13/07 — índice corrigido em 16/07.** | Deploys do worker seguem **manuais** (`cd worker && npx wrangler deploy`) — essa é a única regra que sobra. `reparar.mjs` fica como rede de segurança histórica | **Nada.** Só não reconectar o worker a build automático por Git | — |
| B6 | APK único final | Regra do dono: SÓ 1 APK, quando o ciclo comercial estiver perfeito e testado | Tudo que exige prebuild (expo-location/task-manager, login nativo) está escrito atrás de flag/import dinâmico | Aprovar o momento do build + roteiro de teste | Onda final |
| B7 | Sentry DSN (crash/erro em produção) | **RESOLVIDO no código (2026-07-16) — falta só MERGEAR.** Org `olli-p7` criada (plano Developer, grátis, sem cartão). 4 projetos + DSNs: `olli-app` (react-native), `olli-painel` (javascript-react), `olli-landing` (javascript-astro), `olli-worker` (node-cloudflare-workers). Token no cofre (`SENTRY_AUTH_TOKEN`/`SENTRY_ORG`) | Fiado nos 4 fronts. **Erro real comprovadamente chegando em 3** (app `issues/7615527771`, painel `issues/7615578493`, landing `issues/7615583226`) — não só configurado. `sendDefaultPii: false` nos 4 (LGPD); worker com `httpBodies: []` (webhook = HMAC + dado pessoal). `errorReport.ts` mantido: encadeia o `ErrorUtils`, os dois recebem o erro. **Achados no caminho:** a CSP de landing e painel bloqueava o envio (Sentry ficaria MUDO); o SDK vazava `.map` público na landing; e o build do painel estava quebrado (tela branca — ver PR #36) | 1) Mergear **PR #36** (app+landing+painel) → exige confirmar Workers Build OFF antes de qualquer push na main; 2) Mergear **PR #37** (worker) e deployar à mão — muda o runtime (`nodejs_compat`); 3) Rodar a trilha do APK pra provar crash nativo | Onda 2.5: crash/erro visível em Expo + Workers + web com release tracking |
| B8 | PostHog API key (funil + feature flags) | Não existe projeto PostHog; eventos já são gravados localmente (`analytics.ts`) mas ninguém vê o funil | Decisão tomada (radar: ADOTAR, nota 85, ADR-0005); `track()` já emite os eventos certos (`quote_created`/`quote_sent`/`quote_approved`/`ai_used`/`gate_visto`); vira 2º sink sem mudar call sites; regra LGPD definida (só IDs pseudonimizados) | Criar projeto no PostHog Cloud (grátis até volume), copiar a API key, salvar no cofre (~5 min) | Onda 2.5: funil signup→orçamento→aprovado→plano + feature flags com rollout por org |
| B9 | Host Docker para Gotenberg (PDF servidor) | Gotenberg é serviço Docker separado — não roda dentro de Cloudflare Worker; precisa de um host (VPS/Fly/Render) | Decisão tomada (radar: POC nota 78, ADR-0007); porta `DocumentRenderer` especificada: `renderPdf(htmlVersionado) → {pdf, hash}` via fila; PDF local (`pdfGenerator.ts`) continua como preview/fallback — nada quebra sem o host | Decidir e provisionar o host Docker (Fly.io/Render/VPS, ~US$5/mês) OU adiar — a POC roda em Docker local sem custo | Onda 7: PDF autoritativo com hash em produção (orçamento congelado, recibo, futuro PMOC) |
| B10 | Conta Asaas + sandbox (cobrança do cliente-final) | Cobrança PIX/boleto/cartão do prestador ao cliente dele exige conta Asaas com credenciais sandbox→prod; papel DIFERENTE do Stripe (que é a nossa assinatura SaaS) | Porta `PaymentProvider` já declarada em `src/services/ports/`; regras firmadas (ADR-0008): segredo só no worker, webhook persistido antes de processar via Queues, idempotência, conciliação, estorno; registro manual de pagamento já funciona como fallback permanente | Criar conta Asaas, gerar credenciais de SANDBOX primeiro, salvar no cofre; prod só após conciliação provada | Onda 9b (PÓS-financeiro): cobrança online org a org atrás de flag |
| B11 | Nuvem Fiscal + certificado digital (NFS-e/NF-e) | Emissão fiscal exige conta na Nuvem Fiscal, certificado digital do prestador e credenciamento municipal; e é PROIBIDO emitir nota antes de financeiro + status sólidos | Porta `FiscalProvider` já declarada (`issueServiceInvoice`/`cancelDocument`/`getStatus`); estratégia definida (ADR-0011): rollout por município, homologação primeiro, certificado só no backend; recibo comercial atual segue valendo sem nota | 1) criar conta Nuvem Fiscal; 2) providenciar certificado digital (e-CNPJ); 3) credenciamento no município piloto — SEM PRESSA, é pós-onda-9b | Onda fiscal (pós-9b): NFS-e do serviço emitida, consultada e cancelada pelo OLLI |

| B12 | MFA/aal2 no super-admin | O painel `/admin` do worker (acesso a TODOS os tenants) está atrás de 1 fator só (e-mail+senha). O fallback hardcoded de `ADMIN_EMAIL` já foi removido (`7da4a94`), mas falta o segundo fator | `requireAdmin` já isola por e-mail; a checagem de `aal2` é poucas linhas (enxame) uma vez o TOTP existir | Cadastrar TOTP na conta `ADMIN_EMAIL` no Supabase Auth (~10 min) | `/admin` protegido por MFA |
| B13 | Baseline das tabelas legadas | O schema inicial das tabelas pré-multi-tenant não está integralmente versionado; as migrations atuais, sozinhas, não provam reconstrução do zero | Migrations incrementais estão no repo e têm guards; isso não substitui um baseline testado em banco vazio | Em sessão autorizada e somente leitura: exportar schema sem dados/segredos, transformar em baseline idempotente e validar reconstrução em projeto de teste | Schema reproduzível do repo |
| B14 | Índice único de número por empresa | Pode haver números históricos duplicados; aplicar o índice sem auditoria poderia falhar ou escolher silenciosamente o registro errado | App e web já tratam colisão `23505`, renumeram com trilha (`numeroAnterior`, `renumeradoEm`) e alinham contador. Migration `20260727_numero_unico_por_tenant.sql.pendente` continua fechada | Em janela controlada: consultar duplicatas, definir regra de correção/rollback, corrigir com relatório e só então aplicar/testar o índice | Garantia de unicidade também no banco |

## Gates transversais atuais — reconciliação 2026-09-01

Os contratos locais concluídos não removem estes gates humanos:

1. **E-mail:** identidade do remetente, hook/persistência e canário controlado
   (`B2`).
2. **Notificações:** storage/migration da inbox e registry, permissão contextual,
   token real, VAPID/service worker e aceite em aparelho/navegador.
3. **Admin/dados:** finalidade, base legal, papéis/campos, retenção, AAL2 e coorte
   autorizada antes de consultar ou exportar dados reais.
4. **Monetização:** fonte única (`B1`), lifecycle completo em sandbox e decisão
   humana de preço/cancelamento/copy antes de qualquer CTA live.
5. **PWA/APK:** build assinado, hash, instalação, atualização, rollback e canal de
   distribuição aprovados (`B6`).

A fonte machine-readable é `docs/PILOTO/TRANSVERSAL_READINESS.json`; ela mantém
`acceptedReal=false` para todas essas frentes.

## Bloqueios de DECISÃO (não de código nem de acesso) — re-auditoria 2026-07-12

- **Paywall do plano Empresa (R$ 99/mês) não existe.** Convites e telas de Equipe/EquipeAoVivo funcionam de
  graça em qualquer plano — os entitlements `equipe`/`mapa_equipe` estão definidos mas nunca aplicados (nem
  worker nem client). É dinheiro na mesa. **Decisão do dono:** aplicar o gate agora? Se sim, o enxame fecha
  `handleConvite` (checa plano no worker) + `GatePro` nas rotas de equipe. Ver memória `olli-paywall-empresa-ausente`.
- **Técnico pode editar/excluir clientes?** Hoje a RLS é owner-only para UPDATE/DELETE de `clientes`, mas a UI
  não tem gate → falha em silêncio ("erro vira vazio"). Decidir: bloquear a UI com aviso, ou abrir a RLS.
- **Equipe vê a resposta do cliente no link público?** `orcamentos_publicos` é owner-only por decisão documentada.

## Sequência recomendada para o dono

1. **Decidir B1:** uma única fonte de assinatura/entitlement para a release e
   autorizar somente o lifecycle sandbox.
2. **Desbloquear B2:** identidade de e-mail e, separadamente, aprovar o
   hook/migration; começar por um canário em caixa de teste.
3. **Escolher o roteiro de notificações:** persistência local aprovada primeiro,
   depois permissão/token/VAPID e aceite em aparelhos/navegadores selecionados.
4. **Definir admin/dados:** finalidade, base legal, campos, retenção e coorte;
   sem isso, os contratos de política/auditoria não viram acesso live.
5. **Aprovar B6 apenas no fim do ciclo comercial:** um APK assinado, com hash e
   roteiro de instalação/atualização/rollback.
6. **B3a/B3b Google Android** pode esperar a trilha do APK final; exige
   arquitetura OAuth suportada e prova no app assinado.
7. **B8 observabilidade de funil:** escolher sink e consentimento depois que os
   eventos locais estiverem aprovados; não é fonte de entitlement.
8. **B9/B10/B11** continuam ondas posteriores; sandbox/homologação primeiro e
   nenhum efeito financeiro/fiscal real sem autorização específica.
9. **B14 numeração única:** tratar numa janela de banco isolada, com relatório de
   duplicatas e rollback; não misturar com build ou monetização.
