#!/usr/bin/env bash
# Test przywrócenia: ostatnia kopia dzienna (albo plik z argumentu) → TYMCZASOWY schemat restore_check w bazie trainer_panel_test (tworzony i kasowany
# przez ten skrypt), porównanie liczby tabel i wierszy kluczowych tabel z bazą aplikacji. Nie dotyka tabel w trainer_panel ani w schemacie public bazy testowej.
# Kod wyjścia 0 = kopia da się przywrócić. Kopia jest zawsze trochę starsza niż baza (nowe tabele i wiersze po jej wykonaniu), więc różnice
# „baza ma więcej” są tylko opisane; błędem jest brak tabeli kluczowej, pusta tabela kluczowa przy niepustej bazie albo więcej tabel w kopii niż w bazie.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ]; then set -a; . "$ROOT/.env"; set +a; fi
DIR="${BACKUP_DIR:-$HOME/backups}"
FILE="${1:-$(ls -1t "$DIR"/trainer_panel_daily_*.sql.gz 2>/dev/null | head -n1)}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "BŁĄD: brak kopii do sprawdzenia" >&2; exit 2; }
TEST_URL="${DATABASE_URL%/*}/trainer_panel_test"; SCH="restore_check"
# Brak uprawnienia CREATE DATABASE → przywracamy do OSOBNEGO schematu w bazie testowej (nie dotykamy jej tabel w „public”).
psql "$TEST_URL" -v ON_ERROR_STOP=1 -qc "DROP SCHEMA IF EXISTS $SCH CASCADE" -c "CREATE SCHEMA $SCH"
trap 'psql "$TEST_URL" -qc "DROP SCHEMA IF EXISTS '$SCH' CASCADE" >/dev/null 2>&1 || true' EXIT
# w zrzucie „public” to nazwa schematu (SET search_path, nazwy kwalifikowane) → zamiana na schemat testowy; to tylko test struktury i liczności
gzip -dc "$FILE" | sed -E "s/\bpublic\./$SCH./g; s/SET search_path = public/SET search_path = $SCH/; s/set_config\('search_path', '', false\)/set_config('search_path', '$SCH', false)/; /^CREATE SCHEMA public;/d; /^COMMENT ON SCHEMA public/d" \
  | psql "$TEST_URL" -v ON_ERROR_STOP=0 -q >/dev/null 2>/tmp/restore-check.err || true
count() { psql "$TEST_URL" -Atc "select count(*) from information_schema.tables where table_schema='$1' and table_type='BASE TABLE'"; }
src_count() { psql "$DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"; }
rows() { psql "$1" -Atc "select count(*) from $2" 2>/dev/null || echo "?"; }
T_SRC=$(src_count); T_RST=$(count "$SCH")
echo "Plik: $FILE"; echo "Tabele: baza=$T_SRC, przywrócona=$T_RST"
ok=1; [ "$T_RST" -le "$T_SRC" ] || ok=0
[ "$T_SRC" = "$T_RST" ] || echo "  uwaga: baza ma $((T_SRC - T_RST)) tabel więcej niż kopia (zmiany po jej wykonaniu)"
for t in trainers clients surveys exercises workout_plans; do
  a=$(rows "$DATABASE_URL" "$t"); b=$(rows "$TEST_URL" "$SCH.$t"); echo "  $t: baza=$a, przywrócona=$b"
  [ "$b" != "?" ] || ok=0
  if [ "$b" != "?" ] && [ "$a" != "?" ] && [ "$b" = "0" ] && [ "$a" != "0" ]; then ok=0; fi
  [ "$a" = "$b" ] || echo "    (różnica: baza zmieniła się po wykonaniu kopii)"
done
[ "$ok" = 1 ] && echo "OK: kopia da się przywrócić" || { echo "BŁĄD: przywrócenie nieudane (szczegóły: /tmp/restore-check.err)" >&2; exit 1; }
