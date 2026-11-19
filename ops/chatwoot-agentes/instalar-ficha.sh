#!/bin/sh
# CQ-CENTRAL-FICHA — instala a ficha no pacote vivo SÓ depois do parecer do LIVRE. Antes de copiar, faz backup do que existe.
#   sh instalar-ficha.sh            instala (backup em /home/igor/chatwoot-central/agentes.bak-ficha-<data>)
#   sh instalar-ficha.sh --desfazer restaura o backup mais recente e remove o ficha.mjs
# Depois de instalar: reiniciar o acordador (systemctl --user restart chatwoot-acordador.service) e rodar
#   node registrar-webhook.mjs   (passa a ouvir também conversation_updated, para a etiqueta parar-contato posta na tela)
set -eu
ORIGEM=$(cd "$(dirname "$0")" && pwd)
DEST=/home/igor/chatwoot-central/agentes
ARQ="cw.mjs acordador.mjs registrar-webhook.mjs"
if [ "${1:-}" = "--desfazer" ]; then
  BAK=$(ls -d "$DEST".bak-ficha-* 2>/dev/null | sort | tail -1)
  [ -n "$BAK" ] || { echo "sem backup para restaurar" >&2; exit 1; }
  for f in $ARQ; do cp "$BAK/$f" "$DEST/$f"; done
  rm -f "$DEST/ficha.mjs"
  echo "desfeito: restaurado de $BAK e ficha.mjs removido. Reinicie: systemctl --user restart chatwoot-acordador.service"
  exit 0
fi
BAK="$DEST.bak-ficha-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BAK"
for f in $ARQ ficha.mjs; do [ -f "$DEST/$f" ] && cp "$DEST/$f" "$BAK/$f"; done
for f in $ARQ ficha.mjs; do cp "$ORIGEM/$f" "$DEST/$f"; done
echo "instalado. backup em $BAK. Desfazer: sh $ORIGEM/instalar-ficha.sh --desfazer"
