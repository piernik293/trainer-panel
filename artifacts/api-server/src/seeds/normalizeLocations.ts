/**
 * One-time idempotent data migration: replace the legacy "Siłownia plenerowa"
 * exercise location value with the canonical stored value "Plener".
 *
 * Safe to run on every startup — the WHERE clause makes it a no-op when no
 * rows need updating.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

export async function normalizeExerciseLocations(): Promise<void> {
  const result = await db.execute(sql`
    UPDATE exercises
    SET training_location = array_replace(training_location, 'Siłownia plenerowa', 'Plener')
    WHERE 'Siłownia plenerowa' = ANY(training_location)
  `);

  const count = (result as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    logger.info(
      { count },
      "normalizeExerciseLocations: migrated exercises from 'Siłownia plenerowa' to 'Plener'",
    );
  }
}
