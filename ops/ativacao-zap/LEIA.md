# Ativação WhatsApp da OLLI (cópia para revisão)

O código que roda está em `/home/igor/chatwoot-central/ativacao/` e no robô em `/home/igor/chatwoot-central/bot/`. Esta pasta é a cópia versionada. O app olliorcamentos.online não importa estes arquivos. Não há migration para aplicar.

O passo a passo de ligar, parar e voltar atrás está em:

`/home/igor/Desktop/Entregas Claude/OLLI/2026-11-13-ativacao-zap/HANDOFF.md`

O timer não vai ligado neste PR. O comando, quando o Salomão decidir:

```bash
cp /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.service /home/igor/.config/systemd/user/
cp /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.timer /home/igor/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now ativacao-zap.timer
```

Parar: `systemctl --user disable --now ativacao-zap.timer`

Antes disso o Salomão grava `base.json` (chmod 600, fora do git) com o resultado de `mapa.sql` e atualiza a supressão. Sem base e com a supressão velha, o envio recusa.

Testes, no node local, sem rede:

```bash
node --test /home/igor/chatwoot-central/ativacao/*.test.js /home/igor/chatwoot-central/bot/*.test.js
```

31 testes passaram em 13/11/2026. O robô ao vivo já foi reiniciado (`central-bot-central-bot-1`) e o `/health` respondeu `ok`. Backup do robô anterior: `/home/igor/chatwoot-central/_bak-bot-13-11-ativacao/`.
