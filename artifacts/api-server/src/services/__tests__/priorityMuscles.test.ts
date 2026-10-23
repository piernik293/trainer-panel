/**
 * Priority muscle groups by EFFECTIVE level: beginners (incl. "Brak aktywności") — only the first one is used,
 * even when an older interview holds three; intermediate and advanced keep up to three.
 */
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "legacy_test_trainer" }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool, clientsTable, surveysTable } from "@workspace/db";
import { legacyTrainerId } from "../../__tests__/helpers/legacyTrainer";
import { loadPlanDraftInput } from "../planDraftInputService";

const EMAIL = "priority-muscles-fixture@example.invalid";
let clientId = 0;

async function withSurvey(over: Record<string, unknown>) {
  await db.delete(surveysTable).where(eq(surveysTable.clientId, clientId));
  await db.insert(surveysTable).values({
    clientId, trainingGoal: "Budowa sylwetki", desiredWeeklyFrequency: 3, sessionDuration: "45–60 min", trainingLocation: "Siłownia",
    equipment: "Hantle, Sztanga i talerze, Ławeczka treningowa", activityLevel: "Lekko aktywny", injuryStatus: "Brak",
    priorityMuscle1: "Barki", priorityMuscle2: "Pośladki", priorityMuscle3: "Plecy", ...over,
  } as never);
  return (await loadPlanDraftInput(clientId))!.input.priorityMuscleGroups;
}

beforeAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
  const [c] = await db.insert(clientsTable).values({ firstName: "Prio", lastName: "Test", email: EMAIL, trainerId: await legacyTrainerId() }).returning();
  clientId = c!.id;
});
afterAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.email, EMAIL));
  await pool.end();
});

describe("priority muscle groups in the generator input", () => {
  it("beginner with three groups in an older interview → only the first", async () => {
    expect(await withSurvey({ experienceLevel: "Początkujący" })).toEqual(["Barki"]);
  });
  it("'Brak aktywności fizycznej' → only the first", async () => {
    expect(await withSurvey({ experienceLevel: "Brak aktywności fizycznej" })).toEqual(["Barki"]);
  });
  it("intermediate chosen but under 2 years of training (effective = beginner) → only the first", async () => {
    expect(await withSurvey({ experienceLevel: "Średniozaawansowany", trainingDuration: "1 rok" })).toEqual(["Barki"]);
  });
  it("intermediate / advanced with 2+ years keep three", async () => {
    expect(await withSurvey({ experienceLevel: "Średniozaawansowany", trainingDuration: "3 lata" })).toEqual(["Barki", "Pośladki", "Plecy"]);
    expect(await withSurvey({ experienceLevel: "Zaawansowany", trainingDuration: "5 lat" })).toEqual(["Barki", "Pośladki", "Plecy"]);
  });
});
