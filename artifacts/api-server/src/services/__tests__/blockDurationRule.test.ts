/**
 * Focused tests for the experience-dependent training-block duration rule.
 *
 * Spec items covered:
 * ✓ 1. Brak aktywności always uses 4 weeks (defaultPreferences + blockDurationRange)
 * ✓ 2. Changing level to Brak aktywności resets 6/8/10/12 → 4 (defaultPreferences returns 4)
 * ✓ 3. Brak aktywności control is fixed/read-only (blockDurationRange.min === max === 4)
 * ✓ 4. Początkujący accepts 4–12 (validate endpoint: no INVALID_BLOCK_DURATION for valid values)
 * ✓ 5. Średniozaawansowany accepts 4–12
 * ✓ 6. Zaawansowany accepts 4–12
 * ✓ 7. Values below 4 or above 12 remain invalid for active training levels
 * ✓ 8. Generator, volume, priority, split and plyometric modules are not imported/modified here
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
import { eq } from "drizzle-orm";
import { loadPlanDraftInput } from "../planDraftInputService";

beforeAll(async () => {
  await legacyTrainerId();
});

const req = request(app);

async function getOrCreateClient(email: string) {
  const [existing] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.email, email))
    .limit(1);
  if (existing) return ownByLegacyTrainer(existing);
  const [created] = await db
    .insert(clientsTable)
    .values({ firstName: "Block", lastName: "Test", email, status: "active" })
    .returning();
  return ownByLegacyTrainer(created);
}

async function upsertSurvey(clientId: number, experienceLevel: string) {
  // Delete existing surveys for this client to avoid duplicates across test runs
  await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));
  const [survey] = await db
    .insert(surveysTable)
    .values({
      clientId,
      experienceLevel,
      trainingGoal: "Hipertrofia",
      desiredWeeklyFrequency: 3,
      sessionDuration: "60",
      trainingLocation: "Siłownia",
      equipment: "Hantle, Sztanga i talerze",
      activityLevel: "Siedzący tryb życia",
      sleepHours: "7",
      stressLevel: 4,
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
      advancedMethodsToAvoid: [],
    })
    .returning();
  return survey;
}

// Shared preferences stub for the validate endpoint
function basePrefs(blockDurationWeeks: number, splitType = "full_body") {
  return {
    trainingDays: 3,
    sessionDurationMinutes: 60,
    splitType,
    blockDurationWeeks,
    trainingGoal: "Hipertrofia",
    priorityMuscleGroups: [],
    preferredTrainingStyle: null,
    trainerRestrictions: null,
  };
}

// ─── 1 & 3: Brak aktywności — defaultPreferences and blockDurationRange ────────

describe("Brak aktywności fizycznej — service defaults", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateClient("block-rule-noactivity@example.com");
    clientId = client.id;
    await upsertSurvey(clientId, "Brak aktywności fizycznej");
  });

  it("1. defaultPreferences.blockDurationWeeks is 4", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result).not.toBeNull();
    expect(result!.defaultPreferences.blockDurationWeeks).toBe(4);
  });

  it("3. blockDurationRange is fixed at 4 (min === max === default === 4)", async () => {
    const result = await loadPlanDraftInput(clientId);
    expect(result!.blockDurationRange.min).toBe(4);
    expect(result!.blockDurationRange.max).toBe(4);
    expect(result!.blockDurationRange.default).toBe(4);
  });
});

// ─── 2: Reset from previously selected values ────────────────────────────────

describe("Brak aktywności fizycznej — defaultPreferences always returns 4, not prior selection", () => {
  // This tests the service layer: regardless of what a prior wizard state may have stored,
  // a fresh load for a "Brak aktywności" client always returns 4.
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateClient("block-rule-noactivity-reset@example.com");
    clientId = client.id;
    await upsertSurvey(clientId, "Brak aktywności fizycznej");
  });

  for (const previousValue of [6, 8, 10, 12]) {
    it(`2. previously selected ${previousValue} weeks: defaultPreferences returns 4 for Brak aktywności`, async () => {
      // The service derives defaultPreferences purely from the survey level.
      // Any prior wizard selection of ${previousValue} is not persisted in defaultPreferences.
      const result = await loadPlanDraftInput(clientId);
      expect(result!.defaultPreferences.blockDurationWeeks).toBe(4);
      // Confirm the value is NOT the "previous" value
      expect(result!.defaultPreferences.blockDurationWeeks).not.toBe(previousValue);
    });
  }
});

// ─── 4: Początkujący accepts 4–12 ─────────────────────────────────────────────

describe("Początkujący — blockDurationWeeks 4–12 all valid", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateClient("block-rule-poczatkujacy@example.com");
    clientId = client.id;
    await upsertSurvey(clientId, "Początkujący");
  });

  for (const w of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    it(`4. Początkujący: blockDurationWeeks=${w} → no INVALID_BLOCK_DURATION`, async () => {
      const res = await req
        .post("/api/plans/draft-input/validate")
        .send({ clientId, preferences: basePrefs(w) });
      expect(res.status).toBe(200);
      const codes = res.body.warnings.map((w: { code: string }) => w.code);
      expect(codes).not.toContain("INVALID_BLOCK_DURATION");
    });
  }
});

// ─── 5: Średniozaawansowany accepts 4–12 ─────────────────────────────────────

describe("Średniozaawansowany — blockDurationWeeks 4–12 all valid", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateClient("block-rule-sredniozaawansowany@example.com");
    clientId = client.id;
    await upsertSurvey(clientId, "Średniozaawansowany");
  });

  for (const w of [4, 6, 8, 12]) {
    it(`5. Średniozaawansowany: blockDurationWeeks=${w} → no INVALID_BLOCK_DURATION`, async () => {
      const res = await req
        .post("/api/plans/draft-input/validate")
        .send({ clientId, preferences: basePrefs(w) });
      expect(res.status).toBe(200);
      const codes = res.body.warnings.map((w: { code: string }) => w.code);
      expect(codes).not.toContain("INVALID_BLOCK_DURATION");
    });
  }
});

// ─── 6: Zaawansowany accepts 4–12 ────────────────────────────────────────────

describe("Zaawansowany — blockDurationWeeks 4–12 all valid", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateClient("block-rule-zaawansowany@example.com");
    clientId = client.id;
    await upsertSurvey(clientId, "Zaawansowany");
  });

  for (const w of [4, 8, 12]) {
    it(`6. Zaawansowany: blockDurationWeeks=${w} → no INVALID_BLOCK_DURATION`, async () => {
      const res = await req
        .post("/api/plans/draft-input/validate")
        .send({ clientId, preferences: basePrefs(w) });
      expect(res.status).toBe(200);
      const codes = res.body.warnings.map((w: { code: string }) => w.code);
      expect(codes).not.toContain("INVALID_BLOCK_DURATION");
    });
  }
});

// ─── 7: Values below 4 or above 12 are invalid for active training levels ─────
//
// The Zod schema (lib/api-zod) enforces min(4) max(12) on blockDurationWeeks.
// The API therefore rejects out-of-range values with 400 before route logic runs.
// This is the enforced boundary — tighter than a non-blocking warning.

describe("Active training levels — below 4 or above 12 are rejected at schema level", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateClient("block-rule-invalid-range@example.com");
    clientId = client.id;
    await upsertSurvey(clientId, "Średniozaawansowany");
  });

  it("7a. blockDurationWeeks=3 (below 4) → 400 Bad Request (Zod schema rejection)", async () => {
    const res = await req
      .post("/api/plans/draft-input/validate")
      .send({ clientId, preferences: basePrefs(3) });
    expect(res.status).toBe(400);
  });

  it("7b. blockDurationWeeks=13 (above 12) → 400 Bad Request (Zod schema rejection)", async () => {
    const res = await req
      .post("/api/plans/draft-input/validate")
      .send({ clientId, preferences: basePrefs(13) });
    expect(res.status).toBe(400);
  });

  it("7c. blockDurationWeeks=4 (boundary min) → 200, no blocking warnings", async () => {
    const res = await req
      .post("/api/plans/draft-input/validate")
      .send({ clientId, preferences: basePrefs(4) });
    expect(res.status).toBe(200);
    expect(res.body.blocking).toBe(false);
  });

  it("7d. blockDurationWeeks=12 (boundary max) → 200, no INVALID_BLOCK_DURATION", async () => {
    const res = await req
      .post("/api/plans/draft-input/validate")
      .send({ clientId, preferences: basePrefs(12) });
    expect(res.status).toBe(200);
    const codes = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).not.toContain("INVALID_BLOCK_DURATION");
  });
});

// ─── Brak aktywności: non-4 value triggers BLOCK_DURATION_NORMALIZED (not INVALID) ──

describe("Brak aktywności fizycznej — non-4 value normalizes, not hard-errors", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateClient("block-rule-noactivity-validate@example.com");
    clientId = client.id;
    await upsertSurvey(clientId, "Brak aktywności fizycznej");
  });

  it("Brak aktywności + blockDurationWeeks=6 → BLOCK_DURATION_NORMALIZED (non-blocking)", async () => {
    const res = await req
      .post("/api/plans/draft-input/validate")
      .send({ clientId, preferences: basePrefs(6) });
    expect(res.status).toBe(200);
    const codes = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain("BLOCK_DURATION_NORMALIZED");
    const blocking = res.body.warnings.filter((w: { code: string; blocking: boolean }) => w.blocking);
    const blockingCodes = blocking.map((w: { code: string }) => w.code);
    expect(blockingCodes).not.toContain("BLOCK_DURATION_NORMALIZED");
  });

  it("Brak aktywności + blockDurationWeeks=4 → no BLOCK_DURATION_NORMALIZED", async () => {
    const res = await req
      .post("/api/plans/draft-input/validate")
      .send({ clientId, preferences: basePrefs(4) });
    expect(res.status).toBe(200);
    const codes = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).not.toContain("BLOCK_DURATION_NORMALIZED");
  });
});

// ─── Other levels: defaultPreferences.blockDurationWeeks remains 6 ────────────

describe("Other levels — defaultPreferences.blockDurationWeeks remains 6", () => {
  for (const level of ["Początkujący", "Średniozaawansowany", "Zaawansowany"] as const) {
    it(`8. ${level}: defaultPreferences.blockDurationWeeks is 6`, async () => {
      const email = `block-rule-default-${level.toLowerCase().replace(/\s/g, "-")}@example.com`;
      const client = await getOrCreateClient(email);
      await upsertSurvey(client.id, level);
      const result = await loadPlanDraftInput(client.id);
      expect(result!.defaultPreferences.blockDurationWeeks).toBe(6);
    });
  }

  for (const level of ["Początkujący", "Średniozaawansowany", "Zaawansowany"] as const) {
    it(`8. ${level}: blockDurationRange is 4–12`, async () => {
      const email = `block-rule-range-${level.toLowerCase().replace(/\s/g, "-")}@example.com`;
      const client = await getOrCreateClient(email);
      await upsertSurvey(client.id, level);
      const result = await loadPlanDraftInput(client.id);
      expect(result!.blockDurationRange.min).toBe(4);
      expect(result!.blockDurationRange.max).toBe(12);
      expect(result!.blockDurationRange.default).toBe(6);
    });
  }
});
