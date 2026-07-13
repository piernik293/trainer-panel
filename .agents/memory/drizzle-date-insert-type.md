---
name: Drizzle date() column insert requires string not Date
description: Drizzle ORM v0.45+ pg date() columns reject Date objects at the TypeScript level for inserts — they expect ISO date strings.
---

## Rule
When inserting into a Drizzle `date()` column, always pass a `string` in `'YYYY-MM-DD'` format, not a `Date` object.

## Why
`date()` (pg-core) maps to PostgreSQL's `date` type. In Drizzle v0.45.x, the inferred insert type for `date()` is `string | SQL | Placeholder | null | undefined` — NOT `Date`. Even though pg driver can handle Date objects at runtime, TypeScript will reject `Date` at the type level.

The pattern in this project: orval generates `z.coerce.date()` for API date fields (from OpenAPI `format: date` via the postprocess script), so parsed request data has `dateOfBirth: Date | undefined`. Before inserting, convert:

```typescript
// Convert Zod Date → string for Drizzle insert
dateOfBirth: dateOfBirthDate ? dateOfBirthDate.toISOString().split("T")[0] : undefined,
```

## How to apply
Affects: `surveys.ts`, `public.ts` insert routes — any route that takes a date field from a Zod-parsed body and inserts it into a Drizzle `date()` column.
