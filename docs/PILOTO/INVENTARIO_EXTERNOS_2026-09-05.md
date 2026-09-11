# Inventário externo OLLI — 2026-09-05 (revalidação 2026-09-06)

Leitura realizada sem revelar valores de secrets, sem cobrança, envio, migration,
deploy, DNS ou alteração de produção.

## Supabase

- O aplicativo aponta para o projeto `yiaeplqinnnnniyvwtls`, que o dashboard
  identifica como `main / PRODUCTION`.
- Revalidação do conector em **6 de setembro de 2026** encontrou o mesmo projeto
  `yiaeplqinnnnniyvwtls` como `ACTIVE_HEALTHY`; a leitura remota foi permitida
  somente para metadados, Advisors e consultas `SELECT` sem PII. Nenhuma escrita
  foi executada.
- No dashboard do projeto correto: 0 erros e 8 warnings de segurança. Sete são
  funções `SECURITY DEFINER` expostas a usuários autenticados; o oitavo é proteção
  de senhas vazadas desativada. Cada função precisa ser revisada por finalidade.
- Revalidação em **6 de setembro de 2026** manteve o mesmo placar: 0 erros e 8
  warnings. A correção continua deliberadamente fora desta execução porque o
  projeto exibido é `main / PRODUCTION` e não há staging isolado.
- A consulta de privilégios confirmou os cinco helpers em `public` como
  `SECURITY DEFINER`, com `authenticated` autorizado e `anon` negado — exatamente
  o conjunto coberto pela migration local. A migration ainda não foi aplicada;
  o estado remoto permanece inalterado.
- A lista de migrations do projeto confirmou que as migrations locais mais novas
  de cota comercial/trial, Storage privado, ações IA e helpers privados ainda não
  estão no live. Isso explica por que a prova atual é `DONE_LOCAL`, não aceite
  remoto: promover exigiria branch de staging, canário e rollback registrados.
- Tentativa controlada de criar `olli-codex-staging-rls-20260906` após confirmação
  do custo de US$ 0,01344/h foi recusada pelo provedor: branching só está
  disponível no plano Pro ou superior. A listagem posterior mostrou somente
  `main`; nenhum branch, migration ou cobrança foi criado por esta execução.
- Nova leitura somente de metadados em **6 de setembro de 2026** confirmou a
  organização `OLLI` no plano `free` e quatro projetos: `OLLI ORCAMENTOS`
  (ativo) e `CACADOR`, `GENESIS` e `FONTE.IA` (inativos). Nenhum projeto está
  identificado como staging; os inativos não foram reutilizados para não
  misturar dados, ownership ou rollback de outros produtos.
- Em **6 de setembro de 2026**, após autorização explícita, foi criado o projeto
  isolado `OLLI-STAGING` (`sbpkutknpywezeagioon`) em `sa-east-1`, com custo
  informado de US$ 0/mês. O baseline schema-only foi aplicado sem dados e as
  **41 migrations incrementais** do repositório foram concluídas no SQL Editor
  autenticado. A verificação metadata-only provou 6 tabelas novas com RLS, 3
  buckets privados, 4 policies de Storage, 10 constraints da outbox, 3 índices
  de cobertura e 2 triggers de welcome; as tabelas de welcome estavam vazias.
- O MCP perdeu escopo durante a primeira tentativa na migration
  `20260904205858_email_welcome_outbox.sql`. A recuperação foi feita no painel,
  com retry idempotente e sem dados/segredos; como a execução manual não grava a
  migration history, o dashboard ainda exibe `20260820165809` como última
  migration e esse descompasso está registrado no checkpoint.
- O Worker `olli-diagnostico-staging` foi publicado em `workers.dev` sem rotas
  de produção, com `WELCOME_DISPATCH_MODE=simulator`; a health root respondeu
  HTTP 200. Nenhum secret, e-mail real, cobrança ou dado de cliente foi usado.
- O Advisor de performance também reportou índices ainda não utilizados e
  políticas permissivas duplicadas (esperadas no modelo owner/equipe), além da FK
  de `ia_cota_usuario_diaria.user_id` sem índice reverso. A migration local de
  quota recebeu esse índice e o contrato passou com 49 verificações; há também
  uma migration aditiva separada para a promoção. Os avisos remanescentes
  precisam de workload real antes de qualquer poda/união de policy.
- A pasta local agora tem `supabase/config.toml`, adapter de Storage privado e
  migration versionada; nada foi aplicado remotamente. Foi preparada a migration
  `20260906120000_rls_helpers_private_schema.sql`, que move cinco helpers de RLS
  para o schema não exposto `private` e mantém wrappers públicos `SECURITY INVOKER`.
  O contrato estático correspondente passou com 47 verificações. Enquanto a
  migration não for aplicada e o Advisor não for reexecutado em staging, o placar
  live continua sendo 0/8 e não pode ser reduzido por documentação local.

## Cloudflare

- `olli-diagnostico` e `olli-site` existem; as quatro superfícies públicas
  verificadas responderam HTTP 200.
- Worker com observabilidade, Workers AI, cron e rate limits; `wrangler types`
  agora gera e verifica os bindings, e a CI ganhou dry-run do bundle.
- Não há staging separado. O dashboard do Worker mostra `Git repository: Connect`,
  confirmando que nenhum repositório está conectado atualmente; o risco histórico
  de um Build/Git sobrescrever o backend não está ativo neste momento.
- Na revalidação, logs de invocação/persistência estavam habilitados, traces
  permaneciam desligados e não havia destino de exportação configurado. Isso é
  observabilidade parcial, não aceite de release.
