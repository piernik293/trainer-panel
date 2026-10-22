#!/usr/bin/env bash
# Test dymny działającej aplikacji (najpierw scripts/dev-gcp.sh).
# Używa kont testowych instancji development Clerk; klucz czyta z .env.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env"; set +a
cd "$ROOT/scripts"
exec timeout 120 pnpm exec tsx ./src/smoke-gcp.ts
