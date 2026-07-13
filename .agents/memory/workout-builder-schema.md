---
name: Workout Builder 2.0 schema decisions
description: Key constraints and patterns from the Workout Builder 2.0 (Phase 1) implementation — schema, reordering, and DND.
---

## Rule: uniqueIndex → index on order columns
`dayOrder` in `workoutPlanDaysTable` and `orderInDay` in `workoutPlanExercisesTable` use plain `index`, not `uniqueIndex`. Bulk reordering requires sending multiple rows through without constraint violations. A two-step approach (set all to negative values first, then positive) is used in the API as extra safety.

**Why:** Unique constraints on order columns make atomic multi-row reorder impossible without a temp table or deferred constraints (neither is easy with Drizzle/Postgres default behavior).

**How to apply:** Any new order column in a list-with-reorder table should default to `index`, not `uniqueIndex`.

## Rule: All new schema columns are nullable
All columns added to `workoutPlansTable`, `workoutPlanDaysTable`, and `workoutPlanExercisesTable` in Phase 1 are nullable. No existing columns were removed. This preserves backward compatibility with existing plan data.

**Why:** A `pnpm db push` (not a destructive migration) was used; NOT NULL columns with no default would fail for existing rows.

## Rule: planApi.ts custom hooks are canonical for plan routes
`artifacts/trainer-app/src/lib/planApi.ts` is the hand-written hook file for all `/plans/...` routes. Do NOT replace with orval-generated hooks for plan routes — the custom hooks handle optimistic invalidation patterns that orval can't express.

## DND stack
`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` are installed in `artifacts/trainer-app`. Both day-level and exercise-level reordering use `SortableContext` + `useSortable`. Up/down buttons are also provided as keyboard-accessible alternatives.

## Explicit save only for plan metadata
Structural mutations (add/delete/reorder days or exercises, add/delete exercise) call the API immediately and invalidate the query cache. Plan-level metadata fields (goal, description, dates, trainerNotes) use an explicit Save button with a "Niezapisane zmiany" dirty indicator and a `beforeunload` warning.
