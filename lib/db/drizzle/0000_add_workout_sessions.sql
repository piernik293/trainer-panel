CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"training_goal" text,
	"training_goal_other" text,
	"experience_level" text,
	"training_duration" text,
	"health_limitations" text,
	"weekly_frequency" integer,
	"desired_weekly_frequency" integer,
	"session_duration" text,
	"preferred_muscles" text,
	"avoided_muscles" text,
	"avoided_exercises" text,
	"favorite_exercises" text,
	"advanced_methods_to_avoid" text[] DEFAULT '{}' NOT NULL,
	"additional_info" text,
	"age" integer,
	"date_of_birth" date,
	"gender" text,
	"height_cm" integer,
	"weight_kg" integer,
	"activity_level" text,
	"sleep_hours" text,
	"stress_level" integer,
	"plan_style_preference" text,
	"priority_muscle_1" text,
	"priority_muscle_2" text,
	"priority_muscle_3" text,
	"training_location" text,
	"equipment" text,
	"cardio_preference" text,
	"cardio_frequency" text,
	"preferred_cardio_type" text,
	"avoids_advanced_methods" boolean,
	"injury_status" text,
	"athlete_status" text,
	"sport_discipline" text,
	"sport_performance_needs" text[] DEFAULT '{}' NOT NULL,
	"avoided_exercise_ids" integer[] DEFAULT '{}' NOT NULL,
	"avoided_exercise_reasons" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avoided_exercise_other_text" text,
	"avoided_exercise_other_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainer_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"main_muscle_group" text NOT NULL,
	"secondary_muscle_groups" text[] DEFAULT '{}' NOT NULL,
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"equipment_other" text,
	"training_location" text[] DEFAULT '{}' NOT NULL,
	"difficulty_level" text,
	"movement_pattern" text,
	"description" text,
	"execution_instructions" text,
	"common_mistakes" text,
	"coaching_tips" text,
	"video_url" text,
	"image_url" text,
	"exercise_type" text,
	"breathing_tips" text,
	"safety_notes" text,
	"tempo" text,
	"range_of_motion" text,
	"suitable_experience_levels" text[] DEFAULT '{}' NOT NULL,
	"training_goals" text[] DEFAULT '{}' NOT NULL,
	"movement_category" text,
	"plane_of_motion" text,
	"execution" text,
	"resistance_type" text,
	"requires_spotter" boolean,
	"can_be_performed_to_failure" text,
	"joint_stress" text,
	"learning_difficulty" integer,
	"neurological_fatigue" integer,
	"doms_potential" integer,
	"exercise_priority" text,
	"suitable_for_no_activity" boolean,
	"movement_complexity" text,
	"sub_target_biases" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_progressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" integer NOT NULL,
	"linked_exercise_id" integer NOT NULL,
	"direction" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_substitutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" integer NOT NULL,
	"substitute_exercise_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_muscle_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" integer NOT NULL,
	"specific_muscle_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"coefficient" real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specific_muscles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"broad_category" text NOT NULL
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
CREATE TABLE "volume_guideline_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"source_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volume_guidelines" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"experience_level" text NOT NULL,
	"volume_target_id" integer NOT NULL,
	"session_min" numeric(5, 2) NOT NULL,
	"session_max" numeric(5, 2) NOT NULL,
	"weekly_preferred_ceiling" numeric(5, 2) NOT NULL,
	"weekly_absolute_ceiling" numeric(5, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volume_target_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"volume_target_id" integer NOT NULL,
	"specific_muscle_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volume_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"target_type" text NOT NULL,
	"broad_category" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "volume_targets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "workout_plan_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"day_order" integer NOT NULL,
	"day_name" text,
	"subtitle" text,
	"description" text,
	"estimated_duration_minutes" integer,
	"trainer_notes" text
);
--> statement-breakpoint
CREATE TABLE "workout_plan_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"order_in_day" integer NOT NULL,
	"working_sets" integer NOT NULL,
	"warm_up_sets" integer DEFAULT 0 NOT NULL,
	"rep_type" text,
	"reps_exact" integer,
	"rep_range_min" integer,
	"rep_range_max" integer,
	"rep_time_seconds" integer,
	"rep_distance_meters" integer,
	"rep_open_instruction" text,
	"load_type" text,
	"load_value" text,
	"load_instruction" text,
	"rir" integer,
	"rpe" text,
	"rir_or_rpe" text,
	"tempo" text,
	"rest_seconds" integer,
	"notes" text,
	"client_instructions" text
);
--> statement-breakpoint
CREATE TABLE "workout_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"survey_id" integer NOT NULL,
	"guideline_version_id" integer NOT NULL,
	"experience_level_used" text NOT NULL,
	"title" text NOT NULL,
	"goal" text,
	"description" text,
	"start_date" date,
	"end_date" date,
	"trainer_notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"split_type" text,
	"block_duration_weeks" integer DEFAULT 6
);
--> statement-breakpoint
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
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_notes" ADD CONSTRAINT "trainer_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_progressions" ADD CONSTRAINT "exercise_progressions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_progressions" ADD CONSTRAINT "exercise_progressions_linked_exercise_id_exercises_id_fk" FOREIGN KEY ("linked_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitutions" ADD CONSTRAINT "exercise_substitutions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_substitutions" ADD CONSTRAINT "exercise_substitutions_substitute_exercise_id_exercises_id_fk" FOREIGN KEY ("substitute_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscle_assignments" ADD CONSTRAINT "exercise_muscle_assignments_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_muscle_assignments" ADD CONSTRAINT "exercise_muscle_assignments_specific_muscle_id_specific_muscles_id_fk" FOREIGN KEY ("specific_muscle_id") REFERENCES "public"."specific_muscles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_execution_logs" ADD CONSTRAINT "exercise_execution_logs_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_execution_logs" ADD CONSTRAINT "exercise_execution_logs_plan_exercise_id_workout_plan_exercises_id_fk" FOREIGN KEY ("plan_exercise_id") REFERENCES "public"."workout_plan_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_guidelines" ADD CONSTRAINT "volume_guidelines_version_id_volume_guideline_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."volume_guideline_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_guidelines" ADD CONSTRAINT "volume_guidelines_volume_target_id_volume_targets_id_fk" FOREIGN KEY ("volume_target_id") REFERENCES "public"."volume_targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_target_members" ADD CONSTRAINT "volume_target_members_volume_target_id_volume_targets_id_fk" FOREIGN KEY ("volume_target_id") REFERENCES "public"."volume_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volume_target_members" ADD CONSTRAINT "volume_target_members_specific_muscle_id_specific_muscles_id_fk" FOREIGN KEY ("specific_muscle_id") REFERENCES "public"."specific_muscles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plan_days" ADD CONSTRAINT "workout_plan_days_plan_id_workout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plan_exercises" ADD CONSTRAINT "workout_plan_exercises_day_id_workout_plan_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."workout_plan_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plan_exercises" ADD CONSTRAINT "workout_plan_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_guideline_version_id_volume_guideline_versions_id_fk" FOREIGN KEY ("guideline_version_id") REFERENCES "public"."volume_guideline_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_plan_id_workout_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."workout_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_plan_day_id_workout_plan_days_id_fk" FOREIGN KEY ("plan_day_id") REFERENCES "public"."workout_plan_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "surveys_client_id_created_at_idx" ON "surveys" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trainer_notes_client_id_created_at_idx" ON "trainer_notes" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_slug_idx" ON "exercises" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "ep_exercise_linked_direction_unique_idx" ON "exercise_progressions" USING btree ("exercise_id","linked_exercise_id","direction");--> statement-breakpoint
CREATE UNIQUE INDEX "es_exercise_substitute_unique_idx" ON "exercise_substitutions" USING btree ("exercise_id","substitute_exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ema_exercise_muscle_unique_idx" ON "exercise_muscle_assignments" USING btree ("exercise_id","specific_muscle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ema_one_primary_per_exercise_idx" ON "exercise_muscle_assignments" USING btree ("exercise_id") WHERE "exercise_muscle_assignments"."is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "specific_muscles_name_idx" ON "specific_muscles" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "eel_session_exercise_idx" ON "exercise_execution_logs" USING btree ("session_id","plan_exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vg_version_level_target_idx" ON "volume_guidelines" USING btree ("version_id","experience_level","volume_target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vtm_target_muscle_idx" ON "volume_target_members" USING btree ("volume_target_id","specific_muscle_id");--> statement-breakpoint
CREATE INDEX "wpd_plan_day_order_idx" ON "workout_plan_days" USING btree ("plan_id","day_order");--> statement-breakpoint
CREATE INDEX "wpe_day_order_idx" ON "workout_plan_exercises" USING btree ("day_id","order_in_day");--> statement-breakpoint
CREATE INDEX "workout_plans_client_id_idx" ON "workout_plans" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "ws_client_plan_idx" ON "workout_sessions" USING btree ("client_id","plan_id");