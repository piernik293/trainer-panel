-- Stage 4.1A: one-off exceptions to weekly trainer availability.
-- type: blocked_day | blocked_range | extra_range
-- date is a Europe/Warsaw calendar day. Exceptions affect only free-slot
-- generation; existing bookings are never modified by exceptions.

CREATE TABLE IF NOT EXISTS "trainer_availability_exceptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "trainer_id" integer NOT NULL REFERENCES "trainers"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "type" text NOT NULL,
  "start_time" time,
  "end_time" time,
  "session_duration_minutes" integer,
  "break_minutes" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "availability_exceptions_type_check"
    CHECK ("type" IN ('blocked_day', 'blocked_range', 'extra_range')),
  CONSTRAINT "availability_exceptions_shape_check" CHECK (
    ("type" = 'blocked_day'
      AND "start_time" IS NULL AND "end_time" IS NULL
      AND "session_duration_minutes" IS NULL AND "break_minutes" IS NULL)
    OR ("type" = 'blocked_range'
      AND "start_time" IS NOT NULL AND "end_time" IS NOT NULL
      AND "end_time" > "start_time")
    OR ("type" = 'extra_range'
      AND "start_time" IS NOT NULL AND "end_time" IS NOT NULL
      AND "end_time" > "start_time"
      AND "session_duration_minutes" IS NOT NULL AND "break_minutes" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "availability_exceptions_trainer_date_idx"
  ON "trainer_availability_exceptions" ("trainer_id", "date");
