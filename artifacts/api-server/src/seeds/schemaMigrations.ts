import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Idempotent column-level schema migrations that drizzle-kit push missed on the
 * production database. Each statement uses IF NOT EXISTS / IF EXISTS so it is
 * safe to run on every cold start — it becomes a no-op once the column exists.
 */
export async function runSchemaMigrations(): Promise<void> {
  // Added trainingMotivation field to the survey form ("Dlaczego chcesz trenować?")
  // The column is in the Drizzle schema but was never pushed to the production DB.
  await db.execute(
    sql`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS training_motivation TEXT`,
  );
  // New isolated field for Dynamika / Szybkość / Stabilizacja sport priorities
  await db.execute(
    sql`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS sports_priorities TEXT[] NOT NULL DEFAULT '{}'`,
  );
  logger.info("Schema migrations complete");
}
