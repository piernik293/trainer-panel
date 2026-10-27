/**
 * Solo — a person without a trainer (block 11). OFF by default: SOLO_ENABLED=1 turns the API on; otherwise every /api/solo route answers 404
 * and the app keeps showing "Wkrótce".
 *
 * Stricter rules than for a trainer's client (nobody checks the plan, so the generator may only use what is safe on its own):
 *  - only exercises VERIFIED by a trainer (reviewed_by_trainer = true) — at every level, not only for beginners;
 *  - plyometrics / Olympic lifts only when the person answered "Tak" about jump experience AND the effective level is Ś or Z;
 *  - a pain report on an exercise removes that exercise from later Solo plans (90 days) and the person is told
 *    "Skonsultuj się ze specjalistą" (the usual joint exclusion from the interview and from pain reports still applies);
 *  - NO weekly RPE check-in (that is a conversation with a trainer).
 * A Solo person is a `clients` row with `trainer_id` NULL (the column is nullable): every trainer query filters by `trainer_id = <trainer>`,
 * so Solo data is invisible to every trainer. The accounts block (`accounts`) will later hold the person's profile and the optional link to a trainer.
 */
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { db, painReportsTable } from "@workspace/db";

export const SOLO_PAIN_MESSAGE = "Skonsultuj się ze specjalistą.";
export const SOLO_PAIN_EXCLUSION_DAYS = 90;
/** Solo has no weekly RPE check-in (kept as a named constant so the check-in code and the tests refer to the same rule). */
export const SOLO_WEEKLY_CHECKIN = false;

export const soloEnabled = (env: NodeJS.ProcessEnv = process.env) => env.SOLO_ENABLED === "1";

const ADVANCED = ["Średniozaawansowany", "Zaawansowany"];

export interface SoloExercise { hidden?: boolean | null; reviewedByTrainer?: boolean | null; intensity?: string | null; role?: string | null; name?: string | null }
export interface SoloContext { effectiveLevel: string | null | undefined; jumpExperience: string | null | undefined; painExcludedIds: ReadonlySet<number> }

/** Names of Olympic lifts (they have no intensity tag in the catalogue). */
const OLYMPIC = /\b(podrzut|zarzut|rwanie|clean|snatch|jerk)\b/i;

export function isSoloPlyoOrOlympic(ex: SoloExercise): boolean {
  return !!ex.intensity || ex.role === "lądowanie" || OLYMPIC.test(ex.name ?? "");
}

/** Solo's extra filter on top of the normal generator filters. */
export function soloAllowsExercise(ex: SoloExercise & { id: number }, ctx: SoloContext): boolean {
  if (ex.hidden) return false;
  if (ex.reviewedByTrainer !== true) return false; // verified only — every level
  if (ctx.painExcludedIds.has(ex.id)) return false;
  if (isSoloPlyoOrOlympic(ex)) {
    const yes = /^tak/i.test((ctx.jumpExperience ?? "").trim());
    if (!yes || !ctx.effectiveLevel || !ADVANCED.includes(ctx.effectiveLevel)) return false;
  }
  return true;
}

/** A Solo person is a client without a trainer (clients.trainer_id IS NULL). */
export const isSoloClient = (client: { trainerId: number | null }): boolean => client.trainerId === null;

/** Exercises the person reported pain on during the last 90 days. */
export async function soloPainExcludedIds(clientId: number, now: Date = new Date()): Promise<Set<number>> {
  const since = new Date(now.getTime() - SOLO_PAIN_EXCLUSION_DAYS * 86_400_000);
  const rows = await db.select({ id: painReportsTable.exerciseId }).from(painReportsTable)
    .where(and(eq(painReportsTable.clientId, clientId), isNotNull(painReportsTable.exerciseId), gte(painReportsTable.createdAt, since)));
  return new Set(rows.map((r) => r.id!).filter((x): x is number => typeof x === "number"));
}
