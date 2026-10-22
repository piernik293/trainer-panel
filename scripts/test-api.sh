#!/usr/bin/env bash
# Testy api-server na osobnej bazie trainer_panel_test (nigdy na bazie aplikacji):
# testy integracyjne tworzą i zmieniają rekordy. Argumenty trafiają do vitest.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
export DATABASE_URL="${DATABASE_URL%/*}/trainer_panel_test"
cd "$ROOT/artifacts/api-server"
exec pnpm exec vitest run "$@"
