#!/usr/bin/env bash
# Test dymny PUBLICZNEGO adresu (po otwarciu na świat). Tylko odczyt: kilka zapytań GET/HEAD, nic nie zapisuje, nie loguje się.
# Użycie: scripts/smoke-public.sh https://panel.twojadomena.pl
# Kod wyjścia 0 = wszystko w porządku. Nie uruchamiaj przed konfiguracją DNS/Caddy (docs/OTWARCIE-KROK-PO-KROKU.md).
set -uo pipefail
BASE="${1:-}"; [ -n "$BASE" ] || { echo "Użycie: $0 https://panel.twojadomena.pl"; exit 2; }
BASE="${BASE%/}"; HOST="${BASE#https://}"; HOST="${HOST#http://}"; HOST="${HOST%%/*}"
ok=0; bad=0
check() { # opis, warunek (0 = ok)
  if [ "$2" = 0 ]; then echo "OK    $1"; ok=$((ok+1)); else echo "BŁĄD $1"; bad=$((bad+1)); fi
}
code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" 2>/dev/null || echo 000; }
hdr() { curl -sI -m 15 "$1" 2>/dev/null | tr -d '\r'; }

[ "$(code "$BASE/api/healthz")" = 200 ]; check "API odpowiada (/api/healthz = 200)" $?
[ "$(code "$BASE/")" = 200 ]; check "Panel trenera ładuje się (/ = 200)" $?
[ "$(code "$BASE/client-landing/")" = 200 ]; check "Portal klienta ładuje się (/client-landing/ = 200)" $?
[ "$(code "http://$HOST/")" = 301 ] || [ "$(code "http://$HOST/")" = 308 ]; check "HTTP przekierowuje na HTTPS" $?
H="$(hdr "$BASE/")"
echo "$H" | grep -qi '^strict-transport-security:'; check "Nagłówek HSTS" $?
echo "$H" | grep -qi '^x-content-type-options: *nosniff'; check "Nagłówek nosniff" $?
echo "$H" | grep -qi '^x-frame-options: *deny'; check "Nagłówek X-Frame-Options: DENY" $?
echo "$H" | grep -qi '^content-security-policy'; check "Nagłówek Content-Security-Policy (lub Report-Only)" $?
echo "$H" | grep -qi '^server:.*caddy' && r=1 || r=0; check "Nagłówek Server nie zdradza oprogramowania" $r
# trasy chronione bez sesji muszą odmawiać
for path in /api/clients /api/client-portal/plan /api/admin/feedback /api/own-plan /api/solo/me; do
  c="$(code "$BASE$path")"; { [ "$c" = 401 ] || [ "$c" = 403 ] || [ "$c" = 404 ]; }; check "Bez sesji $path odmawia ($c)" $?
done
# prywatne porty nie mogą być dostępne z zewnątrz
for port in 8080 23889 22347 5432; do
  (exec 3<>"/dev/tcp/$HOST/$port") 2>/dev/null && r=1 || r=0; check "Port $port zamknięty z zewnątrz" $r
done
# certyfikat: ważny co najmniej 14 dni
if command -v openssl >/dev/null; then
  echo | openssl s_client -servername "$HOST" -connect "$HOST:443" 2>/dev/null | openssl x509 -noout -checkend $((14*86400)) >/dev/null 2>&1; check "Certyfikat ważny jeszcze ≥ 14 dni" $?
fi
echo; echo "Podsumowanie: $ok OK, $bad BŁĄD"; [ "$bad" = 0 ]
