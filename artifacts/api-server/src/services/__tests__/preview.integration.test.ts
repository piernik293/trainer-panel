/**
 * Integration tests for calculateVolumePreview and the
 * POST /api/plans/volume-preview route.
 *
 * These tests hit the real development database.  They assume:
 *   - DATABASE_URL is set in the environment.
 *   - Plan 1 exists (clientId=20, Zaawansowany, exerciseId=1 bench press).
 *   - Exercise IDs 1 (bench press) and 2 (Podciąganie) exist.
 *   - Client 4 has no survey.  Client 19's most recent survey has an empty level.
 *   - Guideline version 1 is active and has guideline targets for all four levels.
 *
 * State restoration: any DB mutation (isActive=false) is reverted in afterEach.
 */

// Trainer endpoints require a session: authenticate as the legacy test
// trainer (see __tests__/helpers/legacyTrainer.ts).
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "legacy_test_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, afterEach, afterAll, vi, beforeAll } from "vitest";
import { legacyFixtureClient, legacyFixturePlan, legacyTrainerId, ownByLegacyTrainer } from "../../__tests__/helpers/legacyTrainer";
import request from "supertest";
import { and, count, eq, notExists, sql } from "drizzle-orm";
import app from "../../app";
import {
  calculateVolumePreview,
  calculatePlanVolume,
  type VolumePreviewInput,
} from "../volumeCalculator";
import {
  db,
  pool,
  exercisesTable,
  volumeGuidelinesTable,
  workoutPlanDaysTable,
  workoutPlanExercisesTable,
  exerciseMuscleAssignmentsTable,
  volumeTargetMembersTable,
} from "@workspace/db";

// Fixture clients replacing the client/plan IDs borrowed from the Replit DB:
// withSurvey (was 20 / 3 / 1), noSurvey (was 4), emptyLevel (was 19), and a
// plan of withSurvey stored as Zaawansowany + guideline version 1 (was plan 1).
let withSurvey: number;
let otherClient: number;
let noSurvey: number;
let emptyLevel: number;
let fixturePlanId: number;
/** An exercise with a muscle that belongs to no volume target (was exercise 2). */
let unmappedExerciseId: number;

beforeAll(async () => {
  await legacyTrainerId();
  const a = await legacyFixtureClient("preview-fixture-a@example.invalid", { experienceLevel: "Zaawansowany" });
  withSurvey = a.clientId;
  otherClient = (await legacyFixtureClient("preview-fixture-other@example.invalid")).clientId;
  noSurvey = (await legacyFixtureClient("preview-fixture-nosurvey@example.invalid", null)).clientId;
  emptyLevel = (await legacyFixtureClient("preview-fixture-emptylevel@example.invalid", { experienceLevel: "" })).clientId;
  fixturePlanId = await legacyFixturePlan(withSurvey, a.surveyId, "Zaawansowany", 1);

  const [unmapped] = await db
    .select({ exerciseId: exerciseMuscleAssignmentsTable.exerciseId })
    .from(exerciseMuscleAssignmentsTable)
    .where(
      notExists(
        db
          .select({ one: sql`1` })
          .from(volumeTargetMembersTable)
          .where(eq(volumeTargetMembersTable.specificMuscleId, exerciseMuscleAssignmentsTable.specificMuscleId)),
      ),
    )
    .limit(1);
  unmappedExerciseId = unmapped.exerciseId;
});

// Close the connection pool after all tests to allow the process to exit cleanly.
afterAll(async () => {
  await pool.end();
});

// ─── calculateVolumePreview direct tests ──────────────────────────────────────

