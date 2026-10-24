#!/usr/bin/env bash
# Test scripts/db-setup-gcp.sh na tymczasowej bazie (tworzona i usuwana przez ten test, nigdy baza aplikacji ani testowa):
#  1) pusta baza → tabele + migracje;
#  2) tabela, kolumna i indeks spoza schematu Drizzle + ponowne uruchomienie → nic z tego nie znika, dane zostają;
#     indeksy z migracji SQL zostają;
#  3) --check → kod 1 i lista zmian niszczących, nic nie wykonane;
#  4) nowa migracja z DROP → skrypt odmawia (kod ≠ 0), tabela zostaje.
# Wymaga sudo (tworzenie bazy jako postgres). Kod wyjścia 0 = OK.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
DB=trainer_panel_setup_test
OWNER="$(psql "$DATABASE_URL" -tAc 'select current_user')"
export DATABASE_URL="${DATABASE_URL%/*}/$DB"
TMP="$(mktemp -d)"; fails=0
ok()   { echo "  OK    $1"; }
fail() { echo "  BŁĄD  $1"; fails=$((fails + 1)); }
q()    { psql "$DATABASE_URL" -tAc "$1"; }
cleanup() { rm -rf "$TMP"; sudo -u postgres dropdb --if-exists "$DB" >/dev/null 2>&1; }
trap cleanup EXIT

sudo -u postgres dropdb --if-exists "$DB" && sudo -u postgres createdb -O "$OWNER" "$DB" || { echo "nie można utworzyć bazy $DB"; exit 1; }

echo "1) pusta baza"
"$ROOT/scripts/db-setup-gcp.sh" > "$TMP/1.log" 2>&1 && ok "db-setup na pustej bazie" || { fail "db-setup na pustej bazie"; tail -20 "$TMP/1.log"; }
[ "$(q "select count(*) > 20 from information_schema.tables where table_schema='public'")" = "t" ] && ok "tabele utworzone" || fail "brak tabel"
[ "$(q "select count(*) from pg_indexes where indexname='exercises_review_batch_idx'")" = "1" ] && ok "indeks z migracji 0021 istnieje" || fail "brak indeksu z migracji"

echo "2) obiekty spoza schematu Drizzle"
q "create table spoza_schematu (id int primary key, nota text); insert into spoza_schematu values (1, 'zostaje');
   alter table exercises add column kolumna_spoza text default 'x'; create index spoza_idx on exercises (kolumna_spoza);" >/dev/null
"$ROOT/scripts/db-setup-gcp.sh" > "$TMP/2.log" 2>&1 && ok "db-setup na istniejącej bazie" || { fail "db-setup na istniejącej bazie"; tail -20 "$TMP/2.log"; }
grep -q "bez drizzle-kit push" "$TMP/2.log" && ok "push pominięty na istniejącej bazie" || fail "push uruchomiony na istniejącej bazie"
[ "$(q "select nota from spoza_schematu where id=1")" = "zostaje" ] && ok "tabela spoza schematu i jej dane nietknięte" || fail "tabela spoza schematu zmieniona/usunięta"
[ "$(q "select count(*) from information_schema.columns where table_name='exercises' and column_name='kolumna_spoza'")" = "1" ] && ok "kolumna spoza schematu nietknięta" || fail "kolumna spoza schematu usunięta"
[ "$(q "select count(*) from pg_indexes where indexname in ('spoza_idx','exercises_review_batch_idx')")" = "2" ] && ok "indeksy (spoza schematu i z migracji) nietknięte" || fail "indeks usunięty"

echo "3) --check"
"$ROOT/scripts/db-setup-gcp.sh" --check > "$TMP/3.log" 2>&1; ec=$?
[ $ec -eq 1 ] && grep -q 'DROP TABLE "spoza_schematu"' "$TMP/3.log" && ok "--check zgłasza zmiany niszczące (kod 1)" || { fail "--check (kod $ec)"; tail -10 "$TMP/3.log"; }
[ "$(q "select count(*) from spoza_schematu")" = "1" ] && ok "--check nic nie wykonał" || fail "--check zmienił bazę"

echo "4) migracja z DROP"
cp "$ROOT"/lib/db/migrations/*.sql "$TMP/" && echo 'DROP TABLE spoza_schematu;' > "$TMP/9999_zla.sql"
MIGRATIONS_DIR="$TMP" "$ROOT/scripts/db-setup-gcp.sh" > "$TMP/4.log" 2>&1; ec=$?
[ $ec -ne 0 ] && grep -q "9999_zla.sql zawiera instrukcję niszczącą" "$TMP/4.log" && ok "migracja z DROP odrzucona (kod $ec)" || { fail "migracja z DROP przyjęta"; tail -5 "$TMP/4.log"; }
[ "$(q "select count(*) from spoza_schematu")" = "1" ] && ok "tabela nadal istnieje" || fail "tabela usunięta"

echo "Wynik: $([ $fails -eq 0 ] && echo OK || echo "BŁĘDY: $fails")"
exit $fails
