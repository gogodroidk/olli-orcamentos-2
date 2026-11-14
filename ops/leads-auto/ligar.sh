#!/bin/bash
# Liga o caçador semanal. Não manda WhatsApp. Sem --ligar, só mostra o comando.
set -euo pipefail
RAIZ="/home/igor/wt/grok-GZ-LEADS-AUTO"
UNIDADE="${HOME}/.config/systemd/user"
if [[ "${1:-}" != "--ligar" ]]; then
  printf '%s\n' "Não liguei. O Salomão liga com:" \
    "bash ${RAIZ}/ops/leads-auto/ligar.sh --ligar" \
    "Para desligar: systemctl --user disable --now leads-auto.timer"
  exit 0
fi
mkdir -p "${UNIDADE}"
cp "${RAIZ}/ops/leads-auto/systemd/leads-auto.service" "${RAIZ}/ops/leads-auto/systemd/leads-auto.timer" "${UNIDADE}/"
systemctl --user daemon-reload
systemctl --user enable --now leads-auto.timer
printf '%s\n' "Ligado. Segunda 07:10, no máximo 30 empresas, uma página por vez. Não manda WhatsApp."
