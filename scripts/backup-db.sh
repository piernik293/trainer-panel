#!/usr/bin/env bash
# Codzienna kopia bazy aplikacji: pg_dump → ~/backups/trainer_panel_daily_RRRRMMDD-GGMM.sql.gz, rotacja 14 dni, kontrola miejsca na dysku.
# Usuwa TYLKO własne, rotowane kopie (wzorzec trainer_panel_daily_*.sql.gz starsze niż 14 dni) — nigdy ręcznych kopii z innych skryptów.
# Użycie: scripts/backup-db.sh            (baza z DATABASE_URL w .env)
# Cron (03:15 co noc): patrz CLAUDE.md, „Kopie bazy”. Kod wyjścia ≠ 0 = kopia się nie udała (cron wysyła to do logu).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ]; then set -a; . "$ROOT/.env"; set +a; fi
DIR="${BACKUP_DIR:-$HOME/backups}"; KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"; MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-2048}"
mkdir -p "$DIR"
free_mb=$(df -Pm "$DIR" | awk 'NR==2{print $4}')
if [ "$free_mb" -lt "$MIN_FREE_MB" ]; then
  echo "BŁĄD: za mało miejsca na dysku (${free_mb} MB wolne, wymagane ${MIN_FREE_MB} MB) — kopia nie została zrobiona" >&2; exit 2
fi
OUT="$DIR/trainer_panel_daily_$(date +%Y%m%d-%H%M).sql.gz"
TMP="$OUT.tmp"
trap 'rm -f "$TMP"' EXIT
pg_dump "$DATABASE_URL" | gzip -9 > "$TMP"
# kopia nie może być pusta ani uszkodzona
gzip -t "$TMP"
[ "$(gzip -dc "$TMP" | wc -c)" -gt 1000 ] || { echo "BŁĄD: kopia podejrzanie mała" >&2; exit 3; }
mv "$TMP" "$OUT"; trap - EXIT
echo "Kopia: $OUT ($(du -h "$OUT" | cut -f1))"
# rotacja: tylko pliki tego skryptu
find "$DIR" -maxdepth 1 -type f -name 'trainer_panel_daily_*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/Usunięto starą kopię: /'
