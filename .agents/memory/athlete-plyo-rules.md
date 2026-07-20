---
name: Athlete and Plyo planning rules
description: Scope rules, eligibility logic, and placement decisions for athlete-specific survey support and the Plyo session type.
---

## Athlete detection
Any `athleteStatus` starting with "Tak" is an active athlete. "Nie" and null/undefined → non-athlete. Implemented in `isAthleteActive()` in `athleteAndPlyoRules.ts`.

## Plyo eligibility — all three conditions must hold
1. `isAthleteActive` → any "Tak" status
2. experienceLevel NOT "Brak aktywności fizycznej" (no movement base)
3. At least one of:
   - performance needs include: skoczność, szybkość, zmiana kierunku, dynamika, koordynacja
   - athleteStatus is "Tak — półzawodowo" or "Tak — zawodowo" (competition level alone justifies)

**Why:** Amateur athlete with no plyometric-relevant goals doesn't need a Plyo day; semi-pro/pro needs it regardless of stated goals.

## Scope boundaries
- Plyo is NOT a replacement for any existing split session type — it is an additional support session.
- Plyo logic is fully isolated in `athleteAndPlyoRules.ts`; NEVER mixed with pain/injury alerts or cardio rules.
- `SPLIT_TYPES` in `plan-draft-input.ts` was NOT changed — Plyo is a session type, not a split.

## Polish typographic quotes in esbuild
esbuild (v0.27) treats `"` (U+201D RIGHT DOUBLE QUOTATION MARK) as a string terminator when it appears inside a regular `"…"` string. **Fix:** use single-quote outer delimiters (`'…'`) or backtick template literals whenever Polish typographic quotes (`„`, `"`) appear in string values.

**Why:** Discovered during build of `athleteAndPlyoRules.ts`; affects any TS source file bundled by esbuild.

## Plyo session slot structure (ExerciseSelectionEngineV0)
Four slots: (1) explosive knee-dominant compound, (2) hip-hinge deceleration compound, (3) calves/reactive chain (falls back to non-compound lower if empty), (4-5) optional lower accessory + core always last. Same `pick()` pattern as all other session types.

## New DB columns (surveys table)
`athleteStatus text`, `sportDiscipline text`, `sportPerformanceNeeds text[] NOT NULL DEFAULT []`. Pushed via `pnpm --filter @workspace/db push`.
