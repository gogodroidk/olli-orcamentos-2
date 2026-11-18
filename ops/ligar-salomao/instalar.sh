#!/bin/bash
# Instala/atualiza o "Ligar pro Salomão" numa cópia fixa (~/.local/share/olli-ligar-salomao), para o serviço não depender
# de worktree (P2 do LIVRE, 18/11). NÃO ativa nada: só copia. Ativar: ver README.
set -euo pipefail
ORIG="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.local/share/olli-ligar-salomao"
mkdir -p "$DEST" "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.config/systemd/user"
rsync -a --delete --exclude teste.mjs --exclude '*.service' --exclude '*.desktop' --exclude instalar.sh --exclude olli-ligar-salomao.sh \
  "$ORIG/lib" "$ORIG/public" "$ORIG/server.mjs" "$ORIG/README.md" "$DEST/"
install -m 0755 "$ORIG/olli-ligar-salomao.sh" "$HOME/.local/bin/olli-ligar-salomao"
install -m 0644 "$ORIG/olli-ligar-salomao.service" "$HOME/.config/systemd/user/olli-ligar-salomao.service"
install -m 0644 "$ORIG/ligar-salomao.desktop" "$HOME/.local/share/applications/ligar-salomao.desktop"
echo "instalado em $DEST (versão $(git -C "$ORIG" rev-parse --short HEAD 2>/dev/null || echo '?'))"
echo "se o serviço já estiver ativo: systemctl --user restart olli-ligar-salomao.service"
