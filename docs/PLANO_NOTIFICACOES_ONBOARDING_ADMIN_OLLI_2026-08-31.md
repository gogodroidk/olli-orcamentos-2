# OLLI Orçamentos — plano de onboarding, notificações e dados governados

Atualizado em: **2026-09-01**  
Escopo desta versão: contratos e implementação local/sandbox; **nenhum envio
real, migration aplicada, build/publicação ou acesso a dado real**.

## 1. Decisões de produto

- O nome público único é **OLLI Orçamentos**; nenhuma variante de marca deve
  aparecer em copy, código, e-mail, anúncio ou arquivo de identidade.
- O primeiro e-mail é transacional: boas-vindas depois da confirmação do
  endereço, sem transformar cadastro em campanha de marketing.
- Conteúdo educativo e reengajamento exigem preferência separada, descadastro,
  horário silencioso e limite de frequência.
- Notificações locais existentes continuam funcionando offline; push remoto,
  PWA e APK são camadas posteriores e independentes.
- Dados administrativos e treinamento de IA usam acesso por finalidade,
  tenant, papel e campo. Não existe “acesso livre” a dados crus por padrão.

## 2. Estado atual confirmado

### Cadastro e onboarding

- Cadastro por e-mail/senha e confirmação Supabase já existem no mobile e na
  web (`src/services/supabase.ts` e
  `webapp/src/pages/sys/login/register-form.tsx`).
- O onboarding móvel já coleta negócio, prestador, endereço, logo, assinatura
  e primeiro serviço em `src/screens/OnboardingScreen.tsx`.
- Na abertura deste plano, o welcome não era disparado após a confirmação;
  confirmação de e-mail e boas-vindas continuam eventos diferentes. O caminho
  local confirmação → evento → decisão → outbox → render agora está coberto por
  contratos, mas o hook e a persistência reais seguem bloqueados aos gates.

### E-mail

- O contrato de provider prevê `boas_vindas` em
  `src/services/ports/EmailProvider.ts`.
- O Worker possui transporte Resend best-effort em `worker/src/email.js`,
  desligado quando `RESEND_API_KEY` não está configurada.
- A primeira fatia implementada nesta data adiciona:
  - `enviarBoasVindas` com texto alternativo e identidade OLLI Orçamentos;
  - escape de nome, URL e HTML;
  - remoção de CRLF de assuntos;
  - `Idempotency-Key` opcional/normalizada;
  - idempotência também no convite de equipe;
  - teste local sem chamada de rede em `worker/scripts/teste-email.js`.
- A segunda fatia adiciona `worker/src/welcomeEvent.js`: confirmação e contexto
  viram um pedido `email.welcome.requested` versionado, com finalidade,
  template, destinatário normalizado e chave determinística por usuário. O
  tenant vem exclusivamente do contexto confiável; retry enviado ou pendente
  não abre outro pedido. O contrato é puro e não grava nem envia.
- A terceira fatia adiciona `worker/src/emailOutbox.js`: máquina de estados
  `pending → sending → sent|failed → dead_letter`, cinco tentativas máximas,
  backoff determinístico e erro categorizado sem corpo do provider. O item não
  guarda HTML, texto, resposta ou segredo; a persistência e o vínculo
  transacional com o evento ainda são futuros. Nenhum e-mail real foi enviado.
- A fila transversal acrescentou contratos locais, todos sem rede:
  - `worker/src/welcomeOutboxContract.js` compõe confirmação, política e outbox
    sem confiar no tenant do payload;
  - `worker/src/emailSuppressionPolicy.js` trata hard/soft bounce, complaint,
    unsubscribe e reconsentimento por fingerprint sintética;
  - `worker/src/emailSuppressionOutboxContract.js` exige binding autoritativo e
    avalia supressão antes de reservar tentativa;
  - `worker/src/welcomeEmailTemplate.js` renderiza HTML acessível e texto plano,
    sem personalização/PII, com URLs HTTPS e CTA para o primeiro orçamento;
  - `worker/src/onboardingReminderPolicy.js` limita a cadência educativa a três
    lembretes (dois por e-mail), intervalo mínimo de 48 horas, opt-in versionado
    para e-mail e parada após o primeiro orçamento.
- Ainda faltam o hook real de confirmação, persistência transacional, identidade
  do remetente/provider, endpoint interno e canário controlado. Os contratos
  locais não provam entrega nem autorização de produção.

### Notificações

- Lembretes locais com Expo existem em `src/services/agenda.ts`.
- O ritual diário já aplica a regra “sinal real ou silêncio”, teto de dois
  avisos de engajamento por dia, janela 07h–20h e domingo silencioso por
  padrão.
