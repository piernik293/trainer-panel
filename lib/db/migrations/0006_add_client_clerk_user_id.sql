-- Migration: add clerk_user_id to clients for client portal authentication
-- Nullable + unique: clients without a portal account have no Clerk identity.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE;
