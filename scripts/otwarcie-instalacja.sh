#!/usr/bin/env bash
# Instalacja HTTPS (Caddy) i usługi API na tej maszynie — PRZYGOTOWANE, NIEURUCHOMIONE.
# Domyślnie tylko POKAZUJE, co zrobi (tryb podglądu). Wykonanie: scripts/otwarcie-instalacja.sh --apply panel.twojadomena.pl
# Wymaga: kupiona domena, rekord A → stały IP tej maszyny, reguła zapory TCP 80/443 (docs/OTWARCIE-KROK-PO-KROKU.md, kroki 1–4),
# plik .env.production z kluczami Clerk (produkcyjnymi) wg deploy/env.production.example.
# Czego NIE robi: nie rusza zapory ani DNS (to w konsoli chmury), nie wpisuje sekretów, nie kasuje danych, nie zmienia bazy.
set -euo pipefail
APPLY=0; [ "${1:-}" = "--apply" ] && { APPLY=1; shift; }
DOMAIN="${1:-}"; [ -n "$DOMAIN" ] || { echo "Użycie: $0 [--apply] panel.twojadomena.pl"; exit 2; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; ME="$(id -un)"
run() { echo "+ $*"; [ "$APPLY" = 1 ] && "$@" || true; }

[ -f "$ROOT/.env.production" ] || { echo "BRAK $ROOT/.env.production — najpierw skopiuj deploy/env.production.example i uzupełnij (uprawnienia 600)."; [ "$APPLY" = 1 ] && exit 1; }
[ "$(stat -c %a "$ROOT/.env.production" 2>/dev/null || echo 600)" = 600 ] || { echo "UWAGA: chmod 600 .env.production"; [ "$APPLY" = 1 ] && exit 1; }
# DNS musi już wskazywać tę maszynę, inaczej Let's Encrypt odmówi certyfikatu.
MYIP="$(curl -s -m 10 https://api.ipify.org || true)"; DNSIP="$(getent hosts "$DOMAIN" | awk '{print $1; exit}' || true)"
echo "IP maszyny: ${MYIP:-?}   DNS $DOMAIN → ${DNSIP:-brak}"
[ "$APPLY" = 1 ] && [ -n "$MYIP" ] && [ "$MYIP" != "$DNSIP" ] && { echo "DNS nie wskazuje jeszcze tej maszyny — przerywam."; exit 1; }

echo "== 1. budowa aplikacji (pnpm run build)"; run bash -c "cd '$ROOT' && pnpm run build"
echo "== 2. Caddy (oficjalne repozytorium Debiana)"
run sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
run bash -c "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"
run bash -c "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list"
run sudo apt-get update; run sudo apt-get install -y caddy
echo "== 3. Caddyfile z domeną i katalogiem"
run bash -c "sed -e 's#panel.example.pl#$DOMAIN#g' -e 's#/home/UŻYTKOWNIK#$HOME#g' '$ROOT/deploy/Caddyfile.example' | sudo tee /etc/caddy/Caddyfile >/dev/null"
run sudo systemctl enable --now caddy; run sudo systemctl reload caddy
echo "== 4. usługa API"
run bash -c "sed -e 's#UŻYTKOWNIK#$ME#g' '$ROOT/deploy/trainer-api.service.example' | sudo tee /etc/systemd/system/trainer-api.service >/dev/null"
run sudo systemctl daemon-reload; run sudo systemctl enable --now trainer-api
echo "== 5. sprawdzenie"; run "$ROOT/scripts/smoke-public.sh" "https://$DOMAIN"
[ "$APPLY" = 1 ] || echo "(tryb podglądu — nic nie wykonano; dodaj --apply, gdy kroki 1–4 z docs/OTWARCIE-KROK-PO-KROKU.md są zrobione)"
