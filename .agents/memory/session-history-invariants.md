---
name: Session history invariants
description: Rules for workout session lifecycle, previous-load matching, and progression suggestions
---

- Single-active-session invariant: partial unique index `ws_one_active_per_client_day` on workout_sessions (client_id, plan_day_id) WHERE is_completed=false. Open/create routes catch 23505 and return the winner; PATCH un-complete returns 409 if another active session exists for the day.
- **Why:** concurrent opens (double-tap, two tabs) previously could split a workout into two active sessions.
- Drizzle ≥0.45 wraps pg errors: check `err.cause.code` as well as `err.code` for 23505 (helper `pgErrorCode` in clientPortal.ts).
- Previous-load lookup matches by clientId + snapshot exerciseId across completed SESSIONS **and** completed LOGS (`exercise_execution_logs.isCompleted=true`) — typed-in but unchecked numbers must never prefill or drive suggestions.
- `exercise_execution_logs.plan_exercise_id` is nullable with ON DELETE SET NULL; snapshot columns (exerciseNameSnapshot, planned*) keep history readable after plan edits. Never restore the old cascade.
- Progression suggestion (computeProgressionSuggestion) is informational only, never mutates plans; pain always blocks "increase"; missing recorded RIR with a RIR target → maintain, not increase.
- Known limitation: one reps value per exercise (not per-set), so history shows "20 kg × 12 (3 serie)".
