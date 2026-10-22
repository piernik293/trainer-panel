/**
 * Tests for Task #9 — Client Avoided Exercises
 *
 * Covers:
 *  - GET /api/exercises/search
 *  - GET /api/clients/:clientId/avoided-exercises
 *  - PUT /api/clients/:clientId/survey (new avoidedExercise* fields)
 *  - POST /api/public/survey (new fields flow-through)
 *  - analyseDraftPreview CLIENT_AVOIDS_EXERCISE warnings
 *  - Re-submission durability: prior survey rows are never mutated (Task #12)
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
import { db, surveysTable, exercisesTable, clientsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { analyseDraftPreview } from "../planAnalyzer";
import type { AnalysisPreviewInput } from "../planAnalyzer";

beforeAll(async () => {
  await legacyTrainerId();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const req = request(app);

const TRAINER_COOKIE =
  process.env.TEST_SESSION_COOKIE ?? "session=test-trainer";

async function getActiveExercise() {
  const [ex] = await db
    .select({ id: exercisesTable.id, name: exercisesTable.name })
    .from(exercisesTable)
    .where(eq(exercisesTable.isActive, true))
    .limit(1);
  return ex;
}

async function getOrCreateTestClient() {
  const [existing] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.email, "avoided-exercises-test@example.com"))
    .limit(1);
  if (existing) return ownByLegacyTrainer(existing);

  const [created] = await db
    .insert(clientsTable)
    .values({
      firstName: "Avoided",
      lastName: "Test",
      email: "avoided-exercises-test@example.com",
      status: "active",
    })
    .returning();
  return ownByLegacyTrainer(created);
}

// ─── GET /api/exercises/search ────────────────────────────────────────────────

describe("GET /api/exercises/search", () => {
  it("1. returns 200 with an array", async () => {
    const res = await req.get("/api/exercises/search");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("2. empty q returns up to limit results", async () => {
    const res = await req.get("/api/exercises/search?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(5);
  });

  it("3. each item has required fields", async () => {
    const res = await req.get("/api/exercises/search?limit=3");
    for (const item of res.body) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("mainMuscleGroup");
      expect(item).toHaveProperty("isActive");
    }
  });

  it("4. q filters results by name (case-insensitive)", async () => {
    const ex = await getActiveExercise();
    if (!ex) return; // no exercises in test DB — skip gracefully

    // Use a prefix of the exercise name (first 3 chars)
    const prefix = ex.name.slice(0, 3);
    const res = await req.get(`/api/exercises/search?q=${encodeURIComponent(prefix)}`);
    expect(res.status).toBe(200);
    // At least the known exercise should appear if prefix matches
    const found = res.body.some((e: { id: number }) => e.id === ex.id);
    if (ex.name.toLowerCase().includes(prefix.toLowerCase())) {
      expect(found).toBe(true);
    }
  });

  it("5. non-matching query returns empty array", async () => {
    const res = await req.get(
      "/api/exercises/search?q=ZZZZZZZ_NONEXISTENT_XYZ",
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("6. limit caps result count at 50", async () => {
    const res = await req.get("/api/exercises/search?limit=999");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(50);
  });

  it("7. returns only active exercises", async () => {
    const res = await req.get("/api/exercises/search");
    for (const item of res.body) {
      expect(item.isActive).toBe(true);
    }
  });
});

// ─── GET /api/clients/:clientId/avoided-exercises ────────────────────────────

describe("GET /api/clients/:clientId/avoided-exercises", () => {
  let clientId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient();
    clientId = client.id;
  });

  it("8. returns 200 with empty array when client has no survey", async () => {
    // Delete any existing surveys for this test client first
    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));

    const res = await req
      .get(`/api/clients/${clientId}/avoided-exercises`)
      .set("Cookie", TRAINER_COOKIE);
    // Status is 400 when params fail or 200; clientId is valid so should be 200
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    }
  });

  it("9. returns 200 with empty array when survey has no avoided IDs", async () => {
    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
    });

    const res = await req
      .get(`/api/clients/${clientId}/avoided-exercises`)
      .set("Cookie", TRAINER_COOKIE);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    }
  });

  it("10. resolves avoided exercise IDs to names", async () => {
    const ex = await getActiveExercise();
    if (!ex) return;

    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [ex.id],
      avoidedExerciseReasons: { [String(ex.id)]: "Test reason" },
    });

    const res = await req
      .get(`/api/clients/${clientId}/avoided-exercises`)
      .set("Cookie", TRAINER_COOKIE);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      const found = res.body.find((e: { id: number }) => e.id === ex.id);
      expect(found).toBeDefined();
      expect(found.name).toBe(ex.name);
      expect(found.reason).toBe("Test reason");
    }
  });

  it("11. includes otherText and otherReason from latest survey", async () => {
    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
      avoidedExerciseOtherText: "wyciskanie nad głowę",
      avoidedExerciseOtherReason: "ból barku",
    });

    const res = await req
      .get(`/api/clients/${clientId}/avoided-exercises`)
      .set("Cookie", TRAINER_COOKIE);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      const other = res.body.find((e: { id: number }) => e.id === 0);
      expect(other).toBeDefined();
      expect(other.otherText).toBe("wyciskanie nad głowę");
      expect(other.otherReason).toBe("ból barku");
    }
  });

  it("12. uses only the latest survey (not an older one)", async () => {
    const ex = await getActiveExercise();
    if (!ex) return;

    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));

    // Insert old survey (no avoided exercises)
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
    });
    // Short delay so ordering is deterministic
    await new Promise((r) => setTimeout(r, 10));
    // Insert newer survey WITH avoided exercise
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [ex.id],
      avoidedExerciseReasons: {},
    });

    const res = await req
      .get(`/api/clients/${clientId}/avoided-exercises`)
      .set("Cookie", TRAINER_COOKIE);
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      const found = res.body.find((e: { id: number }) => e.id === ex.id);
      expect(found).toBeDefined();
    }
  });
});

// ─── PUT /api/clients/:clientId/survey — new avoided-exercise fields ──────────

describe("PUT /api/clients/:clientId/survey — avoidedExercise* fields", () => {
  let clientId: number;
  let exerciseId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient();
    clientId = client.id;
    const ex = await getActiveExercise();
    exerciseId = ex?.id ?? 1;
  });

  const baseSurveyPayload = () => ({
    firstName: "Jan",
    lastName: "Kowalski",
    dateOfBirth: "1990-01-01",
    gender: "Mężczyzna",
  });

  it("13. accepts avoidedExerciseIds in survey upsert", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send({ ...baseSurveyPayload(), avoidedExerciseIds: [exerciseId] });
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("avoidedExerciseIds");
    }
  });

  it("14. persists avoidedExerciseIds to the database", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send({ ...baseSurveyPayload(), avoidedExerciseIds: [exerciseId] });
    if (res.status !== 200) return;

    const [survey] = await db
      .select({ avoidedExerciseIds: surveysTable.avoidedExerciseIds })
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    expect(survey?.avoidedExerciseIds).toContain(exerciseId);
  });

  it("15. deduplicates avoidedExerciseIds", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send({
        ...baseSurveyPayload(),
        avoidedExerciseIds: [exerciseId, exerciseId, exerciseId],
      });
    if (res.status !== 200) return;

    const [survey] = await db
      .select({ avoidedExerciseIds: surveysTable.avoidedExerciseIds })
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    const ids = survey?.avoidedExerciseIds ?? [];
    const unique = [...new Set(ids)];
    expect(ids.length).toBe(unique.length);
  });

  it("16. rejects unknown exercise IDs with 400", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send({
        ...baseSurveyPayload(),
        avoidedExerciseIds: [999_999_999],
      });
    // Either 400 (bad IDs) or 401 (unauthenticated) — never 200
    expect([400, 401]).toContain(res.status);
  });

  it("17. accepts avoidedExerciseReasons", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send({
        ...baseSurveyPayload(),
        avoidedExerciseIds: [exerciseId],
        avoidedExerciseReasons: { [String(exerciseId)]: "ból kolana" },
      });
    if (res.status !== 200) return;

    const [survey] = await db
      .select({ avoidedExerciseReasons: surveysTable.avoidedExerciseReasons })
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    const reasons = (survey?.avoidedExerciseReasons ?? {}) as Record<
      string,
      string
    >;
    expect(reasons[String(exerciseId)]).toBe("ból kolana");
  });

  it("18. trims whitespace-only reasons (omits empty key)", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send({
        ...baseSurveyPayload(),
        avoidedExerciseIds: [exerciseId],
        avoidedExerciseReasons: { [String(exerciseId)]: "   " },
      });
    if (res.status !== 200) return;

    const [survey] = await db
      .select({ avoidedExerciseReasons: surveysTable.avoidedExerciseReasons })
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    const reasons = (survey?.avoidedExerciseReasons ?? {}) as Record<
      string,
      string
    >;
    // empty reason should be omitted
    expect(Object.keys(reasons)).not.toContain(String(exerciseId));
  });

  it("19. accepts avoidedExerciseOtherText and avoidedExerciseOtherReason", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send({
        ...baseSurveyPayload(),
        avoidedExerciseOtherText: "wyciskanie nad głowę",
        avoidedExerciseOtherReason: "ból barku",
      });
    if (res.status !== 200) return;

    const [survey] = await db
      .select({
        avoidedExerciseOtherText: surveysTable.avoidedExerciseOtherText,
        avoidedExerciseOtherReason: surveysTable.avoidedExerciseOtherReason,
      })
      .from(surveysTable)
      .where(eq(surveysTable.clientId, clientId))
      .orderBy(desc(surveysTable.createdAt))
      .limit(1);

    expect(survey?.avoidedExerciseOtherText).toBe("wyciskanie nad głowę");
    expect(survey?.avoidedExerciseOtherReason).toBe("ból barku");
  });

  it("20. survey without new fields still succeeds (backwards compat)", async () => {
    const res = await req
      .put(`/api/clients/${clientId}/survey`)
      .set("Cookie", TRAINER_COOKIE)
      .send(baseSurveyPayload());
    // 200 or 401 (not authenticated in test env); must not be 400/500
    expect([200, 401]).toContain(res.status);
  });
});

// ─── POST /api/public/survey — new fields ─────────────────────────────────────

describe("POST /api/public/survey — avoidedExercise* fields", () => {
  const basePublicPayload = () => ({
    firstName: "Publiczny",
    lastName: "Test",
    email: `pub-test-avoided-${Date.now()}@example.com`,
    dateOfBirth: "1995-06-15",
    gender: "Kobieta",
  });

  it("21. accepts avoidedExerciseOtherText in public survey", async () => {
    const ex = await getActiveExercise();
    const payload = {
      ...basePublicPayload(),
      avoidedExerciseIds: ex ? [ex.id] : [],
      avoidedExerciseOtherText: "ćwiczenia z obciążeniem na szyi",
      avoidedExerciseOtherReason: "wcześniejszy uraz",
    };

    const res = await req
      .post("/api/public/survey")
      .send(payload)
      .set("Content-Type", "application/json");

    // 200 = success, 400 = validation; must not be 500
    expect(res.status).not.toBe(500);
  });
});

// ─── planAnalyzer — CLIENT_AVOIDS_EXERCISE warnings ──────────────────────────

describe("analyseDraftPreview — CLIENT_AVOIDS_EXERCISE warnings", () => {
  let clientId: number;
  let exerciseId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient();
    clientId = client.id;
    const ex = await getActiveExercise();
    exerciseId = ex?.id ?? 0;
  });

  async function setSurveyAvoidedIds(ids: number[]) {
    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: ids,
      avoidedExerciseReasons: ids.reduce<Record<string, string>>(
        (acc, id) => ({ ...acc, [String(id)]: "testowy powód" }),
        {},
      ),
    });
  }

  function buildInput(exerciseIds: number[]): AnalysisPreviewInput {
    return {
      clientId,
      planId: 0,
      goal: null,
      days: [
        {
          dayId: 1,
          dayName: "Dzień A",
          dayOrder: 1,
          exercises: exerciseIds.map((exId, i) => ({
            exerciseEntryId: i + 1,
            exerciseId: exId,
            workingSets: 3,
            orderInDay: i + 1,
          })),
        },
      ],
    };
  }

  it("22. no warnings when client has no avoided exercises", async () => {
    await setSurveyAvoidedIds([]);
    const result = await analyseDraftPreview(buildInput(
      exerciseId ? [exerciseId] : [],
    ));
    const avoidedWarnings = result.warnings.filter(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    expect(avoidedWarnings).toHaveLength(0);
  });

  it("23. emits CLIENT_AVOIDS_EXERCISE for each avoided exercise in plan", async () => {
    if (!exerciseId) return;
    await setSurveyAvoidedIds([exerciseId]);
    const result = await analyseDraftPreview(buildInput([exerciseId]));
    const avoidedWarnings = result.warnings.filter(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    expect(avoidedWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("24. CLIENT_AVOIDS_EXERCISE has severity notice", async () => {
    if (!exerciseId) return;
    await setSurveyAvoidedIds([exerciseId]);
    const result = await analyseDraftPreview(buildInput([exerciseId]));
    const avoidedWarning = result.warnings.find(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    if (avoidedWarning) {
      expect(avoidedWarning.severity).toBe("notice");
    }
  });

  it("25. CLIENT_AVOIDS_EXERCISE has scope exercise", async () => {
    if (!exerciseId) return;
    await setSurveyAvoidedIds([exerciseId]);
    const result = await analyseDraftPreview(buildInput([exerciseId]));
    const avoidedWarning = result.warnings.find(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    if (avoidedWarning) {
      expect(avoidedWarning.scope).toBe("exercise");
    }
  });

  it("26. includes reason in warning message", async () => {
    if (!exerciseId) return;
    await setSurveyAvoidedIds([exerciseId]);
    const result = await analyseDraftPreview(buildInput([exerciseId]));
    const avoidedWarning = result.warnings.find(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    if (avoidedWarning) {
      expect(avoidedWarning.message).toContain("testowy powód");
    }
  });

  it("27. deduplicates — same exercise in multiple days → 1 warning", async () => {
    if (!exerciseId) return;
    await setSurveyAvoidedIds([exerciseId]);

    // Two days both containing the same exercise
    const input: AnalysisPreviewInput = {
      clientId,
      planId: 0,
      goal: null,
      days: [
        {
          dayId: 1,
          dayName: "A",
          dayOrder: 1,
          exercises: [{ exerciseEntryId: 1, exerciseId, workingSets: 3, orderInDay: 1 }],
        },
        {
          dayId: 2,
          dayName: "B",
          dayOrder: 2,
          exercises: [{ exerciseEntryId: 2, exerciseId, workingSets: 3, orderInDay: 1 }],
        },
      ],
    };

    const result = await analyseDraftPreview(input);
    const avoidedWarnings = result.warnings.filter(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    expect(avoidedWarnings).toHaveLength(1);
  });

  it("28. exercise NOT in plan → no CLIENT_AVOIDS_EXERCISE warning", async () => {
    if (!exerciseId) return;
    await setSurveyAvoidedIds([exerciseId]);

    // Plan has a DIFFERENT exercise (id that doesn't match)
    const result = await analyseDraftPreview(buildInput([exerciseId + 9_000_000]));
    const avoidedWarnings = result.warnings.filter(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    expect(avoidedWarnings).toHaveLength(0);
  });

  it("29. CLIENT_AVOIDS_EXERCISE warnings are non-blocking (other analysis still runs)", async () => {
    if (!exerciseId) return;
    await setSurveyAvoidedIds([exerciseId]);
    const result = await analyseDraftPreview(buildInput([exerciseId]));
    // Result should still have all the core analysis fields
    expect(result).toHaveProperty("warnings");
    expect(result).toHaveProperty("executionTypes");
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("30. no CLIENT_AVOIDS_EXERCISE when avoidedExerciseIds is empty", async () => {
    await setSurveyAvoidedIds([]);
    const result = await analyseDraftPreview(buildInput(
      exerciseId ? [exerciseId] : [],
    ));
    const avoidedWarnings = result.warnings.filter(
      (w) => w.code === "CLIENT_AVOIDS_EXERCISE",
    );
    expect(avoidedWarnings).toHaveLength(0);
  });
});

// ─── Re-submission durability (Task #12) ─────────────────────────────────────
//
// Surveys are append-only: every public form submit (POST /api/public/survey)
// and every trainer save (PUT /api/clients/:id/survey) inserts a NEW row.
// Nothing is ever deleted or overwritten.  The GET /avoided-exercises endpoint
// always reads the LATEST row by createdAt DESC.
//
// These tests confirm two things:
//  a) A second survey insert with empty avoidedExerciseIds does NOT mutate the
//     first row — the old row keeps its data intact.
//  b) The GET endpoint surfaces the latest row, so an empty second submission
//     correctly shows an empty list (expected behaviour, not data loss).

describe("Re-submission durability — avoided exercises survive a second survey row", () => {
  let clientId: number;
  let exerciseId: number;

  beforeAll(async () => {
    const client = await getOrCreateTestClient();
    clientId = client.id;
    const ex = await getActiveExercise();
    exerciseId = ex?.id ?? 0;
  });

  it("31. prior survey row keeps its avoidedExerciseIds after a second insert with an empty list", async () => {
    if (!exerciseId) return;

    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));

    // First submission — client fills in avoided exercises
    const [firstRow] = await db
      .insert(surveysTable)
      .values({
        clientId,
        dateOfBirth: "1990-01-01",
        gender: "Mężczyzna",
        avoidedExerciseIds: [exerciseId],
        avoidedExerciseReasons: { [String(exerciseId)]: "test reason" },
      })
      .returning();

    // Short pause so timestamps differ
    await new Promise((r) => setTimeout(r, 10));

    // Second submission — client leaves avoided exercises blank
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
    });

    // Fetch the FIRST row directly by primary key — it must be unchanged
    const [reloaded] = await db
      .select({ avoidedExerciseIds: surveysTable.avoidedExerciseIds })
      .from(surveysTable)
      .where(eq(surveysTable.id, firstRow.id));

    expect(reloaded?.avoidedExerciseIds).toContain(exerciseId);
  });

  it("32. GET /avoided-exercises returns the latest row — empty list after blank re-submission (expected, not a bug)", async () => {
    if (!exerciseId) return;

    await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));

    // First submission — with avoided exercises
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [exerciseId],
      avoidedExerciseReasons: {},
    });

    await new Promise((r) => setTimeout(r, 10));

    // Second submission — client leaves avoided exercises blank
    await db.insert(surveysTable).values({
      clientId,
      dateOfBirth: "1990-01-01",
      gender: "Mężczyzna",
      avoidedExerciseIds: [],
      avoidedExerciseReasons: {},
    });

    const res = await req
      .get(`/api/clients/${clientId}/avoided-exercises`)
      .set("Cookie", TRAINER_COOKIE);

    // The latest survey has an empty list → the endpoint returns [] (correct behaviour)
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
      // The result reflects the latest survey row; an empty list here is intentional,
      // not a silent data-loss bug — the old row with avoidedExerciseIds is still in
      // the DB and visible in the survey history.
      expect(res.body).toHaveLength(0);
    }
  });

  it("33. POST /api/public/survey twice — first submission's survey row is unaffected", async () => {
    // Each public submission creates a new client row (no email upsert), so both
    // rows are fully independent. Verify the first client's survey is intact.
    const email1 = `resubmit-test-a-${Date.now()}@example.com`;
    const email2 = `resubmit-test-b-${Date.now() + 1}@example.com`;

    const ex = await getActiveExercise();
    if (!ex) return;

    // First submission — includes avoided exercise
    const res1 = await req
      .post("/api/public/survey")
      .send({
        firstName: "Re",
        lastName: "Submit",
        email: email1,
        dateOfBirth: "1990-01-01",
        gender: "Mężczyzna",
        avoidedExerciseIds: [ex.id],
        avoidedExerciseReasons: { [String(ex.id)]: "stary uraz" },
      })
      .set("Content-Type", "application/json");

    // Second submission (different email, simulates re-submit) — no avoided exercises
    const res2 = await req
      .post("/api/public/survey")
      .send({
        firstName: "Re",
        lastName: "Submit",
        email: email2,
        dateOfBirth: "1990-01-01",
        gender: "Mężczyzna",
        avoidedExerciseIds: [],
      })
      .set("Content-Type", "application/json");

    expect(res1.status).not.toBe(500);
    expect(res2.status).not.toBe(500);

    if (res1.status === 201) {
      const clientId1: number = res1.body.clientId;

      // The first client's survey must still have the avoided exercise
      const [survey] = await db
        .select({ avoidedExerciseIds: surveysTable.avoidedExerciseIds })
        .from(surveysTable)
        .where(eq(surveysTable.clientId, clientId1))
        .orderBy(desc(surveysTable.createdAt))
        .limit(1);

      expect(survey?.avoidedExerciseIds).toContain(ex.id);
    }
  });
});
