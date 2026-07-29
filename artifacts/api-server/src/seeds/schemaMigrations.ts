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
  // client_exercise_usage_log — per-client exercise usage history for
  // draft-generation variety.  Only automatically selected exercises from
  // handleGenerateFromEmpty are inserted here.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS client_exercise_usage_log (
      id            SERIAL       PRIMARY KEY,
      client_id     INTEGER      NOT NULL REFERENCES clients(id)   ON DELETE CASCADE,
      generation_id UUID         NOT NULL,
      exercise_id   INTEGER      NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      generated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ceu_unique_client_gen_ex
      ON client_exercise_usage_log (client_id, generation_id, exercise_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ceu_client_gen_idx
      ON client_exercise_usage_log (client_id, generated_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ceu_client_exer_idx
      ON client_exercise_usage_log (client_id, exercise_id)
  `);
  logger.info("Schema migrations complete");
}
