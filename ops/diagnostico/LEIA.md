# Diagnóstico do lead — OLLI Serviços

Olha o site público de uma empresa e escolhe 1 oferta do catálogo para o Rafa citar no 1º toque. Não envia WhatsApp, e-mail nem mensagem. Não faz login e não abre Google Maps.

O que confere, só na primeira página: abre, HTTPS, viewport de celular, botão ou link de WhatsApp, formulário, link de Instagram e link do Google. E-mail de provedor gratuito entra se estiver no HTML. O JavaScript da página não roda.

A frase sai da lacuna que deu para ver. Se o robots proibir, se o site recusar ou se cair num desafio, o 1º toque continua o texto padrão do motor. Preço não entra. O catálogo lido é o `CATALOGO.md` do GZ-AGENCIA-1; se ele sumir, vale a lista provisória no código.

## Onde roda

A cópia que o motor importa está em `/home/igor/chatwoot-central/campanhas/diagnostico/`. Esta pasta `ops/diagnostico` é a mesma para revisão. O gancho é `fraseSeLimpa` dentro de `mensagens.mjs`: o cache guarda o código da lacuna, e a frase é montada na hora.

```bash
node --test ops/diagnostico/diagnostico.test.mjs
node ops/diagnostico/rodar.mjs --seco
node ops/diagnostico/rodar.mjs --de-cache
```

`--de-cache` só regrava o relatório a partir do cache, sem entrar na rede.

A rodada real, com pausa, grava o relatório mascarado e o cache (sem telefone):

```bash
node /home/igor/chatwoot-central/campanhas/diagnostico/rodar.mjs
```

## Desligar

Apagar `/home/igor/chatwoot-central/data/diagnostico-cache.json`. Sem esse arquivo o motor volta à frase genérica. O timer da prospecção não é ligado por aqui.
