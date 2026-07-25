---
name: Equipment filter OR semantics bug
description: isEquipmentCompatible used `every` for the bodyweight check, excluding mixed-equipment exercises for bodyweight clients; fix is `some`. Also documents the FULL_BODY Hip-dominant catalogue gap and its fallback slot pattern.
---

## Rule
Exercise equipment lists are OR semantics — the client needs ANY ONE of the listed items.
`isEquipmentCompatible` in `planDraftDayRecommendationsService.ts` must use `some` (not `every`) when testing whether ANY equipment option is bodyweight/no-equipment.

## What went wrong
```ts
// WRONG — requires ALL equipment options to be bodyweight:
if (exerciseEquipment.every((e) => BODYWEIGHT_EQUIPMENT.has(e.trim().toLowerCase()))) {
  return true;
}
```
Glute bridge has `equipment = ["Masa własnego ciała", "Hantle"]`.
"Hantle" fails the `every` check → the function then looks for "Hantle" in client gear ("Brak sprzętu") → not found → exercise excluded from pool.

```ts
// CORRECT — any one bodyweight option means the exercise is doable without gear:
if (exerciseEquipment.some((e) => BODYWEIGHT_EQUIPMENT.has(e.trim().toLowerCase()))) {
  return true;
}
```

**Why:** Equipment tags on exercises mean "you can use any of these". Listing "Masa własnego ciała" alongside "Hantle" means "works with bodyweight OR with dumbbells". A bodyweight-only client can do it.

## Downstream effect: FULL_BODY Hip-dominant slot
For home/bodyweight profiles (Dom + Brak sprzętu), Glute bridge (id=105) is the ONLY hinge exercise in the catalogue. After it is week-excluded on day 2, Hip-dominant gets 0 candidates → session drops to 3 exercises → V0_BLOCKING_FAILURE → 422 → frontend shows 0 exercises.

**Fix:** Add a "Lower body supplement" fallback slot in `ExerciseSelectionEngineV0.ts` (FULL_BODY branch) that fires when Hip-dominant returns null. Mirrors the PLYO calves → lower-accessory fallback pattern:

```ts
const fbHip = pick("Hip-dominant", true, ...);
if (!fbHip) {
  pick("Lower body supplement", false, (ex) =>
    muscle(ex, "Mięśnie czworogłowe uda", "Mięśnie dwugłowe uda", "Pośladki"));
}
```

**How to apply:** Whenever adding new required slots to any session type, check whether the catalogue has enough exercises for thin-profile clients (bodyweight-only, home, beginner). If a slot can realistically reach 0 candidates after week-exclusion, add an optional fallback.
