# Cópia de revisão — Receita liberada (D-2076)

O código que roda não é este. Esta pasta é a cópia para o revisor ver a mudança. O app não importa estes arquivos. Não publicar, não fazer deploy e não tratar o merge como se o produto passasse a ler a Receita.

## Onde roda

- Lista: `/home/igor/dados-receita/lista.py` e `lista_test.py`
- Motor: `/home/igor/chatwoot-central/campanhas/prospeccao/`
- Bot: `/home/igor/chatwoot-central/bot/prospeccaoModo.js` e `robo.js`

`supressao_lib.py` fica só na pasta viva. Não entra neste repositório: a sincronização lê credencial local.

As listas geradas (telefone) também não entram aqui. Ficam em `/home/igor/dados-receita/listas/2026-11-14-liberada/`, chmod 600.

## O que mudou

- As travas antigas viraram flags opcionais, desligadas no padrão: `--sem-mei`, `--email-dominio-proprio`, `--telefone-so-sem-email`, `--celular-so-msg-igor`.
- O piso continua: situação cadastral ativa, supressão em fail-closed, saída chmod 600, coluna de fonte e data.
- Fonte `receita` no motor. A primeira mensagem diz quem fala (Rafa, da OLLI). Se perguntarem de onde veio o contato, a resposta é os dados abertos da Receita. SAIR para na hora.
- Telefone fixo fica no CSV para ligação humana e não entra na fila de WhatsApp. O nono dígito só é reposto em celular provável.
- Teto de envio: 10 por dia e 3 por hora. O plano 10, depois 20, depois 40 por dia está no código e permanece desligado. Quem sobe é o Salomão. O timer de envio não foi ligado.

## Teste

Rodar na pasta viva. Daqui faltam o parquet, a supressão e os módulos vizinhos do robô.

```bash
/home/igor/dados-receita/.venv/bin/python /home/igor/dados-receita/lista_test.py
cd /home/igor/chatwoot-central/campanhas/prospeccao && node --test mensagens.test.js leads.test.js ritmo.test.js enviar.test.js identifier.test.js
cd /home/igor/chatwoot-central/bot && node --test prospeccaoModo.test.js robo.prospeccao.test.js
```
