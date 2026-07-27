---
name: FULL_BODY balance pass
description: How upper/lower balance and weekly ceiling enforcement work for full_body plans.
---

## Rule
Slot 5 in the full_body template rotates between upper and lower body based on `alternativeIndex % 2`:
- Even (Day 1, 3, …): upper-body accessory (Biceps/Triceps/Barki)
- Odd (Day 2, 4, …): lower-body isolation (Mięśnie dwugłowe uda/Łydki/Przywodziciele), fallback to upper if pool empty

A post-prescription balance pass runs in `planDraftGenerateDay.ts` for all `full_body` sessions. It:
1. Loads weekly absolute ceilings for the client's experience level from DB
2. Loads max exercise-muscle coefficients via `exercise_muscle_assignments` + `volume_target_members` JOIN
3. Uses `weekExercisesRaw` (passed from frontend) to compute accumulated weekly volume from prior days
4. Reduces sets in priority order (0=non-priority isolation/core → 1=non-priority compound → 2=priority isolation → 3=priority compound) until all targets within ceiling or structural minimums hit
5. Minimum sets: 2 for `main_compound`, 1 for everything else
6. Residual overages from compound indirect volume (especially biceps/triceps for 3-day full_body) are logged and accepted — the 4-set absolute ceiling for Biceps/Triceps is structurally incompatible with 3 full-body sessions for beginners

## Why
3-day full-body plans systematically exceeded 7 out of 12 volume targets' absolute ceilings because:
- Slot 5 always picked upper accessory → 3 sessions × 3 direct sets + 3 × indirect from back = 8.8 biceps (ceiling 4)
- 4-set hypertrophy compounds × 3 sessions = 12 chest/lats (ceilings 10/8)
- Upper/lower ratio was 33/23 = 1.43 (ceiling: ≤1.20)

**Why structural minimums can't be avoided:** For Początkujący, biceps ceiling=4, but 3 back sessions × 3 sets × 0.5 coeff = 4.5 indirect already exceeds it. Reducing below minimum (2 sets for main_compound) is not done.

## How to apply
- Only `full_body` session type triggers the balance pass
- The frontend (`Step4Exercises.tsx`) accumulates `weekExercisesRaw: [{exerciseId, sets}]` after each day and passes it to subsequent generate-day calls
- Balance pass is best-effort (non-fatal try/catch); never blocks the response
- For non-full_body session types: pass `weekExercisesRaw: []` (no-op)
