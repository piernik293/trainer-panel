---
name: orval boolean query coercion
description: zod.coerce.boolean() in orval-generated query schemas mis-parses "false" as true — how to work around it in route handlers.
---

Orval's zod-client generator emits `zod.coerce.boolean().optional()` for OpenAPI boolean query parameters. `zod.coerce.boolean()` calls `Boolean(value)` under the hood, so any non-empty string — including the literal `"false"` — coerces to `true`. A query like `?isActive=false` therefore parses as `isActive: true`, silently breaking any filter that needs to select the false case.

**Why:** discovered while building filterable list endpoints (e.g. an exercises list with an active/inactive toggle) where `?isActive=false` returned only active records instead of only inactive ones.

**How to apply:** don't trust the generated schema's coerced boolean value for filtering logic. Still run `safeParse` for validation/shape-checking, but derive the actual boolean from the raw `req.query.<param>` string yourself (e.g. `"true"/"1" -> true`, `"false"/"0" -> false`, otherwise `undefined`). Don't hand-edit the generated schema file — it's overwritten on the next `pnpm codegen` run.
