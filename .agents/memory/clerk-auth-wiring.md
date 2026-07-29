---
name: Clerk auth middleware wiring
description: How Clerk is wired in api-server and trainer-app; patterns that are non-obvious or took multiple attempts.
---

# Clerk Auth Middleware Wiring

## Key facts

**api-server:**
- `clerkProxyMiddleware` and `clerkMiddleware(publishableKeyFromHost)` must be mounted before body parsers in `app.ts`.
- `requireAuth` (in `middlewares/requireAuth.ts`) uses `getAuth(req)` from `@clerk/express` and provisions trainers JIT via `INSERT … ON CONFLICT (clerk_user_id) DO NOTHING` + `SELECT` in a transaction. This handles concurrent first requests safely.
- `requireCatalogueAdmin` reads `CATALOGUE_ADMIN_CLERK_IDS` (comma-separated Clerk user IDs env var). If absent/empty → 403. No fallback.
- Exercise privacy: `createdByTrainerId IS NOT NULL` = private. Unauthenticated GET /exercises only returns public exercises (where IS NULL).
- Startup migration (`lib/migration.ts`) runs Steps A→B→C: adds nullable `trainer_id` to `clients`, backfills if exactly one trainer exists, enforces NOT NULL. Defers if no trainers provisioned yet (Step B/C skipped). Ambiguous multi-trainer state throws and the server does not start.

**trainer-app:**
- `publishableKeyFromHost` comes from `@clerk/react/internal` (not `@clerk/react`).
- `resolve.dedupe: ['react', 'react-dom']` in `vite.config.ts` prevents the React duplication hook error.
- `ClerkProvider` takes `routerPush`/`routerReplace` from wouter's `setLocation`; strip basePath prefix before passing to setLocation.
- Signed-out redirect uses `<Show when="signed-out"><Redirect to="/sign-in" /></Show>` pattern inside the main layout.

**Why:**
- Clerk's `publishableKeyFromHost` resolves the key from `window.location.hostname` so the same build serves multiple Clerk custom domains.
- JIT trainer provisioning with ON CONFLICT is safer than check-then-insert under concurrent load.

**How to apply:**
- Any new route that touches client data must call `requireAuth` middleware.
- Exercise mutations must also call `requireCatalogueAdmin`.
- Survey/plan/note/session routes are NOT yet protected — see the audit comment in `routes/index.ts`.
