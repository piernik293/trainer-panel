/**
 * Tests for Plan Draft Input Service (Phase 1 — Workout Plan Draft Generator)
 *
 * Covers:
 *  - GET /api/clients/:clientId/plan-draft-input
 *  - POST /api/plans/draft-input/validate
 *  - loadPlanDraftInput() service function
 *  - Equipment normalization
 *  - Warning codes and blocking flags
 *  - Experience level validation
 *  - Default preferences derivation
 *  - No plan creation / data modification side effects
 */

// Trainer endpoints require a session: authenticate as the legacy test
// trainer (see __tests__/helpers/legacyTrainer.ts).
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "legacy_test_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, vi } from "vitest";
import { legacyTrainerId, ownByLegacyTrainer } from "../../__tests__/helpers/legacyTrainer";
import request from "supertest";
import app from "../../app";
import { db, clientsTable, surveysTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { loadPlanDraftInput } from "../planDraftInputService";
import { normalizeEquipmentList, CANONICAL_EQUIPMENT } from "../equipmentNormalizer";
import { getCompatibleSplits, SPLIT_TYPES } from "@workspace/api-zod";

beforeAll(async () => {
  await legacyTrainerId();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const req = request(app);

async function getOrCreateTestClient(email: string) {
  const [existing] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.email, email))
    .limit(1);
  if (existing) return ownByLegacyTrainer(existing);

  const [created] = await db
    .insert(clientsTable)
    .values({
      firstName: "Draft",
      lastName: "Test",
      email,
      status: "active",
    })
    .returning();
  return ownByLegacyTrainer(created);
}

async function insertSurvey(clientId: number, overrides: Record<string, unknown> = {}) {
  const defaults = {
    clientId,
    experienceLevel: "Średniozaawansowany",
    trainingGoal: "Hipertrofia",
    desiredWeeklyFrequency: 4,
    sessionDuration: "60",
    trainingLocation: "Siłownia",
    equipment: "Hantle, Sztanga i talerze, Ławeczka treningowa",
    activityLevel: "Siedzący tryb życia",
    sleepHours: "7",
    stressLevel: 4,
    priorityMuscle1: "Klatka piersiowa",
    priorityMuscle2: "Plecy",
    priorityMuscle3: null,
    avoidedExerciseIds: [] as number[],
    avoidedExerciseReasons: {} as Record<string, string>,
    advancedMethodsToAvoid: [] as string[],
  };
  const values = { ...defaults, ...overrides };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [survey] = await db.insert(surveysTable).values(values as any).returning();
  return survey;
}

// ─── Equipment normalizer tests ───────────────────────────────────────────────

describe("normalizeEquipmentList()", () => {
  it("1. returns empty array for null", () => {
    expect(normalizeEquipmentList(null)).toEqual([]);
  });

  it("2. returns empty array for empty string", () => {
    expect(normalizeEquipmentList("")).toEqual([]);
  });

  it("3. maps lowercase alias to canonical", () => {
    const result = normalizeEquipmentList("hantle");
    expect(result).toContain("Hantle");
  });

  it("4. maps comma-separated list", () => {
    const result = normalizeEquipmentList("hantle, kettlebell, gumy");
    expect(result).toContain("Hantle");
    expect(result).toContain("Kettlebell");
    expect(result).toContain("Gumy oporowe");
  });

  it("5. deduplicates identical canonical values", () => {
    const result = normalizeEquipmentList("hantle, Hantle, dumbbell");
    expect(result.filter((v) => v === "Hantle").length).toBe(1);
  });

  it("6. preserves unknown tokens as-is", () => {
    const result = normalizeEquipmentList("Sprzęt XXX");
    expect(result).toContain("Sprzęt XXX");
  });

  it("7. handles semicolon-separated input", () => {
    const result = normalizeEquipmentList("hantle; kettlebell");
    expect(result).toContain("Hantle");
    expect(result).toContain("Kettlebell");
  });

  it("8. maps 'brak sprzętu' correctly", () => {
    const result = normalizeEquipmentList("brak sprzętu");
    expect(result).toContain("Brak sprzętu");
  });

  it("9. maps 'TRX' alias", () => {
    const result = normalizeEquipmentList("trx");
    expect(result).toContain("TRX / pasy treningowe");
  });

  it("10. handles mixed case", () => {
    const result = normalizeEquipmentList("HANTLE");
    expect(result).toContain("Hantle");
  });
});

// ─── getCompatibleSplits() tests ──────────────────────────────────────────────

describe("getCompatibleSplits()", () => {
  it("11. 2 days → full_body_ab and custom", () => {
    const splits = getCompatibleSplits(2);
    expect(splits).toContain("full_body_ab");
    expect(splits).toContain("custom");
  });

  it("12. 3 days → full_body, upper_lower_full_body, and push_pull_legs", () => {
    const splits = getCompatibleSplits(3);
    expect(splits).toContain("full_body");
    expect(splits).toContain("upper_lower_full_body");
    // Classic 3-day PPL is a valid match
    expect(splits).toContain("push_pull_legs");
  });

  it("13. 4 days → upper_lower and push_pull_lower_full_body (no PPL)", () => {
    const splits = getCompatibleSplits(4);
    expect(splits).toContain("upper_lower");
    expect(splits).toContain("push_pull_lower_full_body");
    // PPL with 4 days creates Push/Pull/Legs/Push — unbalanced
    expect(splits).not.toContain("push_pull_legs");
  });

  it("14. 5 days → upper_lower_full_body, push_pull_legs, and specialization", () => {
    // 5-day PPL (e.g. P/P/L/Push/Pull) is a common and valid structure.
    // recommendSplit() also returns push_pull_legs as recommended for 5 days
    // (non-poor recovery), so both must agree.
    const splits = getCompatibleSplits(5);
    expect(splits).toContain("upper_lower_full_body");
    expect(splits).toContain("push_pull_legs");
    expect(splits).toContain("specialization");
    // 4-day PPL (P/P/L/Push — orphaned day) is excluded; 5-day is valid
    expect(getCompatibleSplits(4)).not.toContain("push_pull_legs");
  });

  it("14b. 6 days → push_pull_legs (divides evenly: PPL×2)", () => {
    const splits = getCompatibleSplits(6);
    expect(splits).toContain("push_pull_legs");
  });

  it("15. null days → full_body and custom (full_body is the unknown-days fallback)", () => {
    // When training days are unknown, Full Body is the safest fallback split.
    // The function returns ["full_body", "custom"], not just ["custom"].
    const splits = getCompatibleSplits(null);
    expect(splits).toContain("full_body");
    expect(splits).toContain("custom");
    expect(splits.length).toBe(2);
  });
});

// ─── GET /api/clients/:clientId/plan-draft-input ──────────────────────────────

describe("GET /api/clients/:clientId/plan-draft-input", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient("plan-draft-input-test@example.com");
    clientId = client.id;
  });

  it("16. returns 404 for non-existent client", async () => {
    const res = await req.get("/api/clients/999999999/plan-draft-input");
    expect(res.status).toBe(404);
  });

  it("17. returns 400 for non-numeric clientId", async () => {
    const res = await req.get("/api/clients/abc/plan-draft-input");
    expect(res.status).toBe(400);
  });

  it("18. returns 200 with correct structure for client without survey", async () => {
    const res = await req.get(`/api/clients/${clientId}/plan-draft-input`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("client");
    expect(res.body).toHaveProperty("input");
    expect(res.body).toHaveProperty("sources");
    expect(res.body).toHaveProperty("warnings");
    expect(res.body).toHaveProperty("defaultPreferences");
    expect(res.body).toHaveProperty("allowedSplitTypes");
    expect(res.body).toHaveProperty("blockDurationRange");
  });

  it("19. client without survey has MISSING_CLIENT_SURVEY warning", async () => {
    const res = await req.get(`/api/clients/${clientId}/plan-draft-input`);
    const codes = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain("MISSING_CLIENT_SURVEY");
  });

  it("20. client without survey has MISSING_EXPERIENCE_LEVEL blocking warning", async () => {
    const res = await req.get(`/api/clients/${clientId}/plan-draft-input`);
    const blocking = res.body.warnings.filter((w: { code: string; blocking: boolean }) => w.blocking);
    expect(blocking.length).toBeGreaterThan(0);
  });

  it("21. blockDurationRange has correct bounds", async () => {
    const res = await req.get(`/api/clients/${clientId}/plan-draft-input`);
    expect(res.body.blockDurationRange.min).toBe(4);
    expect(res.body.blockDurationRange.max).toBe(12);
    expect(res.body.blockDurationRange.default).toBe(6);
  });

  it("22. allowedSplitTypes is a non-empty array of valid split keys", async () => {
    const res = await req.get(`/api/clients/${clientId}/plan-draft-input`);
    expect(Array.isArray(res.body.allowedSplitTypes)).toBe(true);
    for (const s of res.body.allowedSplitTypes) {
      expect(SPLIT_TYPES).toContain(s);
    }
  });
});

