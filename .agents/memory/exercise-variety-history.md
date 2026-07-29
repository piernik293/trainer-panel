---
name: Exercise variety history pattern
description: Per-client exercise usage log — schema, commit endpoint idempotency, and engine novelty ranking for draft-generation variety.
---

## Schema
Table: `client_exercise_usage_log` — one row per (client_id, generation_id, exercise_id).
- `generation_id` is Postgres UUID type (drizzle `uuid()` column).
- UNIQUE constraint on (client_id, generation_id, exercise_id); two additional indexes.
- Schema file: `lib/db/src/schema/exercise-usage.ts`; exported from `lib/db/src/schema/index.ts`.

## generationId lifecycle
- Created once in `handleGenerateFromEmpty` at the **start** of the function via `crypto.randomUUID()`.
- Frontend commits to `POST /api/clients/:clientId/plan-draft/record-generation` **only** after complete success: `errors.length === 0 && dayResults.length === eligibleDayCount && balanceWeekSucceeded`.
- `balanceWeekSucceeded` is set to `true` inside `if (balResp.ok)` in the balance-week block.
- `eligibleDayCount` is computed before the day loop via `distributionResult.days.filter(d => V0_SESSION_TYPES.has(d.dayType?.toLowerCase() ?? "")).length`.

## Commit endpoint idempotency (three cases)
- **A**: no rows exist for (client_id, generation_id) → insert all, 201.
- **B**: rows exist, stored set === incoming set → 200 `already_committed` (safe retry).
- **C**: rows exist, stored set ≠ incoming set → 409 Conflict.
Route: `artifacts/api-server/src/routes/planDraftRecordGeneration.ts`.

## Novelty ranking in sortDeterministic
- N1: not in `cooldownIds` (last 4 generations) → sort back.
- N2: no entry in `usageHistory` → never-used first.
- N3: fewest `totalGenerations`.
- N4: earliest `lastUsedAt` (null treated as epoch 0).
- Inserted as step 4c before step 5 (exercisePriority) in `sortDeterministic`.
- `V0PriorityContext` extended with `usageHistory?: Map<number, {...}>` and `cooldownIds?: Set<number>`.

## sortDeterministic has TWO `return [...candidates].sort(...)` calls
- Use `// 0. Preferred exercise boost` as additional context to uniquely target the one in `sortDeterministic` (not `sortWithPriority`).

## History loading in planDraftGenerateDay.ts
- Two raw SQL queries before `priorityContext` is built.
- Query 1: `GROUP BY generation_id ORDER BY MAX(generated_at) DESC LIMIT 4` to get recent gen IDs.
- Query 1b: drizzle query builder with `inArray(generationId, recentGenIds)` for cooldown IDs.
- Query 2: `COUNT(DISTINCT generation_id)::int` + `MAX(generated_at)` per exercise for usage aggregation.
- Both are non-fatal (try/catch); generation continues without novelty if they fail.
- `and` and `inArray` are imported from `"drizzle-orm"` in planDraftGenerateDay.ts.

**Why:**
Three review rounds refined the spec — generationId in frontend (not server-side) enables idempotent retry. `is_manual` column was rejected (table stores only auto-selections provably). Balance-week success is required for the complete-success condition.
