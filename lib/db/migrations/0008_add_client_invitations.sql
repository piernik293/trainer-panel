-- Migration 0008: client portal activation invitations
--
-- Each row represents a single-use invitation created by a trainer
-- to grant a specific client access to the client portal.
-- The raw token is NEVER stored; only the SHA-256 hash is persisted.

CREATE TABLE IF NOT EXISTS client_invitations (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  trainer_id  INTEGER NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  revoked_at  TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Fast look-up by token hash (the hot path for validation and activation).
CREATE INDEX IF NOT EXISTS idx_client_invitations_token_hash
  ON client_invitations (token_hash);

-- Trainer-facing: list active invitations for a given client.
CREATE INDEX IF NOT EXISTS idx_client_invitations_client_id
  ON client_invitations (client_id);
