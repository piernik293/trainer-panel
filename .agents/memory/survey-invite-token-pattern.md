---
name: Survey invite token pattern
description: How trainer-scoped survey invitations are generated, stored, and consumed
---

## Pattern
- Raw token: `crypto.randomBytes(32).toString("hex")` → 64-char hex string
- Only the SHA-256 hash is stored in `survey_invites.token_hash`
- Raw token is sent in the invite URL; never logged or stored

## Concurrent consumption guard
The transaction does `UPDATE survey_invites SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW() RETURNING *`.  
If 0 rows returned → 410 Gone (token already consumed by a concurrent request).  
No explicit DB lock needed; atomic UPDATE WHERE is the guard.

## Error code semantics
- **404** — token does not exist in the DB (random/malformed)
- **410** — token existed but is expired, revoked, or already used
- **400** — format invalid (not 64 chars)

## Early rejection pattern
Validate the token via SELECT *before* parsing/validating the request body. This ensures expired/revoked tokens always return 410 (not 400 body-validation error). The transaction re-checks atomically — the SELECT is just an early-exit guard.

**Why:** Without pre-check, body validation error (400) masks the real 410 for invalid tokens. Tests fail expecting 410 but get 400 from body parse.

## APP_ADMIN_CLERK_IDS env var
- Comma-separated Clerk user IDs; exported from `requireAuth.ts` as `checkIsAppAdmin(clerkUserId)`
- Separate from `CATALOGUE_ADMIN_CLERK_IDS` (exercise catalogue mutations)
- Used in `stats.ts` to allow admin to see all trainer data; defaults fail-closed (no IDs = no admins)
