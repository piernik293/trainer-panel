#!/usr/bin/env bash
# Po starcie maszyny (cron @reboot): jeśli dziś nie powstała jeszcze kopia dzienna (maszyna była wyłączona o 03:15), zrób ją teraz.
# Czeka chwilę na start PostgreSQL. Nic nie usuwa poza rotacją własnych kopii w backup-db.sh. Log: ~/logs/backup-db.log.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${BACKUP_DIR:-$HOME/backups}"
sleep "${BACKUP_BOOT_DELAY:-120}"
if ls "$DIR"/trainer_panel_daily_"$(date +%Y%m%d)"-*.sql.gz >/dev/null 2>&1; then echo "$(date '+%F %T') kopia z dziś już jest — pomijam"; exit 0; fi
echo "$(date '+%F %T') brak kopii z dziś po starcie maszyny — robię"
exec "$ROOT/scripts/backup-db.sh"
