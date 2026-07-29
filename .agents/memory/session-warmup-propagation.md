---
name: Session warmup constant propagation
description: WARMUP_FALLBACK_SECONDS affects sessionDurationEstimator; autoFill tests with small maxSessionMinutes caps break when the constant changes.
---

## Rule
`WARMUP_FALLBACK_SECONDS` in `sessionDurationEstimator.ts` and the 10-min warmup in `workoutDurationEstimator.ts` must always agree.

## Why
autoFill tests that use small `maxSessionMinutes` values (e.g. 9 or 10 min) compute expected durations with the warmup baked into the comment. When the warmup constant changes (was 300 s, now 600 s), those tests silently pick a cap that the warmup alone can't fit inside — every exercise is immediately rejected, so `result.toAdd` is empty and the test fails with a length assertion.

## How to apply
- Whenever `WARMUP_FALLBACK_SECONDS` is changed, grep autoFill.test.ts for `maxSessionMinutes` and recompute every hardcoded cap and comment using the new warmup: `cap_s = warmup + N × 60 + (totalSets − N) × rest + (N − 1) × 60`.
- The "canonical" anchor is: `WARMUP=600, N=3, S=21, REST=90 → exactly 3600 s (60 min cap)`.
- For small-cap unit tests, choose a maxSessionMinutes that lets the "allowed" case fit and rejects the "over cap" case, then update the comment accordingly.
