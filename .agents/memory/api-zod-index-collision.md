---
name: api-zod index.ts export collision
description: When orval generates both a Zod schema (value) and a TS interface with the same name, re-exporting both from index.ts causes TS2308 errors even with `export type *`.
---

## Rule
`lib/api-zod/src/index.ts` must NOT re-export `./generated/types`. Only export `./generated/api` (Zod schemas) and `./date-only`.

## Why
Orval generates:
- `./generated/api.ts` — Zod schemas as `export const X = zod.object({...})`  
- `./generated/types/*.ts` — TS interfaces as `export type X = ...` / `export interface X`

When an endpoint's response/params schemas share a name (e.g. `ListExerciseRecommendationsParams`), both modules export that name. TypeScript's `export *` (and even `export type *`) treats this as TS2308 ambiguity and refuses to compile.

**Fix:** Remove `export * from "./generated/types"` entirely. The Zod schemas already serve as both runtime validators and TypeScript types (via inference). No application code imported from types/ — the api-server uses Zod schemas for `.parse()`/`.safeParse()`, and the trainer-app imports from `@workspace/api-client-react` only.

## How to apply
After any orval regeneration, verify `lib/api-zod/src/index.ts` only contains:
```typescript
export * from "./generated/api";
export * from "./date-only";
```
If someone re-adds the types/ export, run `pnpm run typecheck:libs` and it will fail immediately with TS2308 for any colliding schema names.
