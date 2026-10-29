#!/usr/bin/env bash
# Testy api-server na osobnej bazie trainer_panel_test (nigdy na bazie aplikacji):
# testy integracyjne tworzą i zmieniają rekordy. Argumenty trafiają do vitest.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
# Flagi funkcji z .env nie mogą wpływać na testy (każdy test ustawia własne); testy działają jak przy flagach domyślnych.
unset FEEDBACK_ENABLED BETA_NO_LIMITS CALISTHENICS_ENABLED ACHIEVEMENTS_ENABLED SOLO_ENABLED CONDITIONING_ENABLED CONTACT_EMAIL
# TEST_DB_OPTIONS (opcjonalnie): np. "?options=-c%20search_path%3Dsim" — schemat `sim` w bazie testowej z kopią katalogu aplikacji (symulacje); nazwa bazy nadal kończy się na _test.
export DATABASE_URL="${DATABASE_URL%/*}/trainer_panel_test${TEST_DB_OPTIONS:-}"
cd "$ROOT/artifacts/api-server"
exec pnpm exec vitest run "$@"
