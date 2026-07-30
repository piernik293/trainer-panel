---
name: Progression suitability scoring
description: The scoreProgressionSuitability dimension and its companion engine flags for intermediate dumbbell clients.
---

# Progression suitability scoring (Task #86)

## The rule
Intermediate+ clients with loadable equipment (Hantle / Sztanga / Kettlebell) should receive loadable exercises over bodyweight regressions. Three coordinated changes enforce this:

### 1. `scoreProgressionSuitability` in `recommendation-engine.ts`
- **+12** for exercises that use Hantle/Sztanga/Kettlebell and are NOT `suitableForNoActivity`
- **−8** for exercises with `suitableForNoActivity = true` (beginner regressions)
- **0** for pure bodyweight non-regressions (pull-ups, dips, core — neutral/appropriate any level)
- **Only fires** when `experienceLevel ∈ {"Średniozaawansowany","Zaawansowany"}` AND survey.equipment includes loadable equipment

**Why:** `scoreEquipment` gives +15 to both bodyweight and dumbbell exercises equally (bodyweight = always accessible). `scoreDifficultyMatch` gives +10 to "Początkujący" difficulty for intermediate clients. Without this dimension, incline push-up == dumbbell bench press for an intermediate dumbbell client.

### 2. `deprioritizePushUps` extended in `planDraftGenerateDay.ts`
Was: only fires when `isFullGym` (barbell + machines).
Now: fires when `hasLoadableEquipment` (Hantle OR Sztanga OR Kettlebell) AND `isPriorityEligible` AND `isDeprioritizableBias` AND `!prefersPushUps`.

### 3. `capPushUpsAtOne` in `V0PriorityContext` / `pick()`
New flag. When true, after one "Pompki..." exercise is selected into the session, all subsequent slot picks exclude any exercise whose name starts with "pompki". The cap fires when `hasLoadableEquipment && isPriorityEligible`.

**How to apply:** Both `deprioritizePushUps` and `capPushUpsAtOne` are set in `planDraftGenerateDay.ts` and passed through `priorityContext` to the engine. The cap is enforced inside the `pick()` closure by checking `results.some(r => r.ex.name.startsWith("pompki"))`.

## Safe fallbacks preserved
- Penalty is score-based, not a hard filter — regressions remain selectable when they're the only option
- Beginners and inactive clients: dimension returns 0 (no change to their behavior)
- Clients without loadable equipment: dimension returns 0
- Clients who explicitly prefer push-ups (`preferredExerciseKeywords` contains "pompk"): `deprioritizePushUps = false`, `capPushUpsAtOne` still applies (the cap is about session diversity, not preference)
