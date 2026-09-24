import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import {
  clientsTable,
  db,
  exercisesTable,
  surveyInvitesTable,
  trainerSubscriptionsTable,
  trainersTable,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import { count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import publicRouter from "../../routes/public";
import {
  authorizeGeneratedDay,
  completeAndRecordGeneration,
  GenerationSessionError,
  getSubscriptionPeriod,
  getSubscriptionSummary,
  recordGeneratedDayOutput,
  runWithActiveGenerationSession,
  runWithSubscriptionLimit,
  SubscriptionLimitError,
} from "../subscriptionService";

describe("subscription service integration", () => {
  let trainerId: number | null = null;

  async function createTrainer() {
    const clerkUserId = `subscription-test-${randomUUID()}`;
    const [trainer] = await db
      .insert(trainersTable)
      .values({ clerkUserId, email: `subscription-test-${randomUUID()}@example.invalid` })
      .returning({ id: trainersTable.id });
    trainerId = trainer.id;
    return trainer.id;
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!trainerId) return;
    await db.delete(surveyInvitesTable).where(eq(surveyInvitesTable.trainerId, trainerId));
    await db
      .delete(exercisesTable)
      .where(eq(exercisesTable.createdByTrainerId, trainerId));
    await db.delete(clientsTable).where(eq(clientsTable.trainerId, trainerId));
    await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
    trainerId = null;
  });

  it("serializes concurrent FREE client creation and releases a slot after deletion", async () => {
    const id = await createTrainer();
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        runWithSubscriptionLimit(id, "clients", (tx) =>
          tx
            .insert(clientsTable)
            .values({
              firstName: `Test ${index}`,
              lastName: "Subscription",
              trainerId: id,
            })
            .returning({ id: clientsTable.id }),
        ),
      ),
    );

    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected).toBeDefined();
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(SubscriptionLimitError);
      expect(rejected.reason.toResponse()).toMatchObject({
        code: "SUBSCRIPTION_LIMIT_REACHED",
        metric: "clients",
        planCode: "FREE",
        usage: { used: 3, limit: 3, remaining: 0, atLimit: true },
      });
    }

    const summaryAtLimit = await getSubscriptionSummary(id);
    expect(summaryAtLimit.usage.clients).toMatchObject({
      used: 3,
      limit: 3,
      remaining: 0,
      atLimit: true,
    });

    const [clientToDelete] = await db
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.trainerId, id))
      .limit(1);
    await db.delete(clientsTable).where(eq(clientsTable.id, clientToDelete.id));

    await expect(
      runWithSubscriptionLimit(id, "clients", (tx) =>
        tx
          .insert(clientsTable)
          .values({ firstName: "Replacement", lastName: "Client", trainerId: id })
          .returning({ id: clientsTable.id }),
      ),
    ).resolves.toHaveLength(1);
  });

  it("blocks client creation from a public survey invite when FREE is at its limit", async () => {
    const id = await createTrainer();
    await db.insert(clientsTable).values(
      Array.from({ length: 3 }, (_, index) => ({
        firstName: `Public limit ${index}`,
        lastName: "Client",
        trainerId: id,
      })),
    );
    const rawToken = randomBytes(32).toString("hex");
    const [invite] = await db
      .insert(surveyInvitesTable)
      .values({
        trainerId: id,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning({ id: surveyInvitesTable.id });
    const app = express();
    app.use(express.json());
    app.use("/api", publicRouter);

    const response = await request(app)
      .post(`/api/public/survey/${rawToken}`)
      .send({
        firstName: "Blocked",
        lastName: "Invite",
        email: "blocked@example.com",
        phone: "",
        dateOfBirth: "1990-01-01",
        gender: "Mężczyzna",
        heightCm: 180,
        weightKg: 80,
        trainingGoal: "Budowa masy mięśniowej",
        experienceLevel: "Początkujący",
        desiredWeeklyFrequency: 3,
        sessionDuration: "60 minut",
        activityLevel: "Siedzący",
        sleepHours: "7–8 godzin",
        stressLevel: 4,
        planStylePreference: "Balans efektywności i wygody",
        trainingLocation: "Siłownia",
      });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "SUBSCRIPTION_LIMIT_REACHED",
      metric: "clients",
    });

    const [storedInvite] = await db
      .select({ usedAt: surveyInvitesTable.usedAt })
      .from(surveyInvitesTable)
      .where(eq(surveyInvitesTable.id, invite.id));
    expect(storedInvite.usedAt).toBeNull();
    const [clientTotal] = await db
      .select({ value: count() })
      .from(clientsTable)
      .where(eq(clientsTable.trainerId, id));
    expect(clientTotal.value).toBe(3);
  });

  it("serializes concurrent custom exercise creation at the FREE limit", async () => {
    const id = await createTrainer();
    const attempts = await Promise.allSettled(
      Array.from({ length: 11 }, (_, index) =>
        runWithSubscriptionLimit(id, "customExercises", (tx) =>
          tx
            .insert(exercisesTable)
            .values({
              name: `Subscription exercise ${index}`,
              slug: `subscription-exercise-${randomUUID()}`,
              mainMuscleGroup: "Klatka piersiowa",
              createdByTrainerId: id,
            })
            .returning({ id: exercisesTable.id }),
        ),
      ),
    );

    const failureMessages = attempts
      .filter((result) => result.status === "rejected")
      .map((result) => String(result.reason));
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
      failureMessages.join("\n"),
    ).toHaveLength(10);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect(rejected).toBeDefined();
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(SubscriptionLimitError);
      expect(rejected.reason.metric).toBe("customExercises");
    }
  });

  it("binds a generation session to one client, month, day payload and completion", async () => {
    const id = await createTrainer();
    const [client] = await db
      .insert(clientsTable)
      .values({ firstName: "Generation", lastName: "Client", trainerId: id })
      .returning({ id: clientsTable.id });
    const generationId = randomUUID();
    const generatedExercises = await db
      .insert(exercisesTable)
      .values([
        {
          name: "Generated subscription exercise A",
          slug: `generated-subscription-a-${randomUUID()}`,
          mainMuscleGroup: "Klatka piersiowa",
          createdByTrainerId: id,
        },
        {
          name: "Generated subscription exercise B",
          slug: `generated-subscription-b-${randomUUID()}`,
          mainMuscleGroup: "Plecy",
          createdByTrainerId: id,
        },
      ])
      .returning({ id: exercisesTable.id });

    await authorizeGeneratedDay({
      trainerId: id,
      clientId: client.id,
      generationId,
      expectedDayCount: 2,
      dayIndex: 0,
      requestHash: "day-zero",
    });
    await expect(
      authorizeGeneratedDay({
        trainerId: id,
        clientId: client.id,
        generationId,
        expectedDayCount: 2,
        dayIndex: 0,
        requestHash: "day-zero",
      }),
    ).resolves.toBeUndefined();
    await authorizeGeneratedDay({
      trainerId: id,
      clientId: client.id,
      generationId,
      expectedDayCount: 2,
      dayIndex: 1,
      requestHash: "day-one",
    });
    await recordGeneratedDayOutput({
      trainerId: id,
      clientId: client.id,
      generationId,
      dayIndex: 0,
      exerciseIds: [generatedExercises[0].id],
    });
    await recordGeneratedDayOutput({
      trainerId: id,
      clientId: client.id,
      generationId,
      dayIndex: 1,
      exerciseIds: [generatedExercises[1].id],
    });

    await expect(
      authorizeGeneratedDay({
        trainerId: id,
        clientId: client.id,
        generationId,
        expectedDayCount: 2,
        dayIndex: 0,
        requestHash: "changed",
      }),
    ).rejects.toBeInstanceOf(GenerationSessionError);

    await expect(
      runWithActiveGenerationSession(
        {
          trainerId: id,
          clientId: client.id,
          generationId,
          dayExerciseIds: [
            [generatedExercises[0].id],
            [generatedExercises[1].id],
          ],
        },
        async () => "balanced",
      ),
    ).resolves.toBe("balanced");
    await expect(
      runWithActiveGenerationSession(
        {
          trainerId: id,
          clientId: client.id,
          generationId,
          dayExerciseIds: [[generatedExercises[0].id]],
        },
        async () => "should-not-run",
      ),
    ).rejects.toBeInstanceOf(GenerationSessionError);

    const completionResults = await Promise.all([
      completeAndRecordGeneration({
        trainerId: id,
        clientId: client.id,
        generationId,
        exerciseIds: generatedExercises.map((exercise) => exercise.id),
      }),
      completeAndRecordGeneration({
        trainerId: id,
        clientId: client.id,
        generationId,
        exerciseIds: generatedExercises.map((exercise) => exercise.id),
      }),
    ]);
    expect(completionResults.map((result) => result.status).sort()).toEqual([
      "already_committed",
      "committed",
    ]);
    await expect(
      completeAndRecordGeneration({
        trainerId: id,
        clientId: client.id,
        generationId,
        exerciseIds: [generatedExercises[0].id],
      }),
    ).rejects.toBeInstanceOf(GenerationSessionError);
    await expect(
      authorizeGeneratedDay({
        trainerId: id,
        clientId: client.id,
        generationId,
        expectedDayCount: 2,
        dayIndex: 0,
        requestHash: "day-zero",
      }),
    ).rejects.toBeInstanceOf(GenerationSessionError);

    await expect(
      authorizeGeneratedDay({
        trainerId: id,
        clientId: client.id,
        generationId: randomUUID(),
        expectedDayCount: 1,
        dayIndex: 0,
        requestHash: "new-plan",
      }),
    ).rejects.toBeInstanceOf(SubscriptionLimitError);
  });

  it("uses the calendar month in Europe/Warsaw", () => {
    expect(getSubscriptionPeriod(new Date("2026-03-31T21:59:00.000Z"))).toEqual({
      periodStart: "2026-03-01",
      resetsAt: "2026-04-01",
    });
    expect(getSubscriptionPeriod(new Date("2026-03-31T22:01:00.000Z"))).toEqual({
      periodStart: "2026-04-01",
      resetsAt: "2026-05-01",
    });
  });

  it("exempts only the normalized Clerk email from automatic-plan limits", async () => {
    const id = await createTrainer();
    await db
      .update(trainersTable)
      .set({ email: null })
      .where(eq(trainersTable.id, id));
    vi.spyOn(clerkClient.users, "getUser").mockResolvedValue({
      primaryEmailAddress: { emailAddress: "  MAKSYMILIAN616@GMAIL.COM " },
    } as unknown as Awaited<ReturnType<typeof clerkClient.users.getUser>>);
    const [client] = await db
      .insert(clientsTable)
      .values({ firstName: "Unlimited", lastName: "Generation", trainerId: id })
      .returning({ id: clientsTable.id });

    for (let index = 0; index < 3; index += 1) {
      await authorizeGeneratedDay({
        trainerId: id,
        clientId: client.id,
        generationId: randomUUID(),
        expectedDayCount: 1,
        dayIndex: 0,
        requestHash: `allowlisted-${index}`,
      });
    }
  });

  it("applies PRO limits and removes all limits for UNLIMITED", async () => {
    const id = await createTrainer();
    await db
      .insert(trainerSubscriptionsTable)
      .values({ trainerId: id, planCode: "PRO", status: "active" })
      .onConflictDoUpdate({
        target: trainerSubscriptionsTable.trainerId,
        set: { planCode: "PRO", status: "active" },
      });

    await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        runWithSubscriptionLimit(id, "clients", (tx) =>
          tx
            .insert(clientsTable)
            .values({ firstName: `Pro ${index}`, lastName: "Client", trainerId: id })
            .returning({ id: clientsTable.id }),
        ),
      ),
    );
    await expect(
      runWithSubscriptionLimit(id, "clients", (tx) =>
        tx
          .insert(clientsTable)
          .values({ firstName: "Over", lastName: "Limit", trainerId: id })
          .returning({ id: clientsTable.id }),
      ),
    ).rejects.toBeInstanceOf(SubscriptionLimitError);

    await db
      .update(trainerSubscriptionsTable)
      .set({ planCode: "UNLIMITED", status: "active" })
      .where(eq(trainerSubscriptionsTable.trainerId, id));
    await expect(
      runWithSubscriptionLimit(id, "clients", (tx) =>
        tx
          .insert(clientsTable)
          .values({ firstName: "Unlimited", lastName: "Client", trainerId: id })
          .returning({ id: clientsTable.id }),
      ),
    ).resolves.toHaveLength(1);

    const summary = await getSubscriptionSummary(id);
    expect(summary.plan.code).toBe("UNLIMITED");
    expect(summary.usage.clients).toMatchObject({
      used: 16,
      limit: null,
      remaining: null,
      atLimit: false,
    });
  });
});