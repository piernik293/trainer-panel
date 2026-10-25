#!/usr/bin/env bash
# Test dymny działającej aplikacji (najpierw scripts/dev-gcp.sh).
# Używa kont testowych instancji development Clerk; klucz czyta z .env.
# Konta trenerów zakłada administrator (TRAINER_CLERK_IDS), więc nowi trenerzy testowi wymagają API uruchomionego
# z TRAINER_SIGNUP_OPEN=1:  TRAINER_SIGNUP_OPEN=1 scripts/dev-gcp.sh   (po teście wróć do zwykłego dev-gcp.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
cd "$ROOT/scripts"
exec timeout 120 pnpm exec tsx ./src/smoke-gcp.ts
