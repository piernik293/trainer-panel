---
name: Stage 5 consolidation guard
description: findBestConsolidation must guard against firing when all targets are resolved; and consolidation-only scenarios require an unresolved target to observe correctly in tests.
---

## Rule
`findBestConsolidation` returns null early when `orderedTargets.every(t => isVolumeResolved(t))`.

**Why:** Without this guard, Stage 5 consolidation fires after all volume targets are resolved — adding unnecessary sets purely because capacity exists. This breaks the pre-existing behaviour where the loop exits cleanly once goals are met.

## How to apply
Any scenario that tests "consolidation fires" must have at least one unresolved target remaining when consolidation is evaluated. Selection-based (no-guideline) targets resolve immediately after the first exercise covering them is committed, so they cannot produce a consolidation-only observable in single-target tests.

## Test design consequences
- The observable "consolidation fires" scenario requires **two different targets** (T1 and T2), where rec1 commits for T1 (resolved), T2 remains open, and the tie-breaker fires consolidation on rec1 instead of committing rec2.
- "Pool exhausted" + consolidation is **mathematically impossible** for a single-exercise pool: expansion always commits at max safe sets, and the same ceiling that capped expansion also caps the +1 delta from consolidation.
- `hasClearExpansionAdvantage` rule 4a (score[0] < numUnresolved) is best verified by unit tests; the integration observable is the same-category/same-target tie path.