describe("calculateVolumePreview — DB integration", () => {
  let exerciseToRestore: number | null = null;

  afterEach(async () => {
    if (exerciseToRestore !== null) {
      await db
        .update(exercisesTable)
        .set({ isActive: true })
        .where(eq(exercisesTable.id, exerciseToRestore));
      exerciseToRestore = null;
    }
  });

  it("INACTIVE_EXERCISE warning — inactive exercise still contributes volume", async () => {
    exerciseToRestore = 1;
    await db
      .update(exercisesTable)
      .set({ isActive: false })
      .where(eq(exercisesTable.id, 1));

    const result = await calculateVolumePreview({
      clientId: withSurvey,
      guidelineVersionId: 1,
      experienceLevelUsed: "Zaawansowany",
      days: [{
        dayId: 1,
        dayName: "A",
        exercises: [{ exerciseEntryId: 1, exerciseId: 1, workingSets: 4 }],
      }],
    });

    const warn = result.warnings.find(w => w.code === "INACTIVE_EXERCISE");
    expect(warn, "INACTIVE_EXERCISE warning must be present").toBeDefined();
    expect(warn!.exerciseId).toBe(1);

    // Contribution is preserved (not zeroed out)
    const hasContribution = result.weekly.some(m => m.effectiveSets > 0);
    expect(hasContribution, "Inactive exercise must still contribute effective sets").toBe(true);
  });

  it("MISSING_MUSCLE_TARGET — an exercise with a muscle outside every volume target", async () => {
    const result = await calculateVolumePreview({
      clientId: withSurvey,
      guidelineVersionId: 1,
      experienceLevelUsed: "Zaawansowany",
      days: [{
        dayId: 1,
        dayName: "A",
        exercises: [{ exerciseEntryId: 1, exerciseId: unmappedExerciseId, workingSets: 3 }],
      }],
    });

    const warn = result.warnings.find(w => w.code === "MISSING_MUSCLE_TARGET");
    expect(warn, `MISSING_MUSCLE_TARGET warning must be present for exercise ${unmappedExerciseId}`).toBeDefined();
    expect(warn!.exerciseId).toBe(unmappedExerciseId);
  });

  it("EXERCISE_ENTRY_WITHOUT_EXERCISE_ID — exerciseId 0 emits warning; valid entry still calculates", async () => {
    const result = await calculateVolumePreview({
      clientId: withSurvey,
      guidelineVersionId: 1,
      experienceLevelUsed: "Zaawansowany",
      days: [{
        dayId: 1,
        dayName: "A",
        exercises: [
          // exerciseId=0 is invalid (falsy)
          { exerciseEntryId: 1, exerciseId: 0, workingSets: 3 },
          // valid — must still produce contributions
          { exerciseEntryId: 2, exerciseId: 1, workingSets: 4 },
        ],
      }],
    });

    const warn = result.warnings.find(w => w.code === "EXERCISE_ENTRY_WITHOUT_EXERCISE_ID");
    expect(warn, "EXERCISE_ENTRY_WITHOUT_EXERCISE_ID warning must fire for exerciseId=0").toBeDefined();
    expect(warn!.exerciseEntryId).toBe(1);

    const hasContribution = result.weekly.some(m => m.effectiveSets > 0);
    expect(hasContribution, "Valid entry must still produce contributions").toBe(true);
  });

  it("INVALID_WORKING_SETS — workingSets=0 emits warning; valid entry still calculates", async () => {
    const result = await calculateVolumePreview({
      clientId: withSurvey,
      guidelineVersionId: 1,
      experienceLevelUsed: "Zaawansowany",
      days: [{
        dayId: 1,
        dayName: "A",
        exercises: [
          { exerciseEntryId: 1, exerciseId: 1, workingSets: 0 },   // invalid
          { exerciseEntryId: 2, exerciseId: 1, workingSets: 4 },   // valid
        ],
      }],
    });

    const warn = result.warnings.find(w => w.code === "INVALID_WORKING_SETS");
    expect(warn, "INVALID_WORKING_SETS warning must fire for workingSets=0").toBeDefined();
    expect(warn!.exerciseEntryId).toBe(1);

    const hasContribution = result.weekly.some(m => m.effectiveSets > 0);
    expect(hasContribution, "Valid entry must still produce contributions").toBe(true);
  });

  it("saved-plan and preview result equality — same exercises produce identical weekly effective sets", async () => {
    // Load plan 1's exercises from the DB dynamically (no hardcoded IDs)
    const planRows = await db
      .select({
        dayId:           workoutPlanDaysTable.id,
        dayName:         workoutPlanDaysTable.dayName,
        exerciseEntryId: workoutPlanExercisesTable.id,
        exerciseId:      workoutPlanExercisesTable.exerciseId,
        workingSets:     workoutPlanExercisesTable.workingSets,
      })
      .from(workoutPlanDaysTable)
      .leftJoin(
        workoutPlanExercisesTable,
        eq(workoutPlanExercisesTable.dayId, workoutPlanDaysTable.id),
      )
      .where(eq(workoutPlanDaysTable.planId, 1));

    // Build VolumePreviewInput days from the plan rows
    const dayMap = new Map<number, { dayName: string | null; exercises: VolumePreviewInput["days"][number]["exercises"] }>();
    for (const row of planRows) {
      if (!row.exerciseEntryId || !row.exerciseId || !row.workingSets) continue;
      if (!dayMap.has(row.dayId)) dayMap.set(row.dayId, { dayName: row.dayName, exercises: [] });
      dayMap.get(row.dayId)!.exercises.push({
        exerciseEntryId: row.exerciseEntryId,
        exerciseId:      row.exerciseId,
        workingSets:     row.workingSets,
      });
    }
    const days = [...dayMap.entries()].map(([dayId, { dayName, exercises }]) => ({
      dayId, dayName, exercises,
    }));

    const [preview, saved] = await Promise.all([
      calculateVolumePreview({
        clientId:             20,
        guidelineVersionId:   1,
        experienceLevelUsed:  "Zaawansowany",
        days,
      }),
      calculatePlanVolume(1, 1, "Zaawansowany"),
    ]);

    // For every target in the saved result, the preview must return the same
    // weekly effective sets (same formula path via computeVolumeCore).
    for (const savedTarget of saved.targets) {
      const previewTarget = preview.weekly.find(w => w.targetId === savedTarget.targetId);
      expect(previewTarget, `Preview must include targetId ${savedTarget.targetId}`).toBeDefined();
      expect(previewTarget!.effectiveSets).toBe(savedTarget.weeklyEffectiveSets);
    }
  });

  describe("all four experience levels — each returns the correct number of guideline targets", () => {
    const LEVELS = [
      "Zaawansowany",
      "Średniozaawansowany",
      "Początkujący",
      "Brak aktywności fizycznej",
    ] as const;

    for (const level of LEVELS) {
      it(`${level} → all DB guideline targets returned, no MISSING_GUIDELINES`, async () => {
        // Count how many guideline rows exist for this version + level in the DB.
        const [{ value: expectedCount }] = await db
          .select({ value: count() })
          .from(volumeGuidelinesTable)
          .where(
            and(
              eq(volumeGuidelinesTable.versionId, 1),
              eq(volumeGuidelinesTable.experienceLevel, level),
            ),
          );

        const result = await calculateVolumePreview({
          clientId:            3,   // any client — level is authoritative here
          guidelineVersionId:  1,
          experienceLevelUsed: level,
          days:                [],
        });

        expect(result.guidelineLevel).toBe(level);
        expect(result.weekly).toHaveLength(expectedCount);
        expect(result.warnings.some(w => w.code === "MISSING_GUIDELINES")).toBe(false);
      });
    }
  });
});

