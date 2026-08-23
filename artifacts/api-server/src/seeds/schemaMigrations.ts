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

  // ── survey_invites.archived_at — soft-archive column added after initial table ─
  await db.execute(
    sql`ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
  );

  // ── survey_invites — one-time, trainer-scoped survey invitation tokens ────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS survey_invites (
      id             SERIAL       PRIMARY KEY,
      trainer_id     INTEGER      NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
      token_hash     TEXT         NOT NULL UNIQUE,
      intended_email TEXT,
      expires_at     TIMESTAMPTZ  NOT NULL,
      used_at        TIMESTAMPTZ,
      revoked_at     TIMESTAMPTZ,
      created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS survey_invites_trainer_id_idx
      ON survey_invites (trainer_id, created_at DESC)
  `);

  // ── Trainer ownership backfill ────────────────────────────────────────────────
  //
  // If exactly one trainer exists, assign all clients with trainer_id IS NULL
  // to that trainer. Idempotent: WHERE trainer_id IS NULL is a no-op once done.
  // Aborts safely if 0 or >1 trainers exist.
  await db.execute(sql`
    DO $$
    DECLARE
      v_trainer_count  INTEGER;
      v_trainer_id     INTEGER;
      v_null_before    INTEGER;
      v_null_after     INTEGER;
    BEGIN
      SELECT COUNT(*) INTO v_trainer_count FROM trainers;

      IF v_trainer_count = 1 THEN
        SELECT id INTO v_trainer_id FROM trainers LIMIT 1;
        SELECT COUNT(*) INTO v_null_before FROM clients WHERE trainer_id IS NULL;

        IF v_null_before > 0 THEN
          UPDATE clients SET trainer_id = v_trainer_id WHERE trainer_id IS NULL;
          SELECT COUNT(*) INTO v_null_after FROM clients WHERE trainer_id IS NULL;
          RAISE NOTICE 'Ownership backfill: trainer_id=% assigned to % clients (% NULL remaining)',
            v_trainer_id, v_null_before - v_null_after, v_null_after;
        END IF;

      ELSIF v_trainer_count = 0 THEN
        RAISE NOTICE 'Ownership backfill skipped: no trainers exist yet';
      ELSE
        RAISE NOTICE 'Ownership backfill skipped: % trainers exist — manual resolution required', v_trainer_count;
      END IF;
    END $$
  `);

  // ── Apply NOT NULL to clients.trainer_id ─────────────────────────────────────
  //
  // Only applied once, only when there are no NULL rows left.
  // Uses information_schema to check whether the constraint already exists.
  await db.execute(sql`
    DO $$
    DECLARE
      v_is_nullable TEXT;
      v_null_count  INTEGER;
    BEGIN
      SELECT is_nullable INTO v_is_nullable
        FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'trainer_id';

      IF v_is_nullable = 'YES' THEN
        SELECT COUNT(*) INTO v_null_count FROM clients WHERE trainer_id IS NULL;

        IF v_null_count = 0 THEN
          ALTER TABLE clients ALTER COLUMN trainer_id SET NOT NULL;
          RAISE NOTICE 'Applied NOT NULL constraint to clients.trainer_id';
        ELSE
          RAISE NOTICE 'Skipped NOT NULL: % clients still have trainer_id IS NULL', v_null_count;
        END IF;
      END IF;
    END $$
  `);

  // ── adaptive_start_decision — trainer decision on adaptive start mode ────────
  await db.execute(
    sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS adaptive_start_decision TEXT`,
  );

  // ── survey_invites.client_id — ties an invite to a pre-created client ────────
  await db.execute(
    sql`ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL`,
  );

  // ── confirmed_restrictions — structured restriction list for plan generation ──
  await db.execute(
    sql`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS confirmed_restrictions TEXT`,
  );

  // ── Trainer subscription MVP ────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trainer_subscriptions (
      trainer_id INTEGER PRIMARY KEY REFERENCES trainers(id) ON DELETE CASCADE,
      plan_code TEXT NOT NULL DEFAULT 'FREE'
        CHECK (plan_code IN ('FREE', 'PRO', 'UNLIMITED')),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
      provider TEXT,
      provider_customer_id TEXT,
      provider_subscription_id TEXT,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    INSERT INTO trainer_subscriptions (trainer_id, plan_code, status)
    SELECT id, 'FREE', 'active'
    FROM trainers
    ON CONFLICT (trainer_id) DO NOTHING
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trainer_generation_sessions (
      id UUID PRIMARY KEY,
      trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      expected_day_count INTEGER NOT NULL CHECK (expected_day_count BETWEEN 1 AND 7),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS trainer_generation_sessions_period_idx
      ON trainer_generation_sessions (trainer_id, period_start)
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trainer_generation_session_days (
      session_id UUID NOT NULL REFERENCES trainer_generation_sessions(id) ON DELETE CASCADE,
      day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
      request_hash TEXT NOT NULL,
      output_exercise_ids INTEGER[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, day_index)
    )
  `);
  await db.execute(sql`
    ALTER TABLE trainer_generation_session_days
      ADD COLUMN IF NOT EXISTS output_exercise_ids INTEGER[]
  `);

  logger.info("Schema migrations complete");
}
