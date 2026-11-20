#!/bin/sh
# Copia o pacote para chatwoot-central/chatwoot-claude (backup se já existir). NÃO ativa nada, NÃO reinicia contêiner.
set -eu
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
DEST=/home/igor/chatwoot-central/chatwoot-claude
if [ -d "$DEST" ]; then cp -a "$DEST" "$DEST.bak-$(date +%Y%m%d-%H%M)"; fi
mkdir -p "$DEST"
cp -a "$ORIGEM"/*.mjs "$ORIGEM"/config.json "$ORIGEM"/precos.json "$ORIGEM"/dados "$DEST"/
mkdir -p /home/igor/.config/systemd/user
cp "$ORIGEM/chatwoot-claude.service" /home/igor/.config/systemd/user/
echo "Instalado em $DEST. Serviço copiado e NÃO ativado. Ver LEIA.md (passos 3 a 6)."