- A política pura de canais criada em `src/services/notificationPolicy.ts`
  centraliza essas regras para uso futuro no app e no Worker. Ela não pede
  permissão, não grava e não envia nada.
- A central e o ciclo de aparelhos agora possuem contratos locais:
  - `worker/src/notificationInboxJournal.js` fornece journal/reducer persistível
    com revisão, idempotência e isolamento;
  - `worker/src/pushDeviceRegistry.js` cobre registro, rotação, revogação e
    invalidação sem guardar token bruto;
  - `src/services/notificationDeliveryOrchestrator.ts` decide canais com
    preferências, capability, deduplicação, quiet hours e limites fail-closed;
  - `worker/src/notificationDeliveryJournal.js` registra decisão e resultado
    terminal por canal com revisão/hash e sem conteúdo, token ou provider;
  - `src/services/notificationPermissionPromptPolicy.ts` decide quando mostrar
    o pré-prompt explicativo após marco de valor, com cooldown de 30 dias e teto
    de duas exposições, sem chamar a API de permissão do sistema.
- Ainda faltam tabelas/adapters, tokens remotos reais, integração do pré-prompt
  com a API do sistema, Web Push/VAPID, service worker de produção e aceite em
  aparelhos.

### Fatia local concluída — draft de persistência

`docs/ONDA_3/JANELA_3_4_NOTIFICATION_PERSISTENCIA/` acrescenta um draft SQL
fora de `supabase/migrations` e um teste estático dedicado. O schema proposto
separa inbox, operações idempotentes, aparelhos, decisões e resultados de
entrega; todas as tabelas ficam com RLS forçada e sem policy de cliente. Token
bruto e provider não são persistidos: o registry recebe somente fingerprint
HMAC e geração da chave. Conteúdo/journals expiram em até 90 dias e o purge é
paginado.

Isso conclui apenas a preparação local. A promoção exige finalidade/base legal
para conteúdo do inbox, RPCs atômicas de CAS + operação + mutação, migration
versionada, pgTAP de allow/deny, custódia separada do token, aparelhos e aceite
humano. Nenhuma dessas provas externas foi inferida do draft.

### PWA e APK

- O manifest atual em `web/public/site.webmanifest` usa `display: "browser"`.
- A configuração Expo em `eas.json` prevê APK em perfis de desenvolvimento/
  preview e App Bundle no perfil de produção.
- Não existe ainda APK de release comprovado, página oficial de download,
  hash, política de atualização ou PWA instalável com push.

### Administração e IA

- O painel do Worker já possui papéis `owner`, `admin`, `financeiro`,
  `suporte` e `leitura`, autenticação por JWT, AAL2/TOTP em ações críticas e
  auditoria append-only.
- `/admin/api/metrics` e `/admin/api/users` exigem explicitamente a capability
  `admin`; o papel `leitura` tem regressão negativa coberta e não recebe a lista
  global.
- `/admin/api/user` exige papel de suporte (ou superior compatível) **e AAL2**
  antes de iniciar qualquer consulta service-role; a regressão sintética prova
  que AAL1 recebe `mfa_necessario` sem tocar datasets.
- O detalhe de usuário agora aplica `worker/src/adminDataPolicy.js` antes da
  consulta e novamente na resposta: suporte não consulta valores de orçamento,
  IDs de gateway, faturas ou ledger; vê apenas status de plano. Financeiro não
  consulta clientes/agenda, e auditoria fica em admin/owner. A
  projeção de empresa omite CPF, chave Pix, cláusulas, data URI de logo e
  assinatura; IDs de Stripe/Mercado Pago ficam apenas como indicadores de
  vínculo. A política é versionada, testável e não é autorização para dataset
  de IA.
- O produto ainda não executa treinamento de IA nem exporta dados; o contrato
  de governança foi preparado, mas consentimento real, revogação, manifesto
  persistido e purge propagado continuam gates da integração futura.
- A quarta fatia cria `worker/src/datasetPolicy.js` como contrato offline para
  o futuro workspace de dados: finalidade e escopo limitados, campos proibidos,
  opt-in versionado, pseudonimização `hmac_v1`, retenção máxima de 90 dias,
  purge de derivados/embeddings/backups/modelos, aprovação humana e kill
  switch. Ela só valida/projeta fixtures; não exporta nem consulta dados.
- A quinta fatia cria `worker/src/notificationInbox.js` como contrato puro para
  a central in-app: identidade vinda do contexto confiável, texto plain-text
  limitado, deduplicação por evento/usuário/tenant, expiração, leitura e
  dispensa idempotentes. Ela não grava em banco, pede permissão nem envia
  push/e-mail; a persistência fica para uma integração posterior com migration
  e auditoria aprovadas.
