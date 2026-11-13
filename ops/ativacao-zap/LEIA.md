# Ativação WhatsApp da OLLI (cópia para revisão)

O código que roda está em `/home/igor/chatwoot-central/ativacao/` e no robô em `/home/igor/chatwoot-central/bot/`. Esta pasta é a cópia versionada. O app olliorcamentos.online não importa estes arquivos. Não há migration para aplicar.

O passo a passo de ligar, parar e voltar atrás está em:

`/home/igor/Desktop/Entregas Claude/OLLI/2026-11-13-ativacao-zap/HANDOFF.md`

O timer não vai ligado neste PR. `--teste --gravar` não reescreve `LISTA-ENVIO.md`. A lista oficial só sai de `node enviar.mjs --seco --gravar`, sem `--teste`. A janela continua seg–sáb, 9h–18h: o expediente seg–sex da caixa não encolhe o envio.

O comando único, quando o Salomão revisar a lista e decidir:

```bash
cp /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.service /home/igor/chatwoot-central/ativacao/systemd/ativacao-zap.timer /home/igor/.config/systemd/user/ && systemctl --user daemon-reload && systemctl --user enable --now ativacao-zap.timer && systemctl --user list-timers ativacao-zap.timer
```

Parar: `systemctl --user disable --now ativacao-zap.timer`

`base.json` fica fora do git (chmod 600). Com a supressão acima de 24 h, o envio recusa.

Testes, no node local, sem rede:

```bash
node --test ops/ativacao-zap/*.test.js ops/ativacao-zap/bot/*.test.js
```
