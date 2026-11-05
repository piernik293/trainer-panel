-- Szybki wpis masy ciała i obwodów przez podopiecznego/osobę Solo (flaga BODY_LOG_ENABLED). Addytywnie. Jeden wpis na dzień.
CREATE TABLE IF NOT EXISTS body_measurements (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  measured_on date NOT NULL,
  weight_kg numeric(5,1) CHECK (weight_kg IS NULL OR (weight_kg >= 20 AND weight_kg <= 400)),
  waist_cm numeric(4,1) CHECK (waist_cm IS NULL OR (waist_cm >= 20 AND waist_cm <= 300)),
  hips_cm numeric(4,1) CHECK (hips_cm IS NULL OR (hips_cm >= 20 AND hips_cm <= 300)),
  chest_cm numeric(4,1) CHECK (chest_cm IS NULL OR (chest_cm >= 20 AND chest_cm <= 300)),
  arm_cm numeric(4,1) CHECK (arm_cm IS NULL OR (arm_cm >= 5 AND arm_cm <= 100)),
  thigh_cm numeric(4,1) CHECK (thigh_cm IS NULL OR (thigh_cm >= 10 AND thigh_cm <= 200)),
  created_at timestamp NOT NULL DEFAULT now(),
  CHECK (weight_kg IS NOT NULL OR waist_cm IS NOT NULL OR hips_cm IS NOT NULL OR chest_cm IS NOT NULL OR arm_cm IS NOT NULL OR thigh_cm IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS body_measurements_client_day_idx ON body_measurements (client_id, measured_on);
