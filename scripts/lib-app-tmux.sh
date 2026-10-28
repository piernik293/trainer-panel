# Wspólne ustawienia dev-gcp.sh i stop-gcp.sh.
# Aplikacja działa na OSOBNYM serwerze tmux (gniazdo "-L"), więc jej start i stop nigdy nie dotyka domyślnego serwera tmux,
# w którym siedzą sesje użytkownika (np. "claude"). Nigdy nie używamy "tmux kill-server" na domyślnym serwerze.
APP_TMUX_SOCKET="${APP_TMUX_SOCKET:-trainer-panel-app}"
APP_SESSION="trainer-panel"
app_tmux() { tmux -L "$APP_TMUX_SOCKET" "$@"; }
# Stary sposób uruchamiania (sesja "trainer-panel" na domyślnym serwerze) — tylko do posprzątania po nim.
legacy_tmux() { if [ -n "${LEGACY_TMUX_SOCKET:-}" ]; then tmux -L "$LEGACY_TMUX_SOCKET" "$@"; else tmux "$@"; fi; }
