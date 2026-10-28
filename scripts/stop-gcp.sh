#!/usr/bin/env bash
# Zatrzymuje WYŁĄCZNIE aplikację uruchomioną przez scripts/dev-gcp.sh:
#  1) własny serwer tmux aplikacji (gniazdo "trainer-panel-app") — to jedyny serwer tmux, który ten skrypt zamyka;
#  2) starą sesję "trainer-panel" na domyślnym serwerze (sprzed zmiany) — tylko tę jedną, po dokładnej nazwie;
#  3) zbłąkane procesy aplikacji na jej portach — tylko jeśli należą do tego repozytorium (katalog roboczy lub polecenie),
#     nigdy przodkowie tego skryptu, tmux ani claude.
# Nigdy nie zamyka domyślnego serwera tmux ani innych sesji (np. "claude").
# Zmienne do testów: APP_TMUX_SOCKET, LEGACY_TMUX_SOCKET, APP_PORTS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib-app-tmux.sh
. "$ROOT/scripts/lib-app-tmux.sh"
SESSION="$APP_SESSION"
PORTS="${APP_PORTS:-8080 22347 23889}"

if app_tmux has-session -t "=$SESSION" 2>/dev/null; then
  app_tmux kill-server
  echo "Zatrzymano aplikację (serwer tmux '$APP_TMUX_SOCKET')."
else
  echo "Aplikacja (serwer tmux '$APP_TMUX_SOCKET') nie działa."
fi

# Stary sposób: sesja "trainer-panel" na domyślnym serwerze. "=" = dokładna nazwa (bez dopasowania po prefiksie).
# Pomijamy ją, jeśli to w niej działa ten skrypt.
if legacy_tmux has-session -t "=$SESSION" 2>/dev/null; then
  mine=""
  if [ -n "${TMUX:-}" ] && [ -z "${LEGACY_TMUX_SOCKET:-}" ]; then mine="$(tmux display-message -p '#S' 2>/dev/null || true)"; fi
  if [ "$mine" = "$SESSION" ]; then
    echo "Pomijam starą sesję '$SESSION' — ten skrypt działa w niej."
  else
    legacy_tmux kill-session -t "=$SESSION"
    echo "Zatrzymano starą sesję tmux '$SESSION' (domyślny serwer pozostaje)."
  fi
fi

# Zbłąkane procesy na portach aplikacji.
ancestors=" "
p=$$
while [ -n "$p" ] && [ "$p" -gt 1 ]; do ancestors="$ancestors$p "; p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')"; done
for port in $PORTS; do
  for pid in $(ss -ltnpH "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u); do
    case "$ancestors" in *" $pid "*) echo "Pomijam proces $pid na porcie $port (przodek skryptu)."; continue;; esac
    comm="$(ps -o comm= -p "$pid" 2>/dev/null || true)"
    case "$comm" in tmux*|claude*|sshd*|bash|sh) echo "Pomijam proces $pid ($comm) na porcie $port."; continue;; esac
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    case "$cwd/" in "$ROOT/"*) own=1;; *) own=0;; esac
    case "$cmd" in *"$ROOT"*) own=1;; esac
    if [ "$own" = 1 ]; then
      kill "$pid" && echo "Zatrzymano proces $pid na porcie $port."
    else
      echo "Pomijam proces $pid na porcie $port — nie należy do tego repozytorium."
    fi
  done
done
