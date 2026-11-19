#!/bin/sh
# CQ-CENTRAL-FICHA — instala a ficha no pacote vivo SÓ depois do parecer do LIVRE.
#   sh instalar-ficha.sh            instala. O backup ORIGINAL (antes da 1ª instalação) fica em
#                                   /home/igor/chatwoot-central/agentes.bak-ficha-ORIGINAL e NUNCA é sobrescrito; cada instalação
#                                   ainda guarda uma cópia datada (agentes.bak-ficha-<data>) só para auditoria.
#   sh instalar-ficha.sh --desfazer volta SEMPRE ao ORIGINAL, remove o ficha.mjs e reverte o webhook para message_created.
# Depois de instalar: reiniciar o acordador (systemctl --user restart chatwoot-acordador.service) e rodar
#   node registrar-webhook.mjs   (passa a ouvir também conversation_updated, para a etiqueta parar-contato posta na tela)
# Se o --desfazer não conseguir reverter o webhook, ele imprime o PATCH exato (sem segredo) para fazer à mão.
set -eu
ORIGEM=$(cd "$(dirname "$0")" && pwd)
DEST=${FICHA_DEST:-/home/igor/chatwoot-central/agentes}
ARQ="cw.mjs acordador.mjs registrar-webhook.mjs"
ORIG="$DEST.bak-ficha-ORIGINAL"
if [ "${1:-}" = "--desfazer" ]; then
  [ -d "$ORIG" ] || { echo "sem backup ORIGINAL ($ORIG) para restaurar" >&2; exit 1; }
  # 1) webhook primeiro, com o registrar-webhook.mjs NOVO (o restaurado não conhece --reverter)
  if [ "${FICHA_SEM_WEBHOOK:-}" = "1" ] || ! node "$ORIGEM/registrar-webhook.mjs" --reverter; then
    echo "AVISO: webhook NÃO revertido por aqui. Faça à mão (conjunto original = message_created):" >&2
    echo "  curl -X PATCH -H \"api_access_token: \$CHATWOOT_TOKEN_ADMIN\" -H 'Content-Type: application/json' -d '{\"webhook\":{\"subscriptions\":[\"message_created\"]}}' http://127.0.0.1:3010/api/v1/accounts/2/webhooks/<ID do webhook do acordador>" >&2
  fi
  # 2) arquivos
  for f in $ARQ; do cp "$ORIG/$f" "$DEST/$f"; done
  rm -f "$DEST/ficha.mjs"
  echo "desfeito: restaurado de $ORIG e ficha.mjs removido. Reinicie: systemctl --user restart chatwoot-acordador.service"
  exit 0
fi
if [ ! -d "$ORIG" ]; then
  LEGADO=$(ls -d "$DEST".bak-ficha-[0-9]* 2>/dev/null | sort | head -1 || true)   # instalação antiga (script sem ORIGINAL): o mais antigo é o original
  if [ -n "$LEGADO" ]; then cp -a "$LEGADO" "$ORIG"
  else
    mkdir -p "$ORIG.tmp"
    for f in $ARQ ficha.mjs; do [ -f "$DEST/$f" ] && cp "$DEST/$f" "$ORIG.tmp/$f"; done
    mv "$ORIG.tmp" "$ORIG"
  fi
fi
BAK="$DEST.bak-ficha-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BAK"
for f in $ARQ ficha.mjs; do [ -f "$DEST/$f" ] && cp "$DEST/$f" "$BAK/$f"; done
for f in $ARQ ficha.mjs; do cp "$ORIGEM/$f" "$DEST/$f"; done
echo "instalado. original em $ORIG (intocado), cópia desta instalação em $BAK. Desfazer: sh $ORIGEM/instalar-ficha.sh --desfazer"
