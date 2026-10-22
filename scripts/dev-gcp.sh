#!/usr/bin/env bash
# Uruchamia API (8080), portal klienta (22347) i panel trenera (23889)
# w sesji tmux "trainer-panel", tylko na 127.0.0.1 (dostęp przez tunel SSH). Logi: ~/logs/trainer-panel/*.log
# Wejście w przeglądarce (przez tunel SSH): http://localhost:23889
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$HOME/logs/trainer-panel}"
SESSION="trainer-panel"

if [ ! -f "$ROOT/.env" ]; then
  echo "Brak $ROOT/.env (skopiuj .env.example)" >&2
  exit 1
fi
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Sesja tmux '$SESSION' już działa. Zatrzymaj: scripts/stop-gcp.sh" >&2
  exit 1
fi
mkdir -p "$LOG_DIR"

# Każde okno tmux wczytuje .env samodzielnie: serwer tmux mógł wystartować
# wcześniej z innym środowiskiem, więc nie polegamy na dziedziczeniu zmiennych.
# Jeden origin jak w Replit: panel trenera przekazuje /api i /client-landing dalej.
ENV_SETUP="set -a; . '$ROOT/.env'; set +a; \
export LOCAL_API_SERVER_URL=\"\${LOCAL_API_SERVER_URL:-http://localhost:8080}\"; \
export LOCAL_CLIENT_PORTAL_DEV_URL=\"\${LOCAL_CLIENT_PORTAL_DEV_URL:-http://localhost:22347}\"; \
export LOCAL_TRAINER_APP_ORIGIN=\"\${LOCAL_TRAINER_APP_ORIGIN:-http://localhost:23889}\"; \
export LOCAL_CLIENT_PORTAL_ORIGIN=\"\${LOCAL_CLIENT_PORTAL_ORIGIN:-http://localhost:23889}\""

run() { # nazwa, komenda
  tmux new-window -t "$SESSION" -n "$1" \
    "cd '$ROOT' && $ENV_SETUP && $2 2>&1 | tee -a '$LOG_DIR/$1.log'; echo '[$1 zakończony]'; sleep 86400"
}

tmux new-session -d -s "$SESSION" -n shell -c "$ROOT"
run api "HOST=127.0.0.1 PORT=8080 pnpm --filter @workspace/api-server run dev"
run portal "PORT=22347 BASE_PATH=/client-landing/ pnpm --filter @workspace/client-landing exec vite --config vite.config.ts --host 127.0.0.1"
run panel "PORT=23889 BASE_PATH=/ pnpm --filter @workspace/trainer-app exec vite --config vite.config.ts --host 127.0.0.1"

echo "Uruchomiono w tmux '$SESSION' (podgląd: tmux attach -t $SESSION)."
echo "Logi: $LOG_DIR/{api,portal,panel}.log"
echo "Health: curl -s http://localhost:8080/api/healthz"
