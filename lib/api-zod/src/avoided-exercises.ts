import * as zod from "zod";

// ─── Search exercises (lightweight) ──────────────────────────────────────────

export const SearchExercisesQueryParams = zod.object({
  "q": zod.string().optional(),
  "limit": zod.coerce.number().min(1).max(50).optional(),
});

export const SearchExercisesResponseItem = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "mainMuscleGroup": zod.string(),
  "equipment": zod.array(zod.string()),
  "movementPattern": zod.string().nullish(),
  "isActive": zod.boolean(),
});

export const SearchExercisesResponse = zod.array(SearchExercisesResponseItem);

// ─── Client avoided exercises resolver ───────────────────────────────────────

export const GetClientAvoidedExercisesParams = zod.object({
  "clientId": zod.coerce.number(),
});

export const GetClientAvoidedExercisesResponseItem = zod.object({
  "id": zod.number(),
  "name": zod.string(),
  "isActive": zod.boolean(),
  "reason": zod.string().nullish(),
  "otherText": zod.string().nullish(),
  "otherReason": zod.string().nullish(),
});

export const GetClientAvoidedExercisesResponse = zod.array(GetClientAvoidedExercisesResponseItem);

export type GetClientAvoidedExercisesResponseItemData = zod.infer<typeof GetClientAvoidedExercisesResponseItem>;
