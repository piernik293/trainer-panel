#!/bin/bash
# Straż: co 5 minut sprawdza API, panel i portal. Po 2 kolejnych nieudanych sprawdzeniach wysyła mail do właściciela
# (OWNER_NOTIFY_EMAIL z .env; najwyżej 1 na godzinę), a po powrocie usług — mail „działa znowu”.
# Log: ~/logs/watchdog.log; stan: ~/logs/watchdog.state. Nie restartuje niczego i nie zmienia danych.
# Zmienne do testów: WATCHDOG_API_URL / _PANEL_URL / _PORTAL_URL, WATCHDOG_STATE, WATCHDOG_LOG, WATCHDOG_NOW (sekundy),
# WATCHDOG_DRY_RUN=1 (mail tylko do logu), WATCHDOG_ENV=0 (nie wczytuj .env).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="${WATCHDOG_LOG:-$HOME/logs/watchdog.log}"; STATE="${WATCHDOG_STATE:-$HOME/logs/watchdog.state}"
mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
API_URL="${WATCHDOG_API_URL:-http://127.0.0.1:8080/api/healthz}"
PANEL_URL="${WATCHDOG_PANEL_URL:-http://127.0.0.1:23889/}"
PORTAL_URL="${WATCHDOG_PORTAL_URL:-http://127.0.0.1:22347/client-landing/}"
MAIL_GAP=3600; NEED_FAILS=2
now() { echo "${WATCHDOG_NOW:-$(date +%s)}"; }
say() { echo "$(date -d "@$(now)" '+%F %T') $*" >> "$LOG"; }

exec 9>"$STATE.lock"; flock -n 9 || exit 0   # jedno sprawdzenie naraz

if [ "${WATCHDOG_ENV:-1}" = "1" ] && [ -f "$ROOT/.env" ]; then set -a; . "$ROOT/.env"; set +a; fi

fails=0; last_mail=0; alerted=0; down_list=""
[ -f "$STATE" ] && . "$STATE"

check() { # nazwa url
  local code; code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$2" 2>/dev/null || true)
  [ "$code" = "200" ] && return 0
  down_list="${down_list:+$down_list, }$1 (${code:-brak})"; return 1
}
down_list=""
check "API" "$API_URL"; check "panel" "$PANEL_URL"; check "portal" "$PORTAL_URL"

send() { # temat treść
  if [ "${WATCHDOG_DRY_RUN:-0}" = "1" ]; then say "MAIL (próba): $1"; return 0; fi
  if node "$ROOT/scripts/watchdog-mail.mjs" "$1" "$2" >/dev/null 2>&1; then say "mail wysłany: $1"; else say "MAIL NIEUDANY: $1 (sprawdź SMTP/OWNER_NOTIFY_EMAIL)"; fi
}

t=$(now)
if [ -z "$down_list" ]; then
  if [ "$alerted" = "1" ]; then
    send "[Optimatren] Działa znowu" "Panel, portal i API odpowiadają poprawnie (sprawdzono $(date -d "@$t" '+%F %T'))."
  fi
  [ "$fails" -gt 0 ] && say "OK (po $fails nieudanych)" || say "OK"
  fails=0; alerted=0
else
  fails=$((fails + 1)); say "AWARIA ($fails): $down_list"
  if [ "$fails" -ge "$NEED_FAILS" ] && [ $((t - last_mail)) -ge "$MAIL_GAP" ]; then
    send "[Optimatren] Awaria: nie odpowiada $down_list" "Nie odpowiada: $down_list. To $fails. nieudane sprawdzenie z rzędu (co 5 minut), ostatnie: $(date -d "@$t" '+%F %T'). Sprawdź maszynę: scripts/dev-gcp.sh, ~/logs/watchdog.log."
    last_mail=$t; alerted=1
  fi
fi
printf 'fails=%s\nlast_mail=%s\nalerted=%s\n' "$fails" "$last_mail" "$alerted" > "$STATE"

# log nie rośnie bez końca (ostatnie 5000 linii)
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 8000 ]; then tail -n 5000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
exit 0
