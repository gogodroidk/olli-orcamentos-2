# Interessados da OLLI Serviços

O Rafa marca a conversa quando a pessoa pede preço, pede para ver ou aceita a conversa de 15 minutos. A etiqueta é `interessado`. A visão salva no Chatwoot se chama `Interessados`. O painel da Central tem a mesma lista: empresa, o que ela quer e há quanto tempo espera.

Quem pede para parar sai na hora (a linha seguinte na fila leva `parado: true`) e não entra no resumo.

## Onde roda

A cópia que o Git revisa é esta pasta. O que a Central lê está em:

- `/home/igor/chatwoot-central/bot/interesse.mjs` e o gancho em `prospeccaoModo.js`, `robo.js`, `server.js`
- `/home/igor/chatwoot-central/painel/` (aba Interessados)
- `/home/igor/chatwoot-central/campanhas/interessados/` (resumo e visão)

`aplicar.sh` só copia esses módulos. Não reinicia container e não ativa o timer.

## Telegram

`resumir.mjs` monta o texto. O timer `systemd/interessados-resumo.timer` está escrito para seg–sáb às 9h e às 17h30 (America/Sao_Paulo). **Não está instalado e não pode ser ativado por este trabalho.** Sem a flag `--dry`, o script manda pelo `equipe.mjs`. Teste só com `--dry --sem-central`.

## Visão no Chatwoot

`visao-cli.mjs` cria a etiqueta e o filtro pelo `cw-api`, se ainda não existirem. Não envia mensagem de WhatsApp.
