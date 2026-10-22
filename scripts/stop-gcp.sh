#!/usr/bin/env bash
# Zatrzymuje procesy uruchomione przez scripts/dev-gcp.sh.
set -euo pipefail

SESSION="trainer-panel"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
  echo "Zatrzymano sesję tmux '$SESSION'."
else
  echo "Sesja '$SESSION' nie działa."
fi

# Pozostałości (np. proces node odłączony od tmux) na portach aplikacji.
for port in 8080 22347 23889; do
  pid="$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
  if [ -n "$pid" ]; then
    kill "$pid" && echo "Zatrzymano proces $pid na porcie $port."
  fi
done
