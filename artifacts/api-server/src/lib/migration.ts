/**
 * Startup migration: trainer_id column on clients table.
 *
 * Runs on every server start, is idempotent, and checks column existence
 * before acting. Steps A → B → C per the task spec.
 *
 * The server MUST NOT accept requests if migration fails — the caller in
 * index.ts is responsible for exiting the process on error.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = ${table}
      AND column_name = ${column}
  `);
  return result.rows.length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = ${table}
  `);
  return result.rows.length > 0;
}

export async function runStartupMigration(): Promise<void> {
  // ── Ensure trainers table exists (Drizzle push handles schema, but guard) ──
  const trainersExist = await tableExists("trainers");
  if (!trainersExist) {
    logger.info("migration: creating trainers table");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trainers (
        id            SERIAL PRIMARY KEY,
        clerk_user_id TEXT NOT NULL UNIQUE,
        display_name  TEXT,
        email         TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }

  // ── Add created_by_trainer_id to exercises (nullable) ────────────────────
  // Run BEFORE any conditional return below so this additive step always
  // executes regardless of trainer/client backfill state.
  const hasExercisesCol = await columnExists("exercises", "created_by_trainer_id");
  if (!hasExercisesCol) {
    logger.info("migration: adding created_by_trainer_id column to exercises");
    await db.execute(sql`
      ALTER TABLE exercises
      ADD COLUMN created_by_trainer_id INTEGER REFERENCES trainers(id)
    `);
    logger.info("migration: created_by_trainer_id column added to exercises");
  }

  // ── Pre-migration row counts ──────────────────────────────────────────────
  const [clientCountRow] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM clients`)).rows as Array<{ n: number }>;
  const clientCount = clientCountRow.n;
  logger.info({ clientCount }, "migration: pre-migration client count");

  // ── Step A — add trainer_id column (nullable) if not already present ─────
  const hasTrainerIdCol = await columnExists("clients", "trainer_id");
  if (!hasTrainerIdCol) {
    logger.info("migration: Step A — adding nullable trainer_id column to clients");
    await db.execute(sql`
      ALTER TABLE clients
      ADD COLUMN trainer_id INTEGER REFERENCES trainers(id)
    `);
    logger.info("migration: Step A complete");
  } else {
    logger.info("migration: Step A skipped — trainer_id column already exists");
  }

  // ── Step B — backfill trainer_id ─────────────────────────────────────────
  // Only LEGACY orphans (no trainer and no portal account) are backfilled. A person with an account and no trainer (Solo, or someone whose
  // request to join is still pending) has no trainer on purpose: assigning them to a trainer would show their data without consent,
  // and counting them as "ambiguous" would make the API refuse to start (found in the pre-beta QA, 27.10.2026).
  const [nullCountRow] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM clients WHERE trainer_id IS NULL AND clerk_user_id IS NULL`)).rows as Array<{ n: number }>;
  const nullCount = nullCountRow.n;

  if (nullCount === 0) {
    logger.info("migration: Step B skipped — all clients already have trainer_id");
  } else {
    // Check trainer count.
    const [trainerCountRow] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM trainers`)).rows as Array<{ n: number }>;
    const trainerCount = trainerCountRow.n;

    if (trainerCount === 0) {
      // No trainers provisioned yet — defer backfill.
      // trainer_id will be backfilled on the next server start after first sign-in.
      // The exercises.created_by_trainer_id column was already added above.
      logger.info(
        { clientCount: nullCount },
        "migration: Step B deferred — no trainers provisioned yet. " +
        "trainer_id will be backfilled after first sign-in triggers trainer provisioning " +
        "and the server is restarted.",
      );
      return;
    }

    if (trainerCount > 1) {
      // Ambiguous — cannot determine correct owner.
      const msg =
        `migration: ABORT — ${trainerCount} trainers exist and ` +
        `${nullCount} clients have NULL trainer_id. ` +
        "Cannot safely backfill. Resolve manually and restart.";
      logger.error(msg);
      throw new Error(msg);
    }

    // Exactly one trainer — backfill all null rows.
    const [trainerRow] = (await db.execute(sql`SELECT id FROM trainers LIMIT 1`)).rows as Array<{ id: number }>;
    const trainerId = trainerRow.id;

    logger.info({ trainerId, nullCount }, "migration: Step B — backfilling trainer_id");
    await db.execute(sql`
      UPDATE clients SET trainer_id = ${trainerId} WHERE trainer_id IS NULL AND clerk_user_id IS NULL
    `);

    const [verify] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM clients WHERE trainer_id IS NULL AND clerk_user_id IS NULL`)).rows as Array<{ n: number }>;
    if (verify.n !== 0) {
      throw new Error(`migration: Step B verification failed — ${verify.n} clients still have NULL trainer_id`);
    }
    logger.info("migration: Step B complete — all clients backfilled");
  }

  // ── Step C — NOT NULL enforcement ────────────────────────────────────────
  //
  // ⚠️ PERMANENTLY DEFERRED — do not enable until POST /api/public/survey also
  // assigns trainerId to newly created clients. Enforcing NOT NULL now would
  // break public survey client creation (inserts run outside trainer-auth context).
  //
  // Enable in the task that protects survey routes and assigns default trainerId
  // for public-survey clients.
  //
  // Rollback (if ever applied manually):
  //   ALTER TABLE clients ALTER COLUMN trainer_id DROP NOT NULL;
  logger.info("migration: Step C permanently deferred — public survey must assign trainerId before NOT NULL can be enforced");

  // ── Post-migration verification ───────────────────────────────────────────
  const [postCount] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM clients`)).rows as Array<{ n: number }>;
  const groupRows = (await db.execute(sql`SELECT trainer_id, COUNT(*)::int AS n FROM clients GROUP BY trainer_id`)).rows;
  logger.info(
    { clientCountBefore: clientCount, clientCountAfter: postCount.n, groupRows },
    "migration: complete — verification passed",
  );
}