// ─── loadPlanDraftInput() with survey ────────────────────────────────────────

describe("loadPlanDraftInput() with survey data", () => {
  let clientId: number;
  let surveyId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient("plan-draft-full-test@example.com");
    clientId = client.id;

    // Insert a complete survey
    const survey = await db
      .insert(surveysTable)
      .values({
        clientId,
        experienceLevel: "Średniozaawansowany",
        trainingGoal: "Hipertrofia",
        desiredWeeklyFrequency: 4,
        sessionDuration: "60",
        trainingLocation: "Siłownia",
        equipment: "hantle, kettlebell, gumy",
        activityLevel: "Siedzący tryb życia",
        sleepHours: "7",
        stressLevel: 3,
        priorityMuscle1: "Klatka piersiowa",
        priorityMuscle2: "Plecy",
        priorityMuscle3: null,
        avoidedExerciseIds: [],
        avoidedExerciseReasons: {},
        advancedMethodsToAvoid: [],
      })
      .returning();
    surveyId = survey[0].id;
  });

  it("23. returns null for non-existent client", async () => {
    const result = await loadPlanDraftInput(999999999);
    expect(result).toBeNull();
  });

  it("24. returns correct client data", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result).not.toBeNull();
    expect(result!.client.id).toBe(clientId);
    expect(typeof result!.client.firstName).toBe("string");
  });

  it("25. surveyId is populated from latest survey", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.surveyId).toBe(surveyId);
  });

  it("26. experience level is loaded correctly from survey", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.experienceLevel).toBe("Średniozaawansowany");
    expect(result!.sources.experienceLevel).toBe("interview");
  });

  it("27. equipment is normalized from survey aliases", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.availableEquipment).toContain("Hantle");
    expect(result!.input.availableEquipment).toContain("Kettlebell");
    expect(result!.input.availableEquipment).toContain("Gumy oporowe");
  });

  it("28. available days is loaded from desiredWeeklyFrequency", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.availableDays).toBe(4);
    expect(result!.sources.availableDays).toBe("interview");
  });

  it("29. recoveryQuality is derived (not missing) when sleep + stress present", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.sources.recoveryQuality).toBe("derived");
    expect(result!.input.recoveryQuality).not.toBeNull();
  });

  it("30. priority muscle groups are extracted from priorityMuscle1/2/3", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.priorityMuscleGroups).toContain("Klatka piersiowa");
    expect(result!.input.priorityMuscleGroups).toContain("Plecy");
  });

  it("31. defaultPreferences.splitType is compatible with availableDays", async () => {
    const result = await loadPlanDraftInput(clientId);
    const compatible = getCompatibleSplits(result!.input.availableDays);
    expect(compatible).toContain(result!.defaultPreferences.splitType);
  });

  it("32. defaultPreferences.blockDurationWeeks is 6", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.defaultPreferences.blockDurationWeeks).toBe(6);
  });

  it("33. valid experience level produces no MISSING/INVALID_EXPERIENCE_LEVEL warning", async () => {
    const result = await loadPlanDraftInput(clientId);
    const codes = result!.warnings.map((w) => w.code);
    expect(codes).not.toContain("MISSING_EXPERIENCE_LEVEL");
    expect(codes).not.toContain("INVALID_EXPERIENCE_LEVEL");
  });

  it("34. invalid experience level produces INVALID_EXPERIENCE_LEVEL blocking warning", async () => {
    // Create a client with an invalid level survey
    const badClient = await getOrCreateTestClient("plan-draft-badlevel@example.com");
    await db.insert(surveysTable).values({
      clientId: badClient.id,
      experienceLevel: "InvalidLevel",
      trainingGoal: null,
      desiredWeeklyFrequency: null,
      sessionDuration: null,
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
      advancedMethodsToAvoid: [],
    });

    const result = await loadPlanDraftInput(badClient.id);
    expect(result).not.toBeNull();
    const codes = result!.warnings.map((w) => w.code);
    expect(codes).toContain("INVALID_EXPERIENCE_LEVEL");
    const blocking = result!.warnings.filter((w) => w.blocking);
    expect(blocking.length).toBeGreaterThan(0);
  });

  it("35. service does NOT create a plan, does NOT modify DB data", async () => {
    const result = await loadPlanDraftInput(clientId);
    // Verify the survey is unchanged
    const [survey] = await db
      .select()
      .from(surveysTable)
      .where(eq(surveysTable.id, surveyId))
      .limit(1);
    expect(survey.experienceLevel).toBe("Średniozaawansowany");
    expect(survey.trainingGoal).toBe("Hipertrofia");
    // No plan was created — result has no planId
    expect(result).not.toHaveProperty("planId");
    expect(result).not.toHaveProperty("generatedPlan");
  });
});

