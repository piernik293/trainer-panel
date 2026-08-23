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
);

INSERT INTO trainer_subscriptions (trainer_id, plan_code, status)
SELECT id, 'FREE', 'active'
FROM trainers
ON CONFLICT (trainer_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS trainer_generation_sessions (
  id UUID PRIMARY KEY,
  trainer_id INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  expected_day_count INTEGER NOT NULL CHECK (expected_day_count BETWEEN 1 AND 7),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS trainer_generation_sessions_period_idx
  ON trainer_generation_sessions (trainer_id, period_start);

CREATE TABLE IF NOT EXISTS trainer_generation_session_days (
  session_id UUID NOT NULL REFERENCES trainer_generation_sessions(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  request_hash TEXT NOT NULL,
  output_exercise_ids INTEGER[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, day_index)
);

ALTER TABLE trainer_generation_session_days
  ADD COLUMN IF NOT EXISTS output_exercise_ids INTEGER[];