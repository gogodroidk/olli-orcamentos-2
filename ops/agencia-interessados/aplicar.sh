#!/bin/bash
# Copia os módulos para a Central. Não reinicia container, não ativa timer, não envia mensagem.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")" && pwd)"
DEST="/home/igor/chatwoot-central/campanhas/interessados"
mkdir -p "$DEST/systemd"
cp "$RAIZ/interesse.mjs" "$RAIZ/fila.mjs" "$RAIZ/resumo.mjs" "$RAIZ/visao.mjs" "$RAIZ/resumir.mjs" "$RAIZ/visao-cli.mjs" "$DEST/"
cp "$RAIZ/systemd/interessados-resumo.service" "$RAIZ/systemd/interessados-resumo.timer" "$DEST/systemd/"
cp "$RAIZ/interesse.mjs" /home/igor/chatwoot-central/bot/interesse.mjs
cp "$RAIZ/fila.mjs" /home/igor/chatwoot-central/painel/interessados.mjs
echo "copiado. container nao reiniciado. timer nao ativado."
