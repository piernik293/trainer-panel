/**
 * Shared schema for OpenAPI `format: date` fields (date-only, e.g. `dateOfBirth`).
 *
 * The generated schemas in `./generated/api.ts` normally coerce every
 * date/date-time field to a JS `Date` (see `lib/api-spec/orval.config.ts`).
 * That is correct for `format: date-time` timestamps, but a `Date` always
 * JSON-serializes as a full ISO timestamp (`1990-05-15T00:00:00.000Z`), which
 * breaks any consumer bound to a native `<input type="date">` that requires
 * an exact `YYYY-MM-DD` string.
 *
 * `dateOnly` accepts a `Date` or date string (so it still parses values
 * coming straight out of the database driver) but always outputs a plain
 * `YYYY-MM-DD` string, so responses round-trip safely into date inputs.
 *
 * This schema is applied automatically to every `format: date` property by
 * `lib/api-spec/scripts/fix-date-only-fields.mjs`, which runs as part of the
 * `codegen` script right after orval. Do not hand-edit `generated/api.ts` to
 * fix a date field — fix it there, or in this file, instead.
 */
import * as zod from "zod";

export const dateOnly = zod.coerce
  .date()
  .transform((date) => date.toISOString().slice(0, 10));
