/**
 * Test helper for suites written before trainer authentication existed.
 *
 * Those suites call trainer endpoints with no real session. They mock
 * @clerk/express so getAuth() returns LEGACY_TEST_TRAINER, and use these
 * helpers to make sure that trainer exists and owns the clients they create.
 */

import { db, clientsTable, surveysTable, workoutPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { provisionTrainer } from "../../middlewares/requireAuth";

/** Keep in sync with the literal in each suite's vi.mock("@clerk/express"). */
export const LEGACY_TEST_TRAINER = "legacy_test_trainer";

let cachedId: number | undefined;

export async function legacyTrainerId(): Promise<number> {
  if (cachedId === undefined) {
    const trainer = await provisionTrainer(LEGACY_TEST_TRAINER);
    if (!trainer) throw new Error("legacy test trainer could not be provisioned");
    cachedId = trainer.id;
  }
  return cachedId;
}

/** Assign the client to the legacy test trainer (idempotent). */
export async function ownByLegacyTrainer<T extends { id: number }>(client: T): Promise<T> {
  const trainerId = await legacyTrainerId();
  await db.update(clientsTable).set({ trainerId }).where(eq(clientsTable.id, client.id));
  return { ...client, trainerId };
}

/**
 * A client with a survey, owned by the legacy test trainer — replaces the
 * client IDs (1, 3, 4, 19, 20…) that the old suites borrowed from the Replit
 * database. Created once per email, then reused.
 */
export async function legacyFixtureClient(
  email: string,
  survey: Partial<typeof surveysTable.$inferInsert> | null = {},
): Promise<{ clientId: number; surveyId: number }> {
  const trainerId = await legacyTrainerId();
  let [client] = await db.select().from(clientsTable).where(eq(clientsTable.email, email));
  if (!client) {
    [client] = await db
      .insert(clientsTable)
      .values({ firstName: "Fixture", lastName: "Client", email, status: "active", trainerId })
      .returning();
  } else if (client.trainerId !== trainerId) {
    await db.update(clientsTable).set({ trainerId }).where(eq(clientsTable.id, client.id));
  }
  if (survey === null) {
    // Client without a survey (such fixtures never get plans, so this is safe).
    await db.delete(surveysTable).where(eq(surveysTable.clientId, client.id));
    return { clientId: client.id, surveyId: 0 };
  }
  const values = {
    firstName: "Fixture",
    lastName: "Client",
    email,
    experienceLevel: "Początkujący",
    trainingLocation: "Siłownia",
    equipment: "Hantle, Sztanga i talerze, Ławeczka treningowa",
    ...survey,
  };
  // Update the existing survey instead of deleting it: fixture plans from
  // earlier runs reference it (FK).
  const [existing] = await db
    .select({ id: surveysTable.id })
    .from(surveysTable)
    .where(eq(surveysTable.clientId, client.id))
    .limit(1);
  if (existing) {
    await db.update(surveysTable).set(values).where(eq(surveysTable.id, existing.id));
    return { clientId: client.id, surveyId: existing.id };
  }
  const [created] = await db
    .insert(surveysTable)
    .values({ clientId: client.id, ...values })
    .returning();
  return { clientId: client.id, surveyId: created.id };
}

/** A draft plan for a fixture client (replaces plan IDs borrowed from Replit). */
export async function legacyFixturePlan(
  clientId: number,
  surveyId: number,
  experienceLevelUsed = "Zaawansowany",
  guidelineVersionId = 1,
): Promise<number> {
  const [plan] = await db
    .insert(workoutPlansTable)
    .values({ clientId, surveyId, guidelineVersionId, experienceLevelUsed, title: "Fixture plan" })
    .returning({ id: workoutPlansTable.id });
  return plan.id;
}
