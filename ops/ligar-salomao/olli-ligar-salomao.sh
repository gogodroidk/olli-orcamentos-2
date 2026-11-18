#!/bin/bash
# Botão "Ligar pro Salomão": garante o servidor (serviço olli-ligar-salomao) e abre/reaproveita a aba no Chrome do Igor.
URL="http://127.0.0.1:8796/ligar/"
if ! curl -s -m 2 -o /dev/null "${URL}api/saude"; then
  systemctl --user start olli-ligar-salomao.service 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 -o /dev/null "${URL}api/saude" && break; sleep 0.5; done
fi
ID=$(curl -s -m 3 http://127.0.0.1:9222/json/list 2>/dev/null | python3 -c "import sys,json
try:
  print(next(t['id'] for t in json.load(sys.stdin) if t.get('type')=='page' and t.get('url','').startswith('http://127.0.0.1:8796/ligar')))
except Exception: pass" 2>/dev/null)
if [ -n "$ID" ]; then curl -s -m 3 "http://127.0.0.1:9222/json/activate/$ID" >/dev/null; else /home/igor/.local/bin/abrir-aba "$URL" >/dev/null; fi
command -v wmctrl >/dev/null 2>&1 && wmctrl -a "Google Chrome" 2>/dev/null || true
