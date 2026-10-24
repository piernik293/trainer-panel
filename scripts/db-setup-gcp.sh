#!/usr/bin/env bash
# Przygotowuje schemat bazy — WYŁĄCZNIE addytywnie (stała zasada, CLAUDE.md). Nigdy nie usuwa ani nie zmienia nazw
# tabel, kolumn, indeksów ani ograniczeń.
#
#  1. Pusta baza (brak tabel w public): drizzle-kit push tworzy tabele bazowe — ale najpierw plan (--strict --verbose
#     bez TTY); jeśli plan zawiera cokolwiek niszczącego (DROP, RENAME, TRUNCATE, DELETE, zmiana typu) → PRZERWANIE z błędem.
#  2. Istniejąca baza: push NIE jest uruchamiany (drizzle-kit usuwałby obiekty spoza schematu Drizzle: indeksy i klucze
#     z migracji SQL, tabele innych gałęzi). Zmiany schematu wchodzą tylko przez lib/db/migrations/*.sql.
#  3. Migracje lib/db/migrations/*.sql po kolei; migracja, której obiekty już istnieją ("already exists"), jest pomijana.
#  4. Raport rozbieżności z planem drizzle-kit (informacyjnie, nic nie wykonuje).
#
# Użycie: scripts/db-setup-gcp.sh            (baza z DATABASE_URL w .env)
#         DATABASE_URL=… scripts/db-setup-gcp.sh   (np. baza testowa)
#         scripts/db-setup-gcp.sh --check     tylko plan drizzle-kit: kod 1, gdy zawiera zmiany niszczące (nic nie wykonuje)
# Zawsze zrób wcześniej pg_dump do ~/backups/ (zasada z CLAUDE.md). Test: scripts/test-db-setup.sh.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ]; then set -a; . "$ROOT/.env"; set +a; fi
cd "$ROOT"

DESTRUCTIVE='^\s*(DELETE|TRUNCATE)\b|\b(DROP|RENAME)\b|SET DATA TYPE|DISABLE ROW LEVEL SECURITY'

# Plan drizzle-kit bez wykonywania: --strict zawsze pyta o zgodę, a bez TTY pytanie kończy się błędem,
# więc nic nie zostaje wykonane. Wypisuje instrukcje SQL (po jednej w linii) albo nic.
drizzle_plan() {
  local out
  out="$(cd "$ROOT/lib/db" && node_modules/.bin/drizzle-kit push --strict --verbose --config ./drizzle.config.ts </dev/null 2>&1 || true)"
  if ! grep -q "You are about to execute" <<<"$out" && ! grep -qi "no changes detected" <<<"$out"; then
    echo "BŁĄD: nie udało się odczytać planu drizzle-kit:" >&2
    grep -v "Pulling schema" <<<"$out" | sed -E 's#postgres(ql)?://[^ ]*#<DATABASE_URL>#g' | head -20 >&2
    return 2
  fi
  sed -n '/You are about to execute/,/^Error: Interactive/p' <<<"$out" | grep -E ';\s*$' || true
}

if [ "${1:-}" = "--check" ]; then
  plan="$(drizzle_plan)"
  bad="$(grep -Ei "$DESTRUCTIVE" <<<"$plan" || true)"
  echo "Plan drizzle-kit: $(grep -c . <<<"$plan" || true) instrukcji, niszczących: $(grep -c . <<<"$bad" || true)"
  if [ -n "$bad" ]; then sed 's/^/  ✗ /' <<<"$bad"; exit 1; fi
  exit 0
fi

tables="$(psql "$DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$tables" = "0" ]; then
  echo "== pusta baza: tabele bazowe ze schematu Drizzle"
  plan="$(drizzle_plan)"
  bad="$(grep -Ei "$DESTRUCTIVE" <<<"$plan" || true)"
  if [ -n "$bad" ]; then
    echo "PRZERWANO: plan drizzle-kit zawiera zmiany niszczące — nic nie wykonano:" >&2
    sed 's/^/  ✗ /' <<<"$bad" >&2
    exit 1
  fi
  (cd "$ROOT/lib/db" && node_modules/.bin/drizzle-kit push --config ./drizzle.config.ts </dev/null >/dev/null 2>&1) || true
  tables="$(psql "$DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")"
  if [ "$tables" = "0" ]; then echo "BŁĄD: drizzle-kit nie utworzył tabel" >&2; exit 1; fi
  echo "  utworzono tabel: $tables"
else
  echo "== istniejąca baza ($tables tabel): bez drizzle-kit push (tylko migracje SQL)"
fi

echo "== migracje SQL"
ERR="$(mktemp)"; trap 'rm -f "$ERR"' EXIT
for f in "${MIGRATIONS_DIR:-$ROOT/lib/db/migrations}"/*.sql; do
  name="$(basename "$f")"
  # 0011 (z Replit) zamienia klucz obcy w jednej transakcji (DROP CONSTRAINT + ADD); na istniejącej bazie jest pomijana
  # w całości („already exists”). Wyjątek historyczny — każda nowa migracja z instrukcją niszczącą jest odrzucana.
  if [ "$name" != "0011_history_integrity.sql" ] && grep -Eiq '^\s*(DROP|TRUNCATE|DELETE)\b|\bRENAME\b' "$f"; then
    echo "  BŁĄD         $name zawiera instrukcję niszczącą — migracje mają być tylko addytywne" >&2; exit 1
  fi
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -q -f "$f" >/dev/null 2>"$ERR"; then
    echo "  zastosowano  $name"
  elif grep -q "already exists" "$ERR"; then
    echo "  pominięto    $name (obiekty już istnieją)"
  else
    echo "  BŁĄD         $name" >&2; cat "$ERR" >&2; exit 1
  fi
done

plan="$(drizzle_plan)" || exit 1
n="$(grep -c . <<<"$plan" || true)"
if [ "$n" != "0" ]; then
  echo "== rozbieżności ze schematem Drizzle: $n (NIE stosowane; szczegóły: scripts/db-setup-gcp.sh --check)"
fi
echo "Gotowe."
