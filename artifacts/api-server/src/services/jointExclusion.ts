/**
 * Hard exclusion of exercises that load a joint the client reported as painful.
 *
 * Business rule: an exercise whose joint tag (exercises.joint_stress_areas) matches a joint the client reported —
 * in the interview (health description) or in a "Coś boli?" report from the last 30 days — never enters a plan:
 * not as a main pick, not as a replacement/alternative, not through any fallback. The pool is cut once, before
 * any selection path runs (generate-day, day recommendations, recommendations), so every later path inherits it.
 * Exercises without a joint tag are not affected (the catalogue has no information about them).
 */
import { and, eq, gte } from "drizzle-orm";
import { db, painReportsTable } from "@workspace/db";
import { reportedJoints } from "./warmupSelection";

export const PAIN_LOOKBACK_DAYS = 30;

/** Pure: joints from the interview text plus pain reports not older than PAIN_LOOKBACK_DAYS. */
export function blockedJointsFrom(
  healthText: string | null | undefined,
  painRows: ReadonlyArray<{ area: string; createdAt: Date }>,
  now: Date = new Date(),
): Set<string> {
  const since = now.getTime() - PAIN_LOOKBACK_DAYS * 86_400_000;
  return reportedJoints(healthText, painRows.filter((p) => p.createdAt.getTime() >= since).map((p) => p.area));
}

export async function loadBlockedJoints(clientId: number, healthText: string | null | undefined, now: Date = new Date()): Promise<Set<string>> {
  const since = new Date(now.getTime() - PAIN_LOOKBACK_DAYS * 86_400_000);
  const rows = await db
    .select({ area: painReportsTable.area, createdAt: painReportsTable.createdAt })
    .from(painReportsTable)
    .where(and(eq(painReportsTable.clientId, clientId), gte(painReportsTable.createdAt, since)));
  return blockedJointsFrom(healthText, rows, now);
}

export function hitsBlockedJoint(areas: readonly string[] | null | undefined, blocked: ReadonlySet<string>): boolean {
  return blocked.size > 0 && (areas ?? []).some((a) => blocked.has(a));
}
