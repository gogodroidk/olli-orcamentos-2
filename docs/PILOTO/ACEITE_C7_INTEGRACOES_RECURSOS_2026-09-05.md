# C7 — integrações e central do prestador

Data: **2026-09-06 (revalidação)**

## Estado

**Parcial local / bloqueado externamente.** A Central de Ferramentas agora reúne
links oficiais para Meu INSS, NFS-e padrão nacional e cursos Sebrae, com aviso
para conferir regras diretamente no órgão. Agenda local, notificações com política
de consentimento e sincronização isolada por tenant continuam disponíveis.

## O que não foi simulado

O endpoint local do Resend já está protegido por assinatura Svix e idempotência;
registrar o webhook real, além de Google Calendar, WhatsApp Cloud API, mapas pagos
e emissão fiscal, exige OAuth, contas de provedor, credenciamento ou homologação. O Storage privado
já tem adapter, configuração local e migration RLS; aplicação e canário aguardam
um staging Supabase correto. O conector Supabase foi revalidado no projeto OLLI
e a tentativa de criar branch foi recusada pelo plano atual (Pro obrigatório),
sem qualquer escrita remota.
No endpoint live, `GET /resend/webhook` ainda responde 404; portanto o webhook
real não foi registrado e não seria correto promover o dispatch para destinatários
reais antes de um deploy controlado do Worker.
O backlog de integrações mantém cada item atrás de porta/adaptador e fallback
manual; nenhum botão promete integração ausente.

## Evidência

- `npm run test:c7-integracoes-recursos` — passou.
- `npm run test:storage-provider` — passou.
- `npm run test:resend-webhook` — passou (Svix, replay, idempotência e remoção de PII).
- `npm run typecheck` e build do painel — passaram.

## Revalidação externa — 2026-09-07

- O projeto isolado `OLLI-STAGING` foi criado e recebeu baseline + 41 migrations
  no SQL Editor autenticado; metadata-only comprovou 3 buckets privados, 4
  policies de Storage, RLS e triggers esperados.
- O Worker staging está publicado em `workers.dev`, sem rotas de produção, com
  `WELCOME_DISPATCH_MODE=off` até os secrets de teste existirem. O smoke público
  passou; Storage/RLS autenticado, Resend, WhatsApp, fiscal, agenda e OAuth real
  continuam pendentes.
- As afirmações anteriores de “aguarda staging” são históricas; o bloqueio atual
  é migration history/rollback, secrets e smoke autenticado.