- A tela de Builds dos Workers `olli-diagnostico` e `olli-site` continua com
  `Git repository → Connect`; nenhuma integração GitHub foi gravada. Ligar o
  auto-build ao `main` atual (defasado em relação ao checkout) poderia publicar
  código antigo ou substituir o backend. O caminho seguro é branch/release
  remoto correspondente ao checkout validado, seguido de canário.
- O Worker live mantém `WELCOME_DISPATCH_MODE=simulator`; a cadeia remota de
  modelos OpenRouter também diverge da lista local validada. Corrigir esses
  valores exige mudança de runtime/deploy e canário, não apenas editar o arquivo.
- `wrangler deployments list` confirmou o backend em deployment manual de
  04/09/2026 e o site em deployment manual de 21/08/2026; não há origem Git/CI
  associada aos deployments atuais. O inventário de secrets mostra a chave de
  envio Resend, mas não há secret de assinatura de webhook enquanto o webhook
  não existe; não criei nem colei essa credencial em lugar algum.
- HSTS não foi observado. Só habilitar após inventário completo dos subdomínios.

## GitHub

- OAuth/API do GitHub está autenticado como `gogodroidk` e o remoto local aponta
  para `gogodroidk/olli-orcamentos-2`.
- O `main` remoto está em `df63a25` (21/08/2026); o checkout canônico trabalha
  em `Codex/piloto-p0` com mudanças locais não commitadas e essa branch ainda não
  existe no GitHub. Não houve commit, push ou criação de branch nesta revalidação.
- Essa defasagem é o motivo para não clicar em `Connect` no Cloudflare: fazê-lo
  antes de publicar uma revisão coerente ligaria o auto-build a código antigo.
- Em 7 de setembro de 2026, o branch `codex/piloto-p0` foi publicado no GitHub
  e o PR draft #42 foi aberto para revisão. O workflow de promoção foi disparado
  somente para `staging` e concluiu qualidade + smoke; produção permaneceu
  `skipped`. O Cloudflare Git Build não foi conectado automaticamente.

## Revalidação operacional — 2026-09-07

Este bloco é a fonte atual e supersede as frases históricas acima quando houver
contradição:

- Supabase staging está criado, com baseline + 41 migrations aplicadas
  manualmente; o bloqueio atual é reconciliar a migration history e rollback.
- Worker staging está em `workers.dev`, sem rotas de produção, com
  `WELCOME_DISPATCH_MODE=off` até os secrets de teste existirem. Health e smoke
  público estão verdes; smoke autenticado/RLS/Storage ainda não foi executado.
- O contrato de secrets foi corrigido para os nomes reais usados pelo Worker:
  `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `RESEND_API_KEY`,
  `RESEND_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `OLLI_ROUTES_API_KEY`.
- O branch e o PR draft estão no GitHub; a conexão persistente Cloudflare →
  GitHub ainda aguarda autorização no botão `Connect` do Worker staging.
- O código agora exige HMAC para o webhook Mercado Pago por padrão e redige IDs
  dos logs. O Worker live ainda não foi redeployado por permanecer protegido pelo
  gate de produção; a correção só será ativada no live após revisão e rollback.

## Resend

- O domínio raiz `olliorcamentos.online` está Verified, na região São Paulo.
- No painel não há webhook registrado; há um template em Draft; métricas de tracking não estão
  configuradas.
- O Worker continua em `WELCOME_DISPATCH_MODE=simulator`: apenas o destinatário
  oficial de teste é aceito. Respostas 200 no log provam aceitação da API, não
  entrega em caixa real.
- O código local já oferece `POST /resend/webhook` com assinatura Svix, replay window,
  idempotência global e payload sem destinatário/remetente. A promoção externa exige
  registrar o webhook no painel, além de templates publicados, chave com menor
  privilégio e canário autorizado.
- A leitura HTTP no Worker live respondeu `404` para `GET /resend/webhook`, enquanto
  a health root respondeu 200; a rota local ainda não foi promovida. Registrar o
  webhook agora enviaria eventos para um endpoint que o deployment atual não
  reconhece, então essa integração permanece pendente de deploy controlado.

## Stripe

- A conta possui modos live e teste separados; nenhum objeto ou cobrança foi
  criado nesta auditoria.
- O código implementa checkout, portal, webhook HMAC, deduplicação e rate limit.
  A existência live dos Prices/lookup keys, installments e endpoint de webhook
  ainda precisa de reconciliação read-only.
- Há saldo live negativo. O proprietário confirmou que ele vem de uma transação
  própria esperada e não é um bloqueio financeiro; ainda assim, não houve cobrança
  ou alteração de catálogo nesta auditoria.

## Painel web

- Em 6 de setembro de 2026, a sessão já aberta conseguiu carregar o painel em
  `/meu-negocio` e exibir a navegação e o formulário de identidade da empresa.
  A leitura foi somente visual: nenhum campo foi copiado, alterado ou salvo, e
  nenhuma ação foi executada sobre os dados apresentados.

## Próximo gate seguro

1. Reconciliar a execução manual com o histórico versionado em um job/PR
   controlado, sem reexecutar produção.
2. Provisionar secrets de teste pelo fluxo oficial e confirmar o inventário
   sem imprimir valores.
3. Executar smoke autenticado/RLS/Storage no staging e revisar Advisors.
4. Confirmar/desligar o Workers Build de Git que possa sobrescrever o backend.
5. Reconciliar Stripe live e Resend por leitura; depois executar canários
   explicitamente autorizados, sem clientes reais.
