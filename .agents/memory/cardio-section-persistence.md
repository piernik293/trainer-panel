---
name: Cardio section persistence pattern
description: How cardioRecommendation is stored and surfaced in the plan editor; why surveyCardio is included in getPlanFull.
---

## Rule
`workout_plans.cardio_recommendation` is a nullable TEXT column storing JSON-serialized `CardioRecommendationData`. The trainer saves an override via `PATCH /plans/:id { cardioRecommendation: JSON.stringify(...) }`.

**Why:** No separate table; plain TEXT with JSON avoids schema complexity for a small structured blob. Null means "not yet saved by trainer" — the frontend generates a fresh recommendation from survey data on the fly.

## How to apply
- `getPlanFull` always fetches survey cardio fields (`cardioPreference`, `cardioFrequency`, `preferredCardioType`, `activityLevel`, `trainingGoal`, `healthLimitations`, `injuryStatus`) and returns them as `surveyCardio`.
- `CardioSection` component: uses stored JSON if present; falls back to `generateCardioRecommendation(inputs)` from `lib/cardioGenerator.ts`.
- `useUpdatePlan` mutation accepts `cardioRecommendation?: string | null`.
- `SaveDraftPlanBody` and `SaveDraftPlanInput` also accept `cardioRecommendation` so wizard saves can carry it through.
