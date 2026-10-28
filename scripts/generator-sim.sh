#!/usr/bin/env bash
# Symulacja generatora na bazie testowej (nigdy na bazie aplikacji): losowe profile → pełne tygodnie → niezależne kontrole.
# Użycie: scripts/generator-sim.sh [liczba_profili=1000] [ziarno] [styl: calisthenics]. Raport: docs/generator-sim-report.json (podsumowanie: docs/GENERATOR-JAKOSC.md).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export SIM_N="${1:-1000}"
[ -n "${2:-}" ] && export SIM_SEED="$2"
[ -n "${3:-}" ] && export SIM_STYLE="$3"
export SIM_REPORT="${SIM_REPORT:-$ROOT/docs/generator-sim-report${SIM_STYLE:+-$SIM_STYLE}.json}"
exec "$ROOT/scripts/test-api.sh" src/__tests__/generator-sim.test.ts --testTimeout=21600000
