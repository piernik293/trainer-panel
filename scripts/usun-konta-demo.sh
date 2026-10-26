#!/usr/bin/env bash
# USUNIĘCIE KONT I DANYCH DEMO — PRZYGOTOWANE, NIE URUCHAMIAĆ BEZ WŁAŚCICIELA (STOP-6, STOP-7).
# Co robi: dla podanych kont trenerów demo (DEMO_TRAINER_CLERK_IDS="user_x,user_y") pokazuje, ile wierszy zniknie z każdej tabeli;
# dopiero z --wykonaj i POTWIERDZAM=USUN: pg_dump do ~/backups/, potem usunięcie trenera (kaskadowo jego klientów, wywiadów, planów,
# sesji) i klientów-kont demo (DEMO_CLIENT_CLERK_IDS). Konta Clerk usuwa się osobno w panelu Clerk (ten skrypt ich nie dotyka).
# Domyślnie TYLKO LISTA (nic nie zmienia).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ]; then set -a; . "$ROOT/.env"; set +a; fi
T="${DEMO_TRAINER_CLERK_IDS:-}"; C="${DEMO_CLIENT_CLERK_IDS:-}"
[ -n "$T$C" ] || { echo "Podaj DEMO_TRAINER_CLERK_IDS i/lub DEMO_CLIENT_CLERK_IDS (identyfikatory Clerk po przecinku)." >&2; exit 2; }
q() { printf "'%s'" "$(echo "$1" | sed "s/'/''/g")"; }
list() { local out=""; IFS=, read -ra a <<<"$1"; for x in "${a[@]}"; do x="$(echo "$x" | xargs)"; [ -n "$x" ] && out="$out${out:+,}$(q "$x")"; done; echo "${out:-NULL}"; }
TL=$(list "$T"); CL=$(list "$C")
echo "== Trenerzy demo:"; psql "$DATABASE_URL" -Atc "select id, clerk_user_id, coalesce(display_name,'') from trainers where clerk_user_id in ($TL)"
echo "== Klienci powiązani z tymi trenerami (będą usunięci kaskadowo):"; psql "$DATABASE_URL" -Atc "select count(*) from clients where trainer_id in (select id from trainers where clerk_user_id in ($TL))"
echo "== Klienci-konta demo:"; psql "$DATABASE_URL" -Atc "select id, first_name, last_name from clients where clerk_user_id in ($CL)"
if [ "${1:-}" != "--wykonaj" ]; then echo "Tryb podglądu — nic nie zmieniono. Wykonanie: POTWIERDZAM=USUN $0 --wykonaj"; exit 0; fi
[ "${POTWIERDZAM:-}" = "USUN" ] || { echo "Brak POTWIERDZAM=USUN — przerywam." >&2; exit 3; }
DUMP="$HOME/backups/trainer_panel_przed_usunieciem_demo_$(date +%Y%m%d-%H%M).sql"
pg_dump "$DATABASE_URL" > "$DUMP"; echo "Kopia: $DUMP"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -c "delete from clients where clerk_user_id in ($CL)" -c "delete from trainers where clerk_user_id in ($TL)"
echo "Gotowe. Pamiętaj o usunięciu tych kont w panelu Clerk."
