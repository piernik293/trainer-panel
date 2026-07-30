---
name: Thin-pool retry for alt sessions
description: Why the second occurrence of a session type (altIdx>0) can fail in dumbbell-only plans, and the fix pattern.
---

# Thin-pool retry for alternative sessions

## The rule
When `runExerciseSelectionEngineV0` fails (`valid: false`) on an alternative session (`alternativeIndex > 0`), retry with only the same-type previous session's exercise IDs excluded — not the full `weekUsedExerciseIds`.

**Why:** `weekUsedExerciseIds` accumulates ALL exercises from every prior session (upper + lower + full_body). For thin equipment pools (dumbbell-only), upper-body exercises used in a full_body or lower day are pre-excluded from the second upper day, depleting the pool below `MIN_EXERCISES` (4). The retry restores those exercises to the pool while still enforcing variety vs. the immediately preceding same-type session.

**How to apply:** In `planDraftGenerateDay.ts`, after the first V0 call fails:
```typescript
if (!v0Result.valid && alternativeIndex > 0 && weekIds.length > sameTypePrev.length) {
  const sameTypeOnlyIds = new Set<string>(sameTypePrev.map((e) => String(e.id)));
  v0Result = runExerciseSelectionEngineV0(pool, sessionType, sameTypeOnlyIds, ctx, opts);
}
```

## Second bug fixed simultaneously
`sameTypePreviousExercises` was not being passed from the route to `runExerciseSelectionEngineV0`. The band-diversity logic (prefer different implement/angle than Upper A when generating Upper B) never fired. Fix: pass `sameTypePreviousExercises: sameTypePrev` in both the original call and the retry call.

## MIN_EXERCISES = 4
Hard constant in `ExerciseSelectionEngineV0.ts:214`. Cannot be lowered without also ensuring push + pull coverage. The retry approach is preferable to lowering the minimum.
