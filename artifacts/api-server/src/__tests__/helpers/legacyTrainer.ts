/**
 * Test helper for suites written before trainer authentication existed.
 *
 * Those suites call trainer endpoints with no real session. They mock
 * @clerk/express so getAuth() returns LEGACY_TEST_TRAINER, and use these
 * helpers to make sure that trainer exists and owns the clients they create.
 */

import { db, clientsTable } from "@workspace/db";
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
