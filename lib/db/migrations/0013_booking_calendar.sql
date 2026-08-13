-- Stage 4 MVP: simple booking calendar (availability + bookings)

CREATE TABLE IF NOT EXISTS "trainer_availability" (
  "id" serial PRIMARY KEY NOT NULL,
  "trainer_id" integer NOT NULL REFERENCES "trainers"("id") ON DELETE CASCADE,
  "weekday" integer NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  "session_minutes" integer NOT NULL DEFAULT 60,
  "buffer_minutes" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" serial PRIMARY KEY NOT NULL,
  "trainer_id" integer NOT NULL REFERENCES "trainers"("id") ON DELETE CASCADE,
  "client_id" integer NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "starts_at" timestamptz NOT NULL,
  "duration_minutes" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'booked',
  "cancelled_at" timestamptz,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Double-booking protection: only one ACTIVE booking per trainer + start time.
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_trainer_start_active_idx"
  ON "bookings" ("trainer_id", "starts_at")
  WHERE status = 'booked';
