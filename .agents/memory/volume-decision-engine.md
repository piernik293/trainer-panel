---
name: Volume Decision Engine (Phase 2)
description: Key design decisions for the weekly volume decision engine (planDraftVolumeDecisionService.ts)
---

## guidelineMin / guidelineMax mapping
- `guidelineMin` = `weekly_preferred_ceiling` (the preferred weekly target)
- `guidelineMax` = `weekly_absolute_ceiling` (the absolute maximum)
- NOT session_min/session_max — those are per-session and not used in Phase 2.

**Why:** The decision engine recommends starting volumes for the week. The "approved range" for the wizard is preferred→absolute, not session-based.

## Range position by experience level
- "Brak aktywności fizycznej" → 0.00 (lower boundary)
- "Początkujący" → 0.25 (lower quarter)
- "Średniozaawansowany" → 0.50 (middle)
- "Zaawansowany" → 0.50 (middle — same as Średniozaawansowany)

**Why:** Intermediate and advanced trainers start at the midpoint; beginners and inactive clients at lower volumes.

## Adjustment storage precision
`priorityAdjustment`, `recoveryAdjustment`, `availabilityAdjustment` are all stored **after** `round05()` in the decision struct. Tests must compare against the rounded values, not the raw calculations.

**Example:** +20% of range 4 = 0.8 → stored as 1.0 (round05). Test: `expect(d.priorityAdjustment).toBe(1.0)` not `.toBeCloseTo(0.8)`.

## DraftVolumePreviewBody schema
Uses `PlanDraftGenerationPreferences` which requires `priorityMuscleGroups: string[]` and `preferredTrainingStyle: string | null` in addition to the basic fields. Pass all fields explicitly in the wizard's mutateAsync call.

## api-client-react → api-zod dependency
Added `@workspace/api-zod: workspace:*` to `lib/api-client-react/package.json` and a references entry in tsconfig.json so `custom-hooks.ts` can import `WeeklyVolumeDecisionResponseType`.

## Route registration
POST /plans/draft-volume/preview is in `artifacts/api-server/src/routes/planDraftInput.ts` (same file as the Phase 1 routes), mounted via the existing planDraftInput router in routes/index.ts.

## Wizard Step 3 flow
- "Oblicz objętość" button on Step 2 calls `useDraftVolumePreview().mutateAsync()`
- Result stored in `volumeDecisions` state; per-target overrides stored in `volumeOverrides: Record<number, number>`
- On override: sends overridden value back as `trainerVolumeOverrides` on next call
- selectedValue = overrideValue ?? decision.recommendedValue (purely local/display)
