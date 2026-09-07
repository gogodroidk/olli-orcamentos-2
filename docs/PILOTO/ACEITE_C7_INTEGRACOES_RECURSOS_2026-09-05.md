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
