-- 0016: details for the "Zaproś klienta" screen (additive, nullable only).
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS channel text;              -- 'email' | 'link'
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS trainer_message text;
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS opened_at timestamp;      -- first opening of the link
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS last_sent_at timestamp;   -- last e-mail (invite / resend / reminder)
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS reminded_at timestamp;    -- last reminder (max 1 per 24 h)
-- After a resend/reminder the token is rotated; the previous link keeps working.
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS previous_token_hash text;
CREATE INDEX IF NOT EXISTS survey_invites_previous_token_hash_idx ON survey_invites (previous_token_hash);
