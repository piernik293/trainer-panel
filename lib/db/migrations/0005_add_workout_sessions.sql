-- Migration: add workout_sessions and exercise_execution_logs tables
-- These tables support the client execution layer (plan viewing + workout logging).

CREATE TABLE "workout_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL,
  "plan_id" integer NOT NULL,
  "plan_day_id" integer NOT NULL,
  "session_date" date NOT NULL,
  "is_completed" boolean DEFAULT false NOT NULL,
  "notes" text,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_execution_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL,
  "plan_exercise_id" integer NOT NULL,
  "sets_completed" integer,
  "reps_completed" integer,
  "weight_kg" numeric(6, 2),
  "rir" integer,
  "note" text,
  "is_completed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_client_id_clients_id_fk"
  FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_plan_id_workout_plans_id_fk"
  FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_plan_day_id_workout_plan_days_id_fk"
  FOREIGN KEY ("plan_day_id") REFERENCES "public"."workout_plan_days"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "exercise_execution_logs"
  ADD CONSTRAINT "exercise_execution_logs_session_id_workout_sessions_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "exercise_execution_logs"
  ADD CONSTRAINT "exercise_execution_logs_plan_exercise_id_workout_plan_exercises_id_fk"
  FOREIGN KEY ("plan_exercise_id") REFERENCES "public"."workout_plan_exercises"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ws_client_plan_idx" ON "workout_sessions" USING btree ("client_id", "plan_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "eel_session_exercise_idx" ON "exercise_execution_logs" USING btree ("session_id", "plan_exercise_id");
