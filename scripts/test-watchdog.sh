#!/bin/bash
# Test straży (scripts/watchdog.sh) na atrapie usługi: bez prawdziwej poczty (WATCHDOG_DRY_RUN=1), bez .env, w katalogu tymczasowym.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T=$(mktemp -d); trap 'kill $SRV 2>/dev/null; rm -rf "$T"' EXIT
PORT=$((20000 + RANDOM % 10000)); echo ok > "$T/index.html"
start() { python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$T" >/dev/null 2>&1 & SRV=$!; sleep 0.7; }
stop() { kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; sleep 0.3; }
export WATCHDOG_ENV=0 WATCHDOG_DRY_RUN=1 WATCHDOG_STATE="$T/state" WATCHDOG_LOG="$T/log"
export WATCHDOG_API_URL="http://127.0.0.1:$PORT/index.html" WATCHDOG_PANEL_URL="http://127.0.0.1:$PORT/index.html" WATCHDOG_PORTAL_URL="http://127.0.0.1:$PORT/index.html"
BAD=0; ok() { echo "  OK   $1"; }; bad() { echo "  BŁĄD $1"; BAD=1; }
mails() { grep -c 'MAIL (próba)' "$T/log" 2>/dev/null || true; }
run() { WATCHDOG_NOW=$1 "$ROOT/scripts/watchdog.sh"; }
N=1000000

start
run $N; [ "$(mails)" = "0" ] && ok "usługi działają: brak maila" || bad "mail przy zdrowych usługach"
stop
run $((N + 300)); [ "$(mails)" = "0" ] && ok "1. nieudane sprawdzenie: brak maila" || bad "mail po pierwszym błędzie"
run $((N + 600)); [ "$(mails)" = "1" ] && ok "2. nieudane sprawdzenie: mail o awarii" || bad "brak maila po dwóch błędach"
run $((N + 900)); [ "$(mails)" = "1" ] && ok "kolejny błąd w ciągu godziny: bez drugiego maila" || bad "drugi mail w ciągu godziny"
run $((N + 600 + 3700)); [ "$(mails)" = "2" ] && ok "po godzinie awarii: przypomnienie" || bad "brak przypomnienia po godzinie"
start
run $((N + 600 + 4000)); [ "$(mails)" = "3" ] && grep -q 'Działa znowu' "$T/log" && ok "po powrocie: mail „działa znowu”" || bad "brak maila o powrocie"
run $((N + 600 + 4300)); [ "$(mails)" = "3" ] && ok "kolejne sprawdzenie OK: bez maila" || bad "nadmiarowy mail po powrocie"
grep -q 'AWARIA (1)' "$T/log" && grep -q 'OK' "$T/log" && ok "log zawiera awarie i powroty" || bad "log niepełny"
stop; WATCHDOG_NOW=$((N + 9000)) "$ROOT/scripts/watchdog.sh"; run $((N + 9300))
[ "$(mails)" = "4" ] && ok "nowa awaria po powrocie: znowu mail po 2 błędach" || bad "brak maila przy nowej awarii"
[ "$BAD" = "0" ] && echo "WSZYSTKO OK" || { echo "SĄ BŁĘDY"; echo "--- log:"; cat "$T/log"; exit 1; }
