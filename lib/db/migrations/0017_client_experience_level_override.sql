-- 0017: trainer's manual override of the experience level used by the generator
-- (additive, nullable). NULL = use the effective level (client choice capped by
-- training experience: < 2 years → at most "Początkujący").
ALTER TABLE clients ADD COLUMN IF NOT EXISTS experience_level_override text;
