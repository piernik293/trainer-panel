/**
 * Progression ladders in the generator (docs/DRABINKI.md).
 *
 * Steps (rank): Brak aktywności fizycznej 0 → Początkujący 1 → Średniozaawansowany 2 → Zaawansowany 3.
 * For the client's EFFECTIVE level L:
 *  - a ladder exercise whose step is above L is never offered (never "up" — for everyone; replacements are only at the same step or lower);
 *  - the exercise on step L gets a score bonus (the generator picks the step of the client's level first);
 *  - exercises that are not on any ladder, and patterns whose step for L is empty, behave exactly as before (the usual pool and filters);
 *  - exercises with a warm-up role (e.g. wall push-ups) are allowed in the main plan only on a "Brak aktywności fizycznej" step,
 *    only for a client of that level and only when suitableForNoActivity === true.
 * Every other safety filter (joints, pain, difficulty, level, equipment, suitableForNoActivity) still runs after this on the same pool.
 * A trainer can always add any exercise by hand (the manual write paths do not use ladders).
 */
import { db, exerciseLadderStepsTable } from "@workspace/db";

export const LADDER_RANK: Record<string, number> = {
  "Brak aktywności fizycznej": 0, "Początkujący": 1, "Średniozaawansowany": 2, "Zaawansowany": 3,
};
export const LADDER_STEP_BONUS = 12;

export interface LadderRow { pattern: string; stepOrder: number; level: string; exerciseId: number }

export interface LadderRules {
  /** true = the exercise may be offered to this client */
  allowed(exerciseId: number): boolean;
  /** score bonus for the exercise on the client's own step */
  bonus(exerciseId: number): number;
  /** warm-up-role exercises that may enter the main plan for this client (BA steps, BA client) */
  warmupRoleAllowed: ReadonlySet<number>;
}

export function buildLadderRules(rows: readonly LadderRow[], clientLevel: string | null | undefined): LadderRules {
  const clientRank = clientLevel != null ? LADDER_RANK[clientLevel] : undefined;
  const ranks = new Map<number, number[]>();
  for (const r of rows) {
    const k = LADDER_RANK[r.level];
    if (k === undefined) continue;
    ranks.set(r.exerciseId, [...(ranks.get(r.exerciseId) ?? []), k]);
  }
  const warmup = new Set<number>();
  if (clientRank === 0) for (const [id, rs] of ranks) if (rs.includes(0)) warmup.add(id);
  return {
    // unknown client level → ladders are not applied (behaviour as before)
    allowed: (id) => clientRank === undefined || !ranks.has(id) || Math.min(...ranks.get(id)!) <= clientRank,
    bonus: (id) => (clientRank !== undefined && (ranks.get(id) ?? []).includes(clientRank) ? LADDER_STEP_BONUS : 0),
    warmupRoleAllowed: warmup,
  };
}

export async function loadLadderRows(): Promise<LadderRow[]> {
  return db.select({
    pattern: exerciseLadderStepsTable.pattern, stepOrder: exerciseLadderStepsTable.stepOrder,
    level: exerciseLadderStepsTable.level, exerciseId: exerciseLadderStepsTable.exerciseId,
  }).from(exerciseLadderStepsTable);
}