- A fila transversal adiciona `worker/src/adminAccessAudit.js`, trilha local
  revisionada e hash-encadeada para consultas administrativas allowlistadas.
  Ela pseudonimiza ator/alvo e não libera exportação, rota live ou dado real;
  persistência, finalidade/base legal e AAL2 aceito continuam gates humanos.

## 3. Contratos da Fase 0

### Eventos

Cada evento deve possuir `event_id` estável, `user_id`, `tenant_id` resolvido do
contexto confiável, `purpose`, `created_at`, versão do contrato e origem. O
payload não pode escolher o tenant nem conceder autorização.

Eventos iniciais:

- `account.email_confirmed` — candidato a disparar o welcome uma única vez;
- `email.welcome.requested`, `email.welcome.sent`, `email.welcome.failed`;
- `notification.requested`, `notification.delivered`,
  `notification.failed`, `notification.dismissed`;
- `device.push_registered`, `device.push_revoked`;
- `data.access_requested`, `data.access_granted`, `data.exported`;
- `dataset.build_requested`, `dataset.approved`, `dataset.revoked`.

Implementado localmente nesta etapa: `account.email_confirmed` pode ser
transformado no contrato `email.welcome.requested` por
`criarEventoBoasVindas(confirmacao, contexto)`. O contrato não confia em
`tenantId` do payload e usa `welcome:<userId>:boas_vindas.v1` como idempotência.

O consumidor futuro deve criar `emailOutbox` apenas uma vez por essa chave,
reservar uma tentativa quando `nextAttemptAt` chegar, chamar o provider fora do
request do usuário e confirmar `sent` somente após resposta idempotente. Falha
permanente ou cinco falhas transitórias vão para `dead_letter` para análise,
sem bloquear o cadastro.

### Preferências

Preferências mínimas por usuário/tenant:

- e-mail transacional (ativo por necessidade operacional);
- e-mail educativo (desligado por padrão até opt-in);
- push nativo;
- Web Push;
- notificações dentro do app;
- horário silencioso;
- domingo para engajamento;
- limite diário de engajamento;
- versão da política aceita, data e origem da alteração.

### Outbox de e-mail

Estados propostos: `pending`, `sending`, `sent`, `failed`, `dead_letter`.

Campos mínimos:

- `event_id` e `idempotency_key` únicos;
- template e versão;
- destinatário normalizado;
- tentativas e `next_attempt_at`;
- status, provider id e erro categorizado;
- timestamps;
- nenhum corpo completo de resposta do provedor.

O outbox deve ser transacional com o evento de negócio. O app nunca recebe a
chave do Resend e nunca faz POST direto ao provider.

## 4. Fase 1 — welcome transacional

### Conteúdo aprovado

O template local implementado contém:

1. Logo/wordmark da OLLI Orçamentos;
2. saudação neutra, sem personalização ou PII;
3. explicação curta do valor do produto;
4. três primeiros passos: configurar negócio, cadastrar cliente e criar
   orçamento;
5. botão para a plataforma e URL em texto;
6. aviso de que dicas são opcionais;
7. alternativa plain-text para acessibilidade e filtros de spam.

### Regras de entrega

- Só emitir depois de `email_confirmed`.
- Uma entrega por `user_id + template_version`.
- Retry limitado e observável.
- Bounce e complaint entram em supressão.
- E-mail de segurança não depende do opt-in educativo.
- E-mail educativo tem preferência, descadastro e limite próprios.
- Não registrar segredo, token, sessão ou corpo completo do provider.

### Gates humanos

- conta Resend;
- domínio remetente verificado;
- SPF/DKIM/DMARC;
- `RESEND_API_KEY` guardada como secret do Worker;
- endereço de teste/sandbox;
- autorização explícita para o primeiro canário controlado.

## 5. Fase 2 — central e limites de notificação

- inbox in-app com lido/não lido;
- categoria e prioridade;
- preferência por canal;
- quiet hours;
- no máximo duas mensagens de engajamento por dia somando canais;
- domingo silencioso por padrão;
- deduplicação por evento;
- revogação e limpeza de tokens;
- copy sem conteúdo sensível em tela bloqueada.

### Fatia local concluída — contrato de inbox

- `criarNotificacao` aceita somente os campos necessários e rejeita contexto de
  usuário/tenant divergente, kind desconhecido e URL que não seja HTTPS;
