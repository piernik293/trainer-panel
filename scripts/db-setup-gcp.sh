#!/usr/bin/env bash
# Przygotowuje schemat bazy: drizzle-kit push (tabele/kolumny ze schematu Drizzle),
# potem migracje lib/db/migrations/*.sql — push ich nie stosuje (indeksy częściowe,
# klucze obce itd.). Idempotentne: migracja, której obiekty już istnieją
# ("already exists"), jest pomijana; inny błąd przerywa skrypt.
# Użycie: scripts/db-setup-gcp.sh            (baza z DATABASE_URL w .env)
#         DATABASE_URL=… scripts/db-setup-gcp.sh   (np. baza testowa)
# Zawsze zrób wcześniej pg_dump do ~/backups/ (zasada z CLAUDE.md). Bez --force.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ]; then set -a; . "$ROOT/.env"; set +a; fi
cd "$ROOT"

echo "== drizzle-kit push"
pnpm --filter @workspace/db run push

echo "== migracje SQL"
ERR="$(mktemp)"; trap 'rm -f "$ERR"' EXIT
for f in "$ROOT"/lib/db/migrations/*.sql; do
  name="$(basename "$f")"
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -q -f "$f" >/dev/null 2>"$ERR"; then
    echo "  zastosowano  $name"
  elif grep -q "already exists" "$ERR"; then
    echo "  pominięto    $name (obiekty już istnieją)"
  else
    echo "  BŁĄD         $name" >&2; cat "$ERR" >&2; exit 1
  fi
done
echo "Gotowe."
