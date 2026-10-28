#!/usr/bin/env bash
# Test: dev-gcp.sh i stop-gcp.sh nie ruszają sesji użytkownika ("claude"), domyślnego serwera tmux ani obcych procesów.
# Używa atrapy serwera "użytkownika" (osobne gniazdo), atrap aplikacji (python http.server) i wolnych portów — nie dotyka prawdziwej aplikacji.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUF="$$"
USER_SOCK="qa-user-$SUF"; APP_SOCK="qa-app-$SUF"
P1=$((30000 + RANDOM % 5000)); P2=$((P1 + 1)); PF=$((P1 + 2))
ENVF="$(mktemp)"; LOGD="$(mktemp -d)"
fail=0; ok() { echo "  OK   $1"; }; bad() { echo "  BŁĄD $1"; fail=1; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
cleanup() {
  tmux -L "$USER_SOCK" kill-server 2>/dev/null; tmux -L "$APP_SOCK" kill-server 2>/dev/null
  [ -n "${FOREIGN:-}" ] && kill "$FOREIGN" 2>/dev/null
  rm -f "$ENVF"; rm -rf "$LOGD"
}
trap cleanup EXIT

# „sesja użytkownika”: serwer z sesjami "claude" i "trainer-panel-inna" oraz STARĄ sesją "trainer-panel"
tmux -L "$USER_SOCK" new-session -d -s claude 'sleep 600'
tmux -L "$USER_SOCK" new-session -d -s trainer-panel-inna 'sleep 600'
tmux -L "$USER_SOCK" new-session -d -s trainer-panel 'sleep 600'
# obcy proces na porcie z listy portów aplikacji (katalog roboczy poza repozytorium)
( cd /tmp && exec python3 -m http.server "$PF" --bind 127.0.0.1 >/dev/null 2>&1 ) & FOREIGN=$!
sleep 1

export APP_TMUX_SOCKET="$APP_SOCK" LEGACY_TMUX_SOCKET="$USER_SOCK" APP_ENV_FILE="$ENVF" LOG_DIR="$LOGD" APP_PORTS="$P1 $P2 $PF"
export API_CMD="python3 -m http.server $P1 --bind 127.0.0.1" PORTAL_CMD="python3 -m http.server $P2 --bind 127.0.0.1" PANEL_CMD="sleep 600"

echo "== start"
"$ROOT/scripts/dev-gcp.sh" >/dev/null 2>&1; sleep 2
check "aplikacja działa na własnym serwerze tmux" "tmux -L $APP_SOCK has-session -t =trainer-panel"
check "port atrapy API nasłuchuje" "ss -ltn 'sport = :$P1' | grep -q $P1"
check "drugie uruchomienie jest odrzucone (sesja już działa)" "! $ROOT/scripts/dev-gcp.sh >/dev/null 2>&1"
check "start nie dotknął sesji użytkownika" "tmux -L $USER_SOCK has-session -t =claude"

echo "== stop"
OUT="$("$ROOT/scripts/stop-gcp.sh" 2>&1)"; echo "$OUT" | sed 's/^/     /'
sleep 1
check "serwer tmux aplikacji zamknięty" "! tmux -L $APP_SOCK has-session -t =trainer-panel 2>/dev/null"
check "porty atrap aplikacji zwolnione" "! ss -ltn 'sport = :$P1' | grep -q $P1 && ! ss -ltn 'sport = :$P2' | grep -q $P2"
check "serwer „użytkownika” nadal działa" "tmux -L $USER_SOCK ls >/dev/null 2>&1"
check "sesja „claude” przeżyła" "tmux -L $USER_SOCK has-session -t =claude"
check "sesja o podobnej nazwie (trainer-panel-inna) przeżyła" "tmux -L $USER_SOCK has-session -t =trainer-panel-inna"
check "stara sesja „trainer-panel” została posprzątana" "! tmux -L $USER_SOCK has-session -t =trainer-panel 2>/dev/null"
check "obcy proces na porcie z listy przeżył" "kill -0 $FOREIGN 2>/dev/null"

echo "== stop, gdy nic nie działa"
check "drugi stop kończy się bez błędu" "$ROOT/scripts/stop-gcp.sh >/dev/null 2>&1"
check "po drugim stopie sesja „claude” nadal żyje" "tmux -L $USER_SOCK has-session -t =claude"

echo "== skrypty nie zawierają niebezpiecznych poleceń"
check "brak 'kill-server' bez gniazda aplikacji" "! grep -nE '(^|[^_a-z])tmux +kill-server' $ROOT/scripts/stop-gcp.sh $ROOT/scripts/dev-gcp.sh"
check "kill-server tylko przez app_tmux" "[ \$(grep -c 'kill-server' $ROOT/scripts/stop-gcp.sh) -ge 1 ] && ! grep -v 'app_tmux kill-server' $ROOT/scripts/stop-gcp.sh | grep -E '^[^#]*kill-server'"
[ $fail = 0 ] && echo "WSZYSTKO OK" || { echo "BŁĘDY"; exit 1; }