- conteúdo é reduzido a plain-text, sem tags HTML, controles ou CRLF;
- `inserirNotificacao` usa chave natural do evento por tenant/usuário e retorna
  decisão idempotente sem mutar a lista recebida;
- `listarNotificacoes` aplica isolamento do contexto, filtro de estado,
  expiração e limite de projeção;
- `marcarLida` e `dispensarNotificacao` são operações imutáveis e auditáveis,
  sem permitir que outro tenant altere o item;
- o contrato é LOCAL ONLY/SINTÉTICO e não deve ser confundido com central
  persistida, push remoto ou aceite em aparelho real.

## 6. Fase 3 — push nativo e Web Push

### Nativo

- registrar token após consentimento contextual;
- guardar aparelho, sistema, versão e último uso;
- suportar vários aparelhos por conta;
- revogar um aparelho sem revogar os demais;
- remover token inválido;
- não quebrar o fluxo quando a permissão for negada.

### Web

- transformar o site em PWA somente depois de definir cache e atualização;
- service worker de produção distinto do Mock Service Worker de desenvolvimento;
- VAPID e inscrição revogável;
- prompt de permissão após explicar o benefício;
- fallback para navegador incompatível.

## 7. Fase 4 — PWA e APK

Ordem recomendada:

1. PWA instalável e central de notificações;
2. teste em navegadores e aparelhos reais;
3. build Android assinado de release;
4. página de download com versão, hash e instruções;
5. política de atualização e suporte;
6. decidir distribuição direta, Play Store ou ambas.

Nenhuma etapa de EAS, assinatura, hospedagem ou publicação é automática neste
plano. Cada uma exige credencial e aceite humano.

## 8. Fase 5 — Admin Data Workspace e IA

### Papéis

- `owner/admin`: gestão e acesso detalhado somente com finalidade registrada;
- `financeiro`: cobrança e métricas financeiras necessárias;
- `suporte`: diagnóstico mínimo, sem conteúdo financeiro desnecessário;
- `leitura`: agregados sem PII;
- acesso de emergência: capability separada, AAL2, justificativa e auditoria.

### Dataset governado

Todo dataset precisa declarar:

- finalidade e base legal revisadas;
- tenant/coorte e tamanho mínimo;
- tabelas/campos de origem;
- classificação e redaction version;
- pseudonimização/tokenização;
- retenção e data de expiração;
- aprovador e revisão humana;
- estratégia de exclusão em derivados, embeddings, backups e modelos;
- kill switch e revogação.

Por padrão, ficam fora: senha, token, sessão, prompt cru, transcrição crua,
CPF/CNPJ, telefone, endereço, identificadores de pagamento, margem e conteúdo
de cliente sem finalidade específica.

## 9. Critérios de aceite

- cadastro confirmado gera no máximo um welcome;
- retry do mesmo evento não duplica mensagem;
- assunto/HTML não aceitam CRLF ou injeção de conteúdo;
- e-mail desativado não bloqueia segurança/transacional;
- educação respeita opt-in, horário e teto;
- push negado não quebra onboarding;
- token revogado não recebe mensagem;
- papel de leitura não acessa PII ou financeiro indevido;
- dois tenants não se enxergam;
- qualquer exportação tem purpose, scope, auditoria e expiração;
- dataset não contém campos proibidos;
- exclusão propagada deixa evidência de purge;
- nenhum teste usa segredo ou dado real.
- manifesto sem opt-in, escopo global, retenção acima de 90 dias, purge
  incompleto ou kill switch ausente falha fechado antes de qualquer exportação.

Para a leitura administrativa, a prova também deve confirmar que a query já
nasce com `select` allowlistado e que a resposta não reintroduz campos extras.
Isso evita considerar “filtrar depois” como controle suficiente.

## 10. Verificação desta fatia

