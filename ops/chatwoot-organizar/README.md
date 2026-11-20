# Chatwoot da Central — organização (CQ-CHATWOOT-ORGANIZAR, 18/11/2026)

Script que organiza a conta 2 (Central OLLI) do Chatwoot CE 4.19.1 em `127.0.0.1:3010`.
Só acrescenta. Não renomeia nem apaga nada que o robô (`chatwoot-central/bot`), as campanhas
(`chatwoot-central/campanhas`, `ativacao`) ou o painel usam. Não manda mensagem a cliente.

```bash
node ops/chatwoot-organizar/aplicar.mjs --conferir   # só lê
node ops/chatwoot-organizar/aplicar.mjs              # aplica (idempotente)
node ops/chatwoot-organizar/aplicar.mjs --desfazer   # tira só o que ele criou e devolve o que mudou
node ops/chatwoot-organizar/aplicar.mjs --ligar-ausencia-grtech  # só com OK do Igor: manda WhatsApp automático fora do horário
```

O que ele faz: 3 times por empresa (sem auto-atribuição, para não calar o robô; sem "vendas" no nome,
porque o robô e o vigia acham o time por `/vendas/i`), 8 etiquetas que o robô já gravava e não existiam,
grupo da taxonomia na descrição de cada etiqueta, 3 atributos de contato (`fonte`, `campanha`, `empresa`),
7 respostas prontas com texto que já está em produção no robô, 5 macros, 4 automações, 4 visões salvas
por usuário e avisos do Igor no navegador.

Registro do que foi criado/mudado (para desfazer): `CQ_REGISTRO` ou, por padrão,
`Desktop/Entregas Claude/OLLI/2026-11-18-chatwoot-organizado/backup/registro-aplicar.json`.
Precisa de `cw-api` (`~/.local/bin`) e de `docker` com os contêineres `chatwoot-demo-*`.
