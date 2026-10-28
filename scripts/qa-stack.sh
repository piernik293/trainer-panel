#!/usr/bin/env bash
# Osobny stos QA (API 18090, panel 23890, portal 22390; tylko 127.0.0.1) na OSOBNEJ bazie: schemat `qa` w trainer_panel_test (kopia bazy aplikacji).
# Baza aplikacji nie jest ruszana, maile nie są wysyłane (SMTP i adres właściciela wyczyszczone w procesach QA), rejestracja trenerów zamknięta jak na becie.
#   scripts/qa-stack.sh reset-db          # tworzy schemat `qa` od nowa jako kopię bazy aplikacji (kasuje tylko schemat `qa` w bazie testowej)
#   scripts/qa-stack.sh start <ID_ADMINA_CLERK>   # uruchamia API, panel i portal (administrator tylko w tych procesach)
#   scripts/qa-stack.sh stop | status
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
APP_URL="$DATABASE_URL"; BASE="${DATABASE_URL%/*}"; TEST_URL="$BASE/trainer_panel_test"
QA_DB="$TEST_URL?options=-c%20search_path%3Dqa"
LOG="$HOME/logs/qa"; PIDS="$LOG/pids"; mkdir -p "$LOG"
case "${1:-}" in
  reset-db)
    psql "$TEST_URL" -q -c "DROP SCHEMA IF EXISTS qa CASCADE; CREATE SCHEMA qa;"
    pg_dump --no-owner --no-privileges "$APP_URL" | sed 's/\bpublic\./qa./g' | psql "$TEST_URL" -q -v ON_ERROR_STOP=0 >"$LOG/reset-db.log" 2>&1 || true
    psql "$TEST_URL" -At -c "select 'schemat qa: ćwiczeń', count(*) from qa.exercises; select 'trenerów', count(*) from qa.trainers; select 'klientów', count(*) from qa.clients" ;;
  start)
    ADMIN="${2:?podaj identyfikator konta administratora QA (Clerk)}"
    [ -f "$PIDS" ] && { echo "Stos QA już działa? (scripts/qa-stack.sh stop)"; exit 1; }
    : > "$PIDS"
    QAENV="export DATABASE_URL='$QA_DB' APP_ADMIN_CLERK_IDS='$ADMIN' TRAINER_CLERK_IDS='' TRAINER_SIGNUP_OPEN='' SMTP_HOST='' SMTP_USER='' SMTP_PASS='' SMTP_FROM='' ADMIN_EMAIL='' OWNER_NOTIFY_EMAIL='' \
      LOCAL_API_SERVER_URL=http://localhost:18090 LOCAL_CLIENT_PORTAL_DEV_URL=http://localhost:22390 LOCAL_TRAINER_APP_ORIGIN=http://localhost:23890 LOCAL_CLIENT_PORTAL_ORIGIN=http://localhost:23890 NODE_ENV=development"
    cd "$ROOT"
    nohup bash -c "$QAENV; HOST=127.0.0.1 PORT=18090 node --enable-source-maps artifacts/api-server/dist/index.mjs" >"$LOG/api.log" 2>&1 & echo $! >> "$PIDS"
    nohup bash -c "$QAENV; cd artifacts/client-landing && PORT=22390 BASE_PATH=/client-landing/ pnpm exec vite --config vite.config.ts --host 127.0.0.1" >"$LOG/portal.log" 2>&1 & echo $! >> "$PIDS"
    nohup bash -c "$QAENV; cd artifacts/trainer-app && PORT=23890 BASE_PATH=/ pnpm exec vite --config vite.config.ts --host 127.0.0.1" >"$LOG/panel.log" 2>&1 & echo $! >> "$PIDS"
    sleep 10; "$0" status ;;
  stop)
    [ -f "$PIDS" ] || { echo "Stos QA nie działa."; exit 0; }
    for p in $(cat "$PIDS"); do pkill -TERM -P "$p" 2>/dev/null || true; kill "$p" 2>/dev/null || true; done
    for port in 18090 22390 23890; do for p in $(ss -ltnp 2>/dev/null | grep ":$port " | grep -oE "pid=[0-9]+" | cut -d= -f2 | sort -u); do kill "$p" 2>/dev/null || true; done; done
    rm -f "$PIDS"; echo "Zatrzymano stos QA." ;;
  status)
    for port in 18090 22390 23890; do printf "port %s: " "$port"; (ss -ltn | grep -q ":$port ") && echo działa || echo nie działa; done
    curl -s http://localhost:18090/api/healthz; echo ;;
  *) echo "użycie: $0 reset-db | start <ID_ADMINA> | stop | status"; exit 2 ;;
esac