- `node --check worker/src/email.js` — aprovado;
- `node worker/scripts/teste-email.js` — **14 verificações aprovadas**;
- `node scripts/teste-notification-policy.ts` — **14 verificações aprovadas**;
- `node scripts/teste-welcome-event.ts` — **16 verificações aprovadas**;
- `node scripts/teste-email-outbox.ts` — **15 verificações aprovadas**;
- `node scripts/teste-dataset-policy.ts` — **16 verificações aprovadas**;
- `node scripts/teste-notification-inbox.ts` — **18 verificações aprovadas**;
- `node scripts/teste-admin-dados-policy.ts` — **21 verificações aprovadas**;
- `node scripts/teste-welcome-outbox-contract.ts` — **19 verificações aprovadas**;
- `node scripts/teste-email-suppression-policy.ts` — **42 verificações aprovadas**;
- `node scripts/teste-email-suppression-outbox-contract.ts` — **27 verificações aprovadas**;
- `node scripts/teste-notification-inbox-journal.ts` — **24 verificações aprovadas**;
- `node scripts/teste-push-device-registry.ts` — **26 verificações aprovadas**;
- `node scripts/teste-notification-delivery-orchestrator.ts` — **35 verificações aprovadas**;
- `node scripts/teste-notification-delivery-journal.ts` — **39 verificações aprovadas**;
- `node scripts/teste-notification-permission-prompt-policy.ts` — **29 verificações aprovadas**;
- `node scripts/teste-onboarding-reminder-policy.ts` — **29 verificações aprovadas**;
- `node scripts/teste-welcome-email-template.ts` — **29 verificações aprovadas**;
- `node scripts/teste-admin-access-audit.ts` — **29 verificações aprovadas**;
- `node scripts/teste-admin-audit-policy-contract.ts` — **29 verificações aprovadas**;
- `node scripts/teste-transversal-readiness.ts` — **32 verificações aprovadas**;
- `node --check worker/src/admin.js` e `node --check worker/src/adminDataPolicy.js` — aprovados;
- `npm run typecheck -- --pretty false` — aprovado;
- `npm test` — **exit 0; meta-suíte 136/136 e contratos transversais verdes**;
- `git diff --check` nos arquivos tocados — aprovado.

Os arquivos existentes e alterações anteriores da worktree foram preservados.
Não houve envio de e-mail, acesso a segredo, migration, deploy, build EAS,
contato externo ou publicação.

## 11. Materiais de divulgação e identidade

Os materiais solicitados para os grupos e para outro ChatGPT ficam catalogados
no próprio repositório, sem criar uma marca paralela:

- `docs/PESQUISAS/PROMPT_CAMPANHA_5_IMAGENS_OLLI_ORCAMENTOS.md` — briefing de
  cinco peças para Facebook/comunidades, com headline, apoio, CTA, prompt visual
  e checklist de claims seguros;
- `docs/PESQUISAS/PROMPT_IDENTIDADE_VISUAL_OLLI_ORCAMENTOS.md` — direção de
  identidade, paleta, acessibilidade, tipografia e uso correto da marca;
- `docs/PESQUISAS/PACOTE_IDENTIDADE_VISUAL_OLLI_ORCAMENTOS.zip` — pacote com os
  dois briefings e referências visuais locais já existentes;
- `docs/PESQUISAS/PACOTE_IDENTIDADE_VISUAL_OLLI_ORCAMENTOS/LEIA-ME.md` — ordem
  recomendada de envio e limites para não transformar protótipo em promessa.

Esses arquivos são direcionamento criativo, não publicação automática. Antes de
qualquer anúncio, revisar texto, inserir o logotipo oficial e confirmar que a
função mostrada existe na versão realmente publicada. Nenhuma variante do nome
oficial deve aparecer em novas peças.

## 12. Monetização sem quebrar a ativação

A estratégia de conversão do Pro foi analisada por cinco lentes independentes e
três revisores e está registrada em
docs/ENXAME/ESTRATEGIA_CONVERSAO_PRO_OLLI_2026-08-31.md.

Resumo que vale para este plano:

- o fluxo central gratuito permanece completo e ilimitado (orçamentos, recibos,
  clientes, agenda, PDF/link e histórico);
- o Pro converte por valor profissional visível (marca própria, modelos,
  IA/relatórios/metas/radar), não por bloqueio do primeiro orçamento;
- CTA contextual e trial opt-in só entram depois de caixa, webhook,
  entitlements server-side, eventos idempotentes e downgrade testados;
- onboarding e notificações devem explicar claramente a data de término, não
  iniciar cobrança automática e oferecer “continuar no gratuito”;
- não disparar e-mail/push de venda em massa, não usar urgência falsa e não
  misturar fundadores com pagantes;
- os preços de trabalho continuam R$ 0 / R$ 39 / R$ 99 até existir uma coorte
  com caixa e segunda mensalidade observáveis;
- antes de qualquer integração, resolver a fonte única de plano da release
  (os documentos locais citam Stripe e Mercado Pago em pontos diferentes).
- os contratos locais de monetização agora incluem eventos/trial 27/27,
  reconciliação de entitlement 43/43, fixture de oferta A/B 36/36 e journal do
  experimento 36/36. Evento de pagamento/cache isolado não concede plano; o
  conjunto mede a hipótese, mas não ativa cobrança, analytics real ou CTA live.

Este acréscimo é um contrato de planejamento local. Não autoriza cobrança,
alteração de preço, migration, deploy, envio de mensagens ou publicação.
