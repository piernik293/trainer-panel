#!/usr/bin/env bash
# Uruchamia API (8080), portal klienta (22347) i panel trenera (23889)
# na własnym serwerze tmux (gniazdo "trainer-panel-app", sesja "trainer-panel"), tylko na 127.0.0.1 (dostęp przez tunel SSH).
# Logi: ~/logs/trainer-panel/*.log. Podgląd: tmux -L trainer-panel-app attach -t trainer-panel
# Wejście w przeglądarce (przez tunel SSH): http://localhost:23889
# Zmienne do testów (scripts/test-tmux-izolacja.sh): APP_TMUX_SOCKET, APP_ENV_FILE, API_CMD, PORTAL_CMD, PANEL_CMD.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib-app-tmux.sh
. "$ROOT/scripts/lib-app-tmux.sh"
LOG_DIR="${LOG_DIR:-$HOME/logs/trainer-panel}"
ENV_FILE="${APP_ENV_FILE:-$ROOT/.env}"
SESSION="$APP_SESSION"

if [ ! -f "$ENV_FILE" ]; then
  echo "Brak $ENV_FILE (skopiuj .env.example)" >&2
  exit 1
fi
if app_tmux has-session -t "=$SESSION" 2>/dev/null; then
  echo "Sesja tmux '$SESSION' już działa. Zatrzymaj: scripts/stop-gcp.sh" >&2
  exit 1
fi
mkdir -p "$LOG_DIR"

API_CMD="${API_CMD:-HOST=127.0.0.1 PORT=8080 pnpm --filter @workspace/api-server run dev}"
PORTAL_CMD="${PORTAL_CMD:-PORT=22347 BASE_PATH=/client-landing/ pnpm --filter @workspace/client-landing exec vite --config vite.config.ts --host 127.0.0.1}"
PANEL_CMD="${PANEL_CMD:-PORT=23889 BASE_PATH=/ pnpm --filter @workspace/trainer-app exec vite --config vite.config.ts --host 127.0.0.1}"

# Każde okno tmux wczytuje .env samodzielnie: serwer tmux mógł wystartować
# wcześniej z innym środowiskiem, więc nie polegamy na dziedziczeniu zmiennych.
# Jeden origin jak w Replit: panel trenera przekazuje /api i /client-landing dalej.
ENV_SETUP="set -a; . '$ENV_FILE'; set +a; \
export LOCAL_API_SERVER_URL=\"\${LOCAL_API_SERVER_URL:-http://localhost:8080}\"; \
export LOCAL_CLIENT_PORTAL_DEV_URL=\"\${LOCAL_CLIENT_PORTAL_DEV_URL:-http://localhost:22347}\"; \
export LOCAL_TRAINER_APP_ORIGIN=\"\${LOCAL_TRAINER_APP_ORIGIN:-http://localhost:23889}\"; \
export LOCAL_CLIENT_PORTAL_ORIGIN=\"\${LOCAL_CLIENT_PORTAL_ORIGIN:-http://localhost:23889}\"; \
export TRAINER_SIGNUP_OPEN='${TRAINER_SIGNUP_OPEN:-}'"

run() { # nazwa, komenda
  app_tmux new-window -t "=$SESSION" -n "$1" \
    "cd '$ROOT' && $ENV_SETUP && $2 2>&1 | tee -a '$LOG_DIR/$1.log'; echo '[$1 zakończony]'; sleep 86400"
}

app_tmux new-session -d -s "$SESSION" -n shell -c "$ROOT"
run api "$API_CMD"
run portal "$PORTAL_CMD"
run panel "$PANEL_CMD"

echo "Uruchomiono na osobnym serwerze tmux (podgląd: tmux -L $APP_TMUX_SOCKET attach -t $SESSION)."
echo "Logi: $LOG_DIR/{api,portal,panel}.log"
echo "Health: curl -s http://localhost:8080/api/healthz"
