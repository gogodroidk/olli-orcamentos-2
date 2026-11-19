# Ativação WhatsApp — ligar, parar e voltar atrás

13/11/2026, noite. A lista oficial tem 46 pessoas (Luiz `8d2c59dd` e MK Bombas `ac0f2c80` na frente). Telefone só com os 4 últimos dígitos. Os 46 contatos estão na caixa OLLI Orçamentos (id 4, final 7487) com a etiqueta `ativacao`. Nenhuma conversa foi aberta e nenhum WhatsApp saiu. O timer continua desligado.

A lista oficial só se reescreve com `node enviar.mjs --seco --gravar`, sem `--teste`. `--teste --gravar` não mexe mais nesse arquivo.

## Ligar o timer — um comando, depois de revisar a lista

O Salomão revisa `LISTA-ENVIO.md` e, só então, cola isto. Não rodei este comando.

```bash
cp /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.service /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.timer /home/igor/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now ativacao-zap.timer && systemctl --user list-timers ativacao-zap.timer
```

Parar: `systemctl --user disable --now ativacao-zap.timer`

Quem liga o envio é o Salomão. O que já está feito e o que ainda é dele:

## 1. Gerar a base

Já existe `base.json` (112 contas). O SQL continua só SELECT em `/home/igor/chatwoot-central/ativacao/mapa.sql`. Não copiar para `supabase/migrations` e não aplicar como migration. Se for refazer a base: rodar o SELECT no SQL editor (papel postgres), salvar só o array em `base.json` e `chmod 600`. Não commitar.

## 2. Atualizar a supressão

Em 13/11 à noite a sync estava fresca (menos de 24 h, 7 hashes). Se passar de 24 h, o importador e o envio recusam todo mundo (`supressao_velha`). Aí o Salomão roda o `sincronizar_supressao.py` que já existe.

## 3. Reescrever o mapa e a lista, sem mandar

Na pasta `/home/igor/chatwoot-central/ativacao`, com o node de `/home/igor/.local/bin/node`:

```bash
node mapa.mjs
node importar.mjs --seco
node enviar.mjs --seco --gravar
```

Isso reescreve este diretório (`MAPA-BASE.md` e `LISTA-ENVIO.md`) com o telefone só nos 4 últimos dígitos. `--seco` não cria contato e não manda mensagem.

## 4. Importar contatos

Feito em 13/11 à noite: 46 contatos com a etiqueta `ativacao`, nenhum com conversa. Para repetir, sem mandar mensagem:

```bash
node importar.mjs --seco
node importar.mjs
```

Cria ou atualiza contato na caixa OLLI Orçamentos, com atributos (etapa, especialidade, cidade, cadastro, plano, orçamentos, conta) e etiqueta `ativacao`. Não abre conversa e não manda mensagem. Não duplica quem já existe (busca por conta e por telefone). Entram: telefone válido, 0 ou 1 orçamento, mais Luiz (conta `8d2c59dd`, Pro R$ 39 não concluído) e MK Bombas (conta `ac0f2c80`, Empresa R$ 99 não concluído). Ficam de fora: quem já paga, quem está suprimido no banco ou no CSV, e o número da casa.

## 5. Prova no número da casa

Só o Salomão, e só o final 2309. O texto desse teste é interno ("pode ignorar"), não o texto de cliente.

```bash
node enviar.mjs --teste --seco
node enviar.mjs --teste
```

O segundo comando manda de verdade se a supressão estiver fresca, a Evolution estiver aberta e for seg–sáb, 9h–18h (Brasília). Fora disso ele recusa e não chama a API.

## 6. Ligar a fila (aí o envio começa)

O comando único está no topo deste arquivo. O timer acorda a cada minuto, seg–sáb, das 9h às 18h. A caixa OLLI tem expediente seg–sex; o envio não encolhe para isso. Cada acordada manda no máximo uma mensagem, se a janela, o intervalo e os tetos deixarem: 12 por dia, 3 por hora, espera aleatória de 4 a 10 minutos. Pula quem já respondeu e quem tem etiqueta `parar-contato` ou `cliente-antigo`.

## Parar

```bash
systemctl --user disable --now ativacao-zap.timer
```

O envio também para sozinho se existir `/home/igor/chatwoot-central/data/ativacao-freio.json`. Para soltar de novo, uma pessoa apaga esse arquivo depois de decidir. Se `ativacao-estado.json` tiver `freio_avisado`, o próximo freio novo só avisa o Igor outra vez depois que esse campo voltar a falso.

## O que trava sozinho

- Fora de seg–sáb 9h–18h (Brasília).
- Supressão ausente ou com mais de 24 h.
- Evolution desconectada: grava o freio `evolution_desconectada` e chama `precisa-igor` (login, http://127.0.0.1:8086).
- Duas pessoas pedindo para parar no mesmo dia: freio `2_paradas` e `precisa-igor` (erro).
- Log em `/home/igor/chatwoot-central/data/ativacao.log` (telefone mascarado).

## Voltar atrás

1. Desligar o timer (comando acima).
2. Restaurar o robô de antes das 18h15 de 13/11 e reiniciar só o container do robô:

```bash
cp /home/igor/chatwoot-central/_bak-bot-13-11-ativacao/robo.js /home/igor/chatwoot-central/bot/robo.js
cp /home/igor/chatwoot-central/_bak-bot-13-11-ativacao/server.js /home/igor/chatwoot-central/bot/server.js
rm -f /home/igor/chatwoot-central/bot/ativacaoModo.js /home/igor/chatwoot-central/bot/freioAtivacao.js
docker restart central-bot-central-bot-1
```

`curl http://127.0.0.1:3012/health` tem que responder `ok`.

3. Apagar `data/ativacao-freio.json` se a pausa tiver sido engano.
4. Contatos com a etiqueta `ativacao` continuam no Chatwoot. Tirar a etiqueta se a fila for cancelada. Conversa de cliente não se apaga daqui.
5. Para desfazer só a correção da lista: copiar de volta `/home/igor/chatwoot-central/_bak-ativacao-melhoria-1a/enviar.mjs` e `enviar.test.js` (e `fila.test.js`, `robo.ativacao.test.js` se for o caso) para os lugares de origem. Os contatos importados ficam. A etiqueta se tira sem apagar conversa.

## Texto e preço

A Lívia fala como pessoa da equipe. A primeira mensagem não diz que é IA e não pede "responda SAIR". Se perguntarem direto: "Sou a assistente virtual da OLLI." Quem pede para parar, para na hora (etiqueta `parar-contato`). Preço só de tabela: Pro R$ 39 e Empresa R$ 99. Link: https://olliorcamentos.online

Pedido de humano, preço fora da tabela ou reclamação: nota na conversa e aviso para o Igor. A conversa sai do robô.

## O que este item não faz

Não publica o app, não mexe em olliorcamentos.online nem em ollizap.online, não altera Auth, DNS nem Cloudflare, e não aplica migration.