// ─── Route integration tests (via supertest) ──────────────────────────────────

describe("POST /api/plans/volume-preview — route integration", () => {
  it("MISSING_CLIENT_SURVEY — client without survey rows", async () => {
    const res = await request(app)
      .post("/api/plans/volume-preview")
      .send({ clientId: noSurvey, days: [] })
      .expect(200);

    const codes: string[] = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain("MISSING_CLIENT_SURVEY");
  });

  it("MISSING_EXPERIENCE_LEVEL — most recent survey has an empty level", async () => {
    const res = await request(app)
      .post("/api/plans/volume-preview")
      .send({ clientId: emptyLevel, days: [] })
      .expect(200);

    const codes: string[] = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain("MISSING_EXPERIENCE_LEVEL");
  });

  it("FIX 4 — planId makes backend ignore frontend-supplied level; mismatch warnings returned", async () => {
    // The fixture plan stores Zaawansowany + versionId 1.
    // Frontend sends Początkujący + versionId 999 → both should be rejected.
    const res = await request(app)
      .post("/api/plans/volume-preview")
      .send({
        clientId:            withSurvey,
        planId:              fixturePlanId,
        experienceLevelUsed: "Początkujący",
        guidelineVersionId:  999,
        days:                [],
      })
      .expect(200);

    // Backend uses plan's authoritative level
    expect(res.body.guidelineLevel).toBe("Zaawansowany");

    const codes: string[] = res.body.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain("INVALID_EXPERIENCE_LEVEL");
    expect(codes).toContain("MISSING_GUIDELINE_VERSION");
  });

  it("ownership check — planId belonging to a different client is rejected (404)", async () => {
    // The fixture plan belongs to withSurvey; presenting it as another client is
    // rejected with 404 (no-enumeration convention since 3ea2ea4, 30.07).
    await request(app)
      .post("/api/plans/volume-preview")
      .send({ clientId: otherClient, planId: fixturePlanId, days: [] })
      .expect(404);
  });

  it("unknown client returns 404", async () => {
    await request(app)
      .post("/api/plans/volume-preview")
      .send({ clientId: 999999, days: [] })
      .expect(404);
  });
});
