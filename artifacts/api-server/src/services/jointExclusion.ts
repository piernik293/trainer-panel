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

/** Reported joints the exercise loads, in catalogue order (empty = no warning). */
export function reportedJointsLoaded(areas: readonly string[] | null | undefined, blocked: ReadonlySet<string>): string[] {
  return [...new Set((areas ?? []).filter((a) => blocked.has(a)))];
}

/** Trainer-facing warning text for a manual add; never shown to the client. */
export function jointWarningMessage(joints: readonly string[]): string {
  const list = joints.map((j) => j.toLowerCase()).join(", ");
  return `Klient zgłosił ból: ${list}. To ćwiczenie obciąża ${list}. Dodać mimo to?`;
}

/**
 * Without consent to process health data (declined or withdrawn) the generator uses the most cautious setting we can apply without
 * health answers: exercises with a HIGH joint load (joint_stress = "Wysokie") are left out and the trainer is told why.
 * NULL status (older interview, or entered by the trainer) keeps the previous behaviour.
 */
export const CONSERVATIVE_CONSENT_STATUSES: ReadonlySet<string> = new Set(["declined", "withdrawn"]);
export const isConservativeHealth = (status: string | null | undefined): boolean => status != null && CONSERVATIVE_CONSENT_STATUSES.has(status);
export const violatesConservative = (ex: { jointStress?: string | null }, conservative: boolean): boolean => conservative && ex.jointStress === "Wysokie";
export const CONSERVATIVE_NOTE = "Brak zgody na dane o zdrowiu — plan przygotowano z najostrożniejszymi ustawieniami (bez ćwiczeń o wysokim obciążeniu stawów). Zapytaj o zdrowie osobiście.";
