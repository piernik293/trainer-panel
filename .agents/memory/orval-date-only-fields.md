---
name: orval date vs date-time coercion
description: orval's zod client generator ignores the OpenAPI date/date-time distinction when date coercion is enabled; fixed at the codegen layer, not per-route.
---

orval's `zod` client (with `override.zod.coerce` including `date` and `useDates: true`) emits `zod.coerce.date()` for both `format: date` and `format: date-time` OpenAPI properties. It does not read the `format` value to distinguish them. A `Date` always JSON-serializes as a full ISO timestamp, which breaks anything bound to a native `<input type="date">` expecting `YYYY-MM-DD`.

**Why:** This caused a real bug (`dateOfBirth` silently breaking a date picker) that was first patched with a one-off per-route transform, which doesn't protect the next date-only field added anywhere else in the API.

**How to apply:** Fixed generically, not per-route: `lib/api-spec/scripts/fix-date-only-fields.mjs` runs right after `orval` in the `codegen` script. It scans `openapi.yaml` for properties with `format: date` (not `date-time`) and rewrites the matching `zod.coerce.date()` calls in the generated `lib/api-zod/src/generated/api.ts` to import and use a shared `dateOnly` schema (`lib/api-zod/src/date-only.ts`, exported from the package root) that transforms to a plain `YYYY-MM-DD` string. Any new date-only field defined correctly in the OpenAPI spec is fixed automatically on the next `codegen` run — no manual per-route helper needed. Route handlers that need `Date` math on a date-only request field must do `new Date(dateOnlyString)` locally; the schema no longer hands them a `Date`.
