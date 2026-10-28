/**
 * Plyometric block (owner's decision 25.10.2026, blok 5): 2–4 exercises right after the warm-up, part of the resistance workout.
 *
 * Goals (exact names from the database):
 *  - "Cel sportowy": the block follows the LOWER of the effective level and the jump experience from the interview:
 *        rank 1 (Początkujący, or "Nie")      → "Nauka lądowania" + intensity "niska";
 *        rank 2 (Średniozaawansowany, "Trochę") → "niska" and "średnia";
 *        rank 3 (Zaawansowany, "Tak")          → also "wysoka".
 *    Początkujący never goes above rank 1, even with "Tak". No answer counts as "Nie".
 *  - "Poprawa kondycji", "Poprawa sprawności": only intensity "niska", from Średniozaawansowany;
 *  - every other goal: no block (the trainer may add jumps by hand).
 *  - "Brak aktywności fizycznej": never.
 * An exercise is also never above the client's level (its own difficulty), and goes through the same visibility / review rules
 * as the rest of the generator (hidden never; not reviewed by the trainer only for Ś/Z).
 */
import { jumpExperienceCode } from "@workspace/survey-config";
import { isGeneratorSafe } from "../lib/exerciseRoles";

export const LANDING_ROLE = "przygotowanie do skoków";
export const SPORT_GOAL = "Cel sportowy";
export const LIGHT_PLYO_GOALS = ["Poprawa kondycji", "Poprawa sprawności"] as const;
/** Equipment of the boxing-bag / sledgehammer exercises — they carry an intensity but are not jumps. */
const NOT_PLYO_EQUIPMENT = ["Worek bokserski", "Młot i opona"];

export type PlyoIntensity = "niska" | "średnia" | "wysoka";
export interface PlyoRule { allowed: boolean; rank: 0 | 1 | 2 | 3; intensities: PlyoIntensity[]; landing: boolean; count: number }

const NONE: PlyoRule = { allowed: false, rank: 0, intensities: [], landing: false, count: 0 };

const LEVEL_RANK: Record<string, number> = {
  "Brak aktywności fizycznej": 0, "Początkujący": 1, "Średniozaawansowany": 2, "Zaawansowany": 3,
};
export const levelRank = (level: string | null | undefined) => (level ? LEVEL_RANK[level] ?? 0 : 0);

export function plyoRule(opts: { goal: string | null | undefined; effectiveLevel: string | null | undefined; jumpExperience?: string | null }): PlyoRule {
  const lvl = levelRank(opts.effectiveLevel);
  if (lvl < 1) return NONE;
  if (opts.goal && (LIGHT_PLYO_GOALS as readonly string[]).includes(opts.goal)) {
    return lvl >= 2 ? { allowed: true, rank: 1, intensities: ["niska"], landing: false, count: 2 } : NONE;
  }
  if (opts.goal !== SPORT_GOAL) return NONE;
  const exp = jumpExperienceCode(opts.jumpExperience) === "tak" ? 3 : jumpExperienceCode(opts.jumpExperience) === "troche" ? 2 : 1;
  const rank = Math.min(lvl, exp) as 1 | 2 | 3;
  if (rank === 1) return { allowed: true, rank, intensities: ["niska"], landing: true, count: 2 };
  if (rank === 2) return { allowed: true, rank, intensities: ["niska", "średnia"], landing: false, count: 3 };
  return { allowed: true, rank, intensities: ["niska", "średnia", "wysoka"], landing: false, count: 4 };
}

export interface PlyoCandidate {
  id: number;
  name: string;
  role?: string | null;
  intensity?: string | null;
  equipment?: string[] | null;
  difficultyLevel?: string | null;
  movementPattern?: string | null;
  hidden?: boolean | null;
  reviewedByTrainer?: boolean | null;
}

/** A jump / plyometric exercise: the landing drill, or anything with an intensity that is not running drills or bag / hammer work. */
export function isPlyoExercise(ex: Pick<PlyoCandidate, "role" | "intensity" | "equipment">): boolean {
  if (ex.role === LANDING_ROLE) return true;
  if (!ex.intensity) return false;
  if (ex.role === "technika biegu") return false;
  return !(ex.equipment ?? []).some((e) => NOT_PLYO_EQUIPMENT.includes(e));
}


/**
 * Picks the block from candidates that already passed the equipment / place / joint / completeness filters.
 * `rotate` (alternative session index) shifts the starting point so another day gets other jumps.
 * Returns fewer than `count` when the pool is thin — it is never padded with anything else.
 */
export function selectPlyoBlock<T extends PlyoCandidate>(
  candidates: readonly T[], rule: PlyoRule, effectiveLevel: string | null | undefined, rotate = 0,
): T[] {
  if (!rule.allowed) return [];
  const lvl = levelRank(effectiveLevel);
  const ok = candidates.filter((ex) => {
    if (!isPlyoExercise(ex)) return false;
    if (!isGeneratorSafe({ hidden: ex.hidden, reviewedByTrainer: ex.reviewedByTrainer, difficultyLevel: ex.difficultyLevel }, effectiveLevel)) return false;
    if (levelRank(ex.difficultyLevel) > lvl || !ex.difficultyLevel) return false; // never above the client's level
    if (ex.role === LANDING_ROLE) return rule.landing;
    return !!ex.intensity && (rule.intensities as string[]).includes(ex.intensity);
  });
  const landing = ok.filter((e) => e.role === LANDING_ROLE).sort((a, b) => a.id - b.id);
  const jumps = ok.filter((e) => e.role !== LANDING_ROLE).sort((a, b) => a.id - b.id);
  // Mix the allowed intensities, starting from the most demanding one: [wysoka, średnia, niska, wysoka, …]; within one
  // intensity the list is rotated by `rotate`, so another day gets other jumps.
  const buckets = (["wysoka", "średnia", "niska"] as const)
    .map((i) => jumps.filter((e) => e.intensity === i))
    .filter((l) => l.length > 0)
    .map((l) => { const k = ((rotate % l.length) + l.length) % l.length; return [...l.slice(k), ...l.slice(0, k)]; });
  const mixed: T[] = [];
  for (let i = 0; buckets.some((l) => i < l.length); i++) for (const l of buckets) if (i < l.length) mixed.push(l[i]!);
  const picked: T[] = landing.slice(0, 1);
  const patterns = new Set<string>(picked.map((e) => e.movementPattern ?? ""));
  for (const ex of mixed) {
    if (picked.length >= rule.count) break;
    const p = ex.movementPattern ?? "";
    // variety of movement first: skip a repeated pattern while a different one is still available
    if (patterns.has(p) && mixed.some((o) => !picked.includes(o) && !patterns.has(o.movementPattern ?? ""))) continue;
    patterns.add(p); picked.push(ex);
  }
  for (const ex of mixed) { if (picked.length >= rule.count) break; if (!picked.includes(ex)) picked.push(ex); }
  return picked;
}
