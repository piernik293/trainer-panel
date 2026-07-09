---
name: zod coerce.date() breaks native date inputs
description: API response schemas using z.coerce.date() on a date-only DB column will leak a full ISO timestamp over JSON, breaking any <input type="date"> bound directly to that value.
---

## Problem
A Postgres/Drizzle `date` column stores/reads as a plain `"YYYY-MM-DD"` string. If the Zod response schema for that field is `z.coerce.date()` (common in codegen'd/OpenAPI-derived schemas), `schema.parse(row)` converts it into a JS `Date` object. When that parsed object is sent via `res.json(...)`, `JSON.stringify` calls `Date.prototype.toJSON()`, producing a full ISO timestamp like `"1990-05-15T00:00:00.000Z"` instead of `"1990-05-15"`.

Any frontend code binding this value straight into `<input type="date" value={...}>` will render blank/invalid, since that input strictly requires `YYYY-MM-DD`.

## Fix
After `.parse()`, before sending the response, trim the date field back down: `date.toISOString().slice(0, 10)`. Apply this at every response-emitting endpoint that returns the field (list, single, upsert), not just one.

**Why:** This bug is easy to miss because `curl`/JSON inspection of a *record with no date set* (`null`) looks fine — it only appears once a real date value flows through, and the failure mode in the UI is silent (field just looks empty) rather than an error.

**How to apply:** Whenever adding or reviewing an API endpoint that returns a `date`-typed DB column consumed by a native date input, verify the actual JSON shape with a real (non-null) value, not just typecheck the schema.
