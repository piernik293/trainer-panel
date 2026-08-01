-- 0011: history integrity
-- 1. Only one ACTIVE (not completed) session per client per plan day.
CREATE UNIQUE INDEX IF NOT EXISTS ws_one_active_per_client_day
  ON workout_sessions (client_id, plan_day_id)
  WHERE is_completed = false;

-- 2. Deleting a plan exercise must not delete workout history.
ALTER TABLE exercise_execution_logs
  ALTER COLUMN plan_exercise_id DROP NOT NULL;
ALTER TABLE exercise_execution_logs
  DROP CONSTRAINT IF EXISTS exercise_execution_logs_plan_exercise_id_workout_plan_exercises;
ALTER TABLE exercise_execution_logs
  DROP CONSTRAINT IF EXISTS exercise_execution_logs_plan_exercise_id_workout_plan_exercise;
ALTER TABLE exercise_execution_logs
  ADD CONSTRAINT eel_plan_exercise_id_fk
  FOREIGN KEY (plan_exercise_id) REFERENCES workout_plan_exercises(id) ON DELETE SET NULL;