// ─── 6/7-day survey: defaultPreferences.splitType ────────────────────────────
//
// Regression guard for the 6-7 day split compatibility bug:
// previously recommendSplit() returned "upper_lower" for ≥6 days, which is
// absent from getCompatibleSplits(≥6). planDraftInputService then set
// defaultPreferences.splitType to that incompatible value.
//
// The fix (returning "push_pull_legs" for all 6-7 day branches) must keep
// defaultPreferences.splitType inside the compatible set.

describe("loadPlanDraftInput() — 6-day survey: defaultPreferences.splitType ∈ getCompatibleSplits(6)", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient("plan-draft-6day-advanced@example.com");
    clientId = client.id;
    await insertSurvey(clientId, {
      experienceLevel: "Zaawansowany",
      trainingGoal: "Hipertrofia",
      desiredWeeklyFrequency: 6,
      sleepHours: "7",
      stressLevel: 3,
    });
  });

  it("38. defaultPreferences.splitType ∈ getCompatibleSplits(6) — advanced, good recovery", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result).not.toBeNull();
    const compatible = getCompatibleSplits(result!.input.availableDays);
    expect(compatible).toContain(result!.defaultPreferences.splitType);
  });

  it("39. defaultPreferences.splitType is NOT upper_lower (incompatible at 6 days)", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.defaultPreferences.splitType).not.toBe("upper_lower");
  });

  it("40. defaultPreferences.splitType is NOT upper_lower_full_body (incompatible at 6 days)", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.defaultPreferences.splitType).not.toBe("upper_lower_full_body");
  });

  it("41. availableDays is 6 (loaded from desiredWeeklyFrequency)", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.availableDays).toBe(6);
  });
});

