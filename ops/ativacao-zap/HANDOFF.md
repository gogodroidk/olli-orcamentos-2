# Ativação WhatsApp — ligar, parar e voltar atrás

13/11/2026. Código pronto. Etiqueta `ativacao` e atributos do contato já existem na caixa OLLI Orçamentos (id 4, número final 7487). O robô da Lívia já atende conversa com essa etiqueta. Nenhum WhatsApp saiu. O timer do systemd não foi instalado nem ligado. A base ao vivo ainda não foi lida: o Grok não entra no Supabase de produção.

Quem liga o envio é o Salomão, nesta ordem.

## 1. Gerar a base

Rodar `/home/igor/chatwoot-central/ativacao/mapa.sql` no SQL editor do Supabase (papel postgres). É um SELECT. O resultado é um array JSON. Salvar só o array em:

`/home/igor/chatwoot-central/ativacao/base.json`

Depois: `chmod 600` nesse arquivo. Não commitar. Não copiar o SQL para `supabase/migrations` e não aplicar como migration.

## 2. Atualizar a supressão

O arquivo `supressao.sync` está com mais de 24 h. Enquanto estiver assim, o importador e o envio recusam todo mundo (`supressao_velha`), inclusive o teste do número da casa. Rodar o `sincronizar_supressao.py` que já existe. O Grok não rodou esse script.

## 3. Reescrever o mapa e a lista, sem mandar

Na pasta `/home/igor/chatwoot-central/ativacao`, com o node de `/home/igor/.local/bin/node`:

```bash
node mapa.mjs
node importar.mjs --seco
node enviar.mjs --seco --gravar
```

Isso reescreve este diretório (`MAPA-BASE.md` e `LISTA-ENVIO.md`) com o telefone só nos 4 últimos dígitos. `--seco` não cria contato e não manda mensagem.

## 4. Importar contatos

```bash
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

```bash
cp /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.service /home/igor/.config/systemd/user/
cp /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.timer /home/igor/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ativacao-zap.timer
systemctl --user list-timers ativacao-zap.timer
```

O timer acorda a cada minuto, seg–sáb, das 9h às 18h. Cada acordada manda no máximo uma mensagem, se a janela, o intervalo e os tetos deixarem: 12 por dia, 3 por hora, espera aleatória de 4 a 10 minutos. Pula quem já respondeu e quem tem etiqueta `parar-contato` ou `cliente-antigo`.

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

## Texto e preço

A Lívia fala como pessoa da equipe. A primeira mensagem não diz que é IA e não pede "responda SAIR". Se perguntarem direto: "Sou a assistente virtual da OLLI." Quem pede para parar, para na hora (etiqueta `parar-contato`). Preço só de tabela: Pro R$ 39 e Empresa R$ 99. Link: https://olliorcamentos.online

Pedido de humano, preço fora da tabela ou reclamação: nota na conversa e aviso para o Igor. A conversa sai do robô.

## O que este item não faz

Não publica o app, não mexe em olliorcamentos.online nem em ollizap.online, não altera Auth, DNS nem Cloudflare, e não aplica migration.
