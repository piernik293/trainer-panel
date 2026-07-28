/**
 * TARGET_ORDER completeness — integration test.
 *
 * Queries all active rows from the volume_targets table and asserts that
 * every target name is listed in the TARGET_ORDER array inside
 * volumeCalculator.ts. This prevents silent under-counting: a target absent
 * from TARGET_ORDER is sorted to the bottom of the display list and, if the
 * UI ever filters or truncates by position, its volume contribution becomes
 * invisible to the trainer.
 *
 * When you add a new volume target to the database, add its name to
 * TARGET_ORDER in volumeCalculator.ts — this test will catch the omission.
 *
 * Intentional omissions (targets that should always be excluded from the
 * display list) must be documented in INTENTIONAL_OMISSIONS below.
 */

import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool, volumeTargetsTable } from "@workspace/db";
import { TARGET_ORDER } from "../volumeCalculator";

// Close the connection pool after all tests to allow the process to exit cleanly.
afterAll(async () => {
  await pool.end();
});

/**
 * Names of active volume targets that are intentionally excluded from
 * TARGET_ORDER. Add an entry here (with a comment explaining why) only when
 * a target exists in the DB but should never appear in the volume display.
 *
 * Example:
 *   "Mięśnie stabilizujące" // internal-only marker, not shown to trainers
 */
const INTENTIONAL_OMISSIONS: string[] = [];

describe("TARGET_ORDER completeness — DB integration", () => {
  it("every active volume_target name appears in TARGET_ORDER (or is listed as an intentional omission)", async () => {
    const rows = await db
      .select({ name: volumeTargetsTable.name })
      .from(volumeTargetsTable)
      .where(eq(volumeTargetsTable.isActive, true));

    const activeNames = rows.map((r) => r.name);

    const missing = activeNames.filter(
      (name) =>
        !TARGET_ORDER.includes(name) && !INTENTIONAL_OMISSIONS.includes(name),
    );

    expect(
      missing,
      `These active volume targets are missing from TARGET_ORDER in volumeCalculator.ts:\n` +
        missing.map((n) => `  - "${n}"`).join("\n") +
        `\nAdd them to TARGET_ORDER, or add them to INTENTIONAL_OMISSIONS in this test file if they should never be displayed.`,
    ).toHaveLength(0);
  });

  it("TARGET_ORDER contains no duplicates", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of TARGET_ORDER) {
      if (seen.has(name)) duplicates.push(name);
      seen.add(name);
    }
    expect(
      duplicates,
      `TARGET_ORDER contains duplicate entries: ${duplicates.join(", ")}`,
    ).toHaveLength(0);
  });
});