describe("loadPlanDraftInput() — 6-day survey: intermediate + poor recovery → splitType ∈ getCompatibleSplits(6)", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient("plan-draft-6day-intermediate-poor@example.com");
    clientId = client.id;
    await insertSurvey(clientId, {
      experienceLevel: "Średniozaawansowany",
      trainingGoal: "Siła",
      desiredWeeklyFrequency: 6,
      // sleep 5h + stress 8 → poor recovery derived by the service
      sleepHours: "5",
      stressLevel: 8,
    });
  });

  it("42. defaultPreferences.splitType ∈ getCompatibleSplits(6) — intermediate, poor recovery", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result).not.toBeNull();
    const compatible = getCompatibleSplits(result!.input.availableDays);
    expect(compatible).toContain(result!.defaultPreferences.splitType);
  });

  it("43. defaultPreferences.splitType is NOT upper_lower or upper_lower_full_body", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.defaultPreferences.splitType).not.toBe("upper_lower");
    expect(result!.defaultPreferences.splitType).not.toBe("upper_lower_full_body");
  });
});

describe("loadPlanDraftInput() — 7-day survey: defaultPreferences.splitType ∈ getCompatibleSplits(7)", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient("plan-draft-7day-advanced@example.com");
    clientId = client.id;
    await insertSurvey(clientId, {
      experienceLevel: "Zaawansowany",
      trainingGoal: "Hipertrofia",
      desiredWeeklyFrequency: 7,
      sleepHours: "8",
      stressLevel: 2,
    });
  });

  it("44. defaultPreferences.splitType ∈ getCompatibleSplits(7) — advanced, excellent recovery", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result).not.toBeNull();
    const compatible = getCompatibleSplits(result!.input.availableDays);
    expect(compatible).toContain(result!.defaultPreferences.splitType);
  });

  it("45. defaultPreferences.splitType is NOT upper_lower (incompatible at 7 days)", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.defaultPreferences.splitType).not.toBe("upper_lower");
  });

  it("46. defaultPreferences.splitType is NOT upper_lower_full_body (incompatible at 7 days)", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.defaultPreferences.splitType).not.toBe("upper_lower_full_body");
  });

  it("47. availableDays is 7 (loaded from desiredWeeklyFrequency)", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.availableDays).toBe(7);
  });
});

