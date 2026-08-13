---
name: Trainer-led sessions boundary
description: performedBy/sessionMode session metadata and the client/trainer write boundary rules
---
`workout_sessions` has `performedBy` ('client'|'trainer'), `sessionMode` ('self_directed'|'in_person'), `performedByTrainerId` (FK SET NULL); `clients.cooperationMode` ('online'|'in_person'|'hybrid', default online) gates trainer-led routes (in_person/hybrid only).

**Why:** Both sides share the one-active-session-per-client/day invariant, so open routes must never silently take over the other side's active session — trainer open returns 409 on an active self-directed session, and client open/PUT/PATCH return 409/403 on a trainer-led one (code-review flagged the missing client-side guard as an authz hole).

**How to apply:** Any new session-opening or session-writing route must check `performedBy` symmetry, including the 23505 concurrent-open recovery path. Trainer routes live at the bottom of clientPortal.ts and share `buildOpenSessionPayload` + `upsertExerciseLog` (insert branch is atomic via onConflictDoUpdate on eel_session_exercise_idx). History selects must include performedBy/sessionMode explicitly (column-listed selects).
