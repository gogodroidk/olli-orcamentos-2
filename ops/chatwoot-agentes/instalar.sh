#!/bin/sh
# Copia o pacote para o lugar fixo que a Receita e o .service usam e deixa o .service no systemd do usuário (sem ativar).
set -eu
ORIGEM=$(cd "$(dirname "$0")" && pwd)
DEST=/home/igor/chatwoot-central/agentes
mkdir -p "$DEST" "$HOME/.config/systemd/user"
for f in lib.mjs agentes.json travas.mjs decidir.mjs cw.mjs acordador.mjs sincronizar.mjs conferir-pendentes.mjs \
         criar-agentes.mjs criar-usuarios.rb registrar-webhook.mjs funil-e-respostas.mjs; do
  cp "$ORIGEM/$f" "$DEST/$f"
done
mkdir -p "$DEST/avatares" && cp "$ORIGEM"/avatares/*.png "$DEST/avatares/" 2>/dev/null || true
cp "$ORIGEM/chatwoot-acordador.service" "$HOME/.config/systemd/user/chatwoot-acordador.service"
echo "instalado em $DEST; para ligar: systemctl --user daemon-reload && systemctl --user enable --now chatwoot-acordador.service"