// ─── POST /api/plans/draft-input/validate ─────────────────────────────────────

describe("POST /api/plans/draft-input/validate", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient("plan-draft-validate-test@example.com");
    clientId = client.id;
    // Insert a survey with valid experience level
    await db.insert(surveysTable).values({
      clientId,
      experienceLevel: "Początkujący",
      trainingGoal: "Siła",
      desiredWeeklyFrequency: 3,
      sessionDuration: "45",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
      advancedMethodsToAvoid: [],
    });
  });

  it("36. returns 400 for missing body", async () => {
    const res = await req.post("/api/plans/draft-input/validate").send({});
    expect(res.status).toBe(400);
  });

  it("37. valid preferences with compatible split returns valid=true and no blocking warnings", async () => {
    const res = await req.post("/api/plans/draft-input/validate").send({
      clientId,
      preferences: {
        trainingDays: 3,
        sessionDurationMinutes: 45,
        splitType: "full_body",
        blockDurationWeeks: 6,
        trainingGoal: "Siła",
        priorityMuscleGroups: [],
        preferredTrainingStyle: null,
        trainerRestrictions: null,
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.blocking).toBe(false);
  });
});

describe("loadPlanDraftInput() — effective level (2-year rule, trainer override)", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient("plan-draft-effective-level@example.com");
    clientId = client.id;
    await db.update(clientsTable).set({ experienceLevelOverride: null }).where(eq(clientsTable.id, clientId));
    await insertSurvey(clientId, { experienceLevel: "Zaawansowany", trainingDuration: "1 rok" });
  });

  it("training under 2 years: generator input uses Początkujący and the trainer sees the warning", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.experienceLevel).toBe("Początkujący");
    const w = result!.warnings.find((x) => x.code === "EFFECTIVE_LEVEL_ADJUSTED");
    expect(w?.message).toContain("Klient wybrał „Zaawansowany”, staż 1 rok — plan jako „Początkujący”.");
  });

  it("trainer override restores the chosen level; no automatic warning about capping", async () => {
    await db.update(clientsTable).set({ experienceLevelOverride: "Zaawansowany" }).where(eq(clientsTable.id, clientId));
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.experienceLevel).toBe("Zaawansowany");
    expect(result!.warnings.some((x) => x.code === "EFFECTIVE_LEVEL_ADJUSTED")).toBe(false);
    await db.update(clientsTable).set({ experienceLevelOverride: null }).where(eq(clientsTable.id, clientId));
  });

  it("2+ years: no change, no warning", async () => {
    await insertSurvey(clientId, { experienceLevel: "Zaawansowany", trainingDuration: "3 lata" });
    const result = await loadPlanDraftInput(clientId);
    expect(result!.input.experienceLevel).toBe("Zaawansowany");
    expect(result!.warnings.some((x) => x.code === "EFFECTIVE_LEVEL_ADJUSTED")).toBe(false);
  });
});
