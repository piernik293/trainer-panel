/**
 * Warm-up and cool-down chosen from the catalogue (role "rozgrzewka" / "rozciąganie"), pure functions.
 *
 * Warm-up: 1 general (march, or the exercise bike when the client has one) + 2–3 for the muscle groups of the day
 *          + 1 activation. Cool-down: 3–4 stretches for the day's muscle groups.
 * Safety (same rules as the generator):
 *  - "Brak aktywności fizycznej" and "Początkujący": only suitableForNoActivity = true and learning difficulty <= 2;
 *  - an exercise whose joint tag matches a joint the client reported pain in is never offered
 *    (interview text or a "Coś boli?" report during a workout);
 *  - exercises "do weryfikacji" are not offered to beginners (their suitableForNoActivity is not confirmed);
 *  - equipment the client does not have (bands, bike, roller) and a wrong training place are skipped; a roller counts as
 *    available when the client ticked it or trains at a gym;
 *  - hidden exercises are never offered; exercises not yet reviewed by the trainer only for intermediate / advanced.
 * Cool-down: up to 3–4 stretches for the day's groups; rolling (at most one roller exercise) only on 1–2 days a week (rollerDayIndexes); one calm
 * breathing exercise at the end ONLY when the client switched that on (default off).
 */
import { PAIN_AREAS } from "@workspace/db";

export interface CatalogueWarmupItem {
  id: number;
  name: string;
  role: string | null;
  mainMuscleGroup: string;
  secondaryMuscleGroups: string[];
  movementPattern: string | null;
  learningDifficulty: number | null;
  suitableForNoActivity: boolean | null;
  verificationStatus: string | null;
  jointStressAreas: string[] | null;
  equipment: string[];
  equipmentDetail: string[] | null;
  trainingLocation: string[];
  defaultReps: number | null;
  defaultDurationSeconds: number | null;
  perSide: boolean | null;
  executionInstructions: string | null;
  /** Variants / review status (migration 0028); absent in fixtures = visible and reviewed. */
  hidden?: boolean | null;
  reviewedByTrainer?: boolean | null;
}

export interface SelectionContext {
  /** muscle groups of the day's exercises */
  dayGroups: string[];
  /** effective level of the plan */
  level: string | null | undefined;
  /** joints the client reported pain in (values of PAIN_AREAS) */
  painAreas: ReadonlySet<string>;
  trainingLocation?: string | null;
  /** the survey's free-text equipment list */
  equipmentText?: string | null;
  /** client setting "Kończ schłodzenie minutą spokojnego oddechu" — default OFF: the generator never adds breathing on its own */
  breathing?: boolean;
  /** this plan day may carry rolling (1–2 days a week, see rollerDayIndexes) — default NO */
  rollerAllowed?: boolean;
}

/**
 * Rolling goes into the cool-down on at most two days of the week (owner's decision 25.10.2026): the first training day and the
 * one in the middle. Deterministic from the plan layout, so it needs no memory of past sessions. `dayIndex` is 0-based.
 */
export function rollerDayIndexes(totalDays: number): number[] {
  if (totalDays <= 1) return [0];
  return [0, Math.floor(totalDays / 2)];
}
export const isRollerDay = (dayIndex: number, totalDays: number) => rollerDayIndexes(totalDays).includes(dayIndex);

const GENERAL_MARCH = "Marsz w miejscu";
const GENERAL_BIKE = "Rowerek stacjonarny (lekki)";

// ─── Joints from free text and pain reports ───────────────────────────────────

const JOINT_PATTERNS: [RegExp, string][] = [
  [/kolan|kolano|rzepk|więzadł/i, "Kolano"],
  [/bark|ramię|ramion|ramien|rotator/i, "Bark"],
  [/nadgarst|dłoń|dłoni/i, "Nadgarstek"],
  [/lędźw|krzyż|dolny odcinek|odcinek.*(lędźwiow|krzyżow)|ból pleców|kręgosłup|plecy dół|dół pleców/i, "Plecy — dół"],
  [/biodr|bioder|staw biodrowy/i, "Biodro"], // biodr- covers every case form: biodro, biodra, biodrem, w biodrze, biodrach
  [/łokc|łokieć|tenisist|golfist/i, "Łokieć"],
];

/** Joints mentioned in the interview's health description. */
export function jointsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  return JOINT_PATTERNS.filter(([re]) => re.test(text)).map(([, joint]) => joint);
}

/** Joints from the interview text plus the areas of pain reports (only known joint values count). */
export function reportedJoints(healthText: string | null | undefined, painReportAreas: readonly string[]): Set<string> {
  const known = new Set<string>(PAIN_AREAS.filter((a) => a !== "Inne"));
  return new Set([...jointsFromText(healthText), ...painReportAreas.filter((a) => known.has(a))]);
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

const isBeginnerLevel = (level: string | null | undefined) => level === "Brak aktywności fizycznej" || level === "Początkujący";

const isAdvancedLevel = (level: string | null | undefined) => level === "Średniozaawansowany" || level === "Zaawansowany";

function eligible(it: CatalogueWarmupItem, ctx: SelectionContext): boolean {
  if (it.hidden) return false;
  if (it.reviewedByTrainer === false && !isAdvancedLevel(ctx.level)) return false;
  if (isBeginnerLevel(ctx.level)) {
    if (it.suitableForNoActivity !== true) return false;
    if (it.learningDifficulty == null || it.learningDifficulty > 2) return false;
    if (it.verificationStatus === "do_weryfikacji") return false;
  }
  if ((it.jointStressAreas ?? []).some((j) => ctx.painAreas.has(j))) return false;
  if (ctx.trainingLocation && it.trainingLocation.length > 0 && !it.trainingLocation.includes(ctx.trainingLocation)) return false;
  const eq = (ctx.equipmentText ?? "").toLowerCase();
  const needsBands = it.equipment.includes("Gumy oporowe");
  const needsBike = (it.equipmentDetail ?? []).some((d) => /rower/i.test(d));
  if (needsBands && !/gum/.test(eq)) return false;
  if (needsBike && !/rower|orbitrek/.test(eq)) return false;
  // Roller only when the client has one or trains at a gym (the gym has rollers); the day limit is applied in selectCooldown.
  const atGym = (ctx.trainingLocation ?? "").trim().toLowerCase() === "siłownia";
  if (it.equipment.includes("Roller") && !atGym && !/roller|wałek/.test(eq)) return false;
  return true;
}

const groupsOf = (it: CatalogueWarmupItem) => [it.mainMuscleGroup, ...it.secondaryMuscleGroups];
const overlap = (it: CatalogueWarmupItem, day: readonly string[]) => groupsOf(it).filter((g) => day.includes(g)).length;
const byRelevance = (day: readonly string[]) => (a: CatalogueWarmupItem, b: CatalogueWarmupItem) =>
  overlap(b, day) - overlap(a, day) || a.id - b.id;

// ─── Selection ────────────────────────────────────────────────────────────────

export function selectWarmup(catalogue: readonly CatalogueWarmupItem[], ctx: SelectionContext): CatalogueWarmupItem[] {
  const pool = catalogue.filter((i) => i.role === "rozgrzewka" && eligible(i, ctx));
  const chosen: CatalogueWarmupItem[] = [];
  const add = (i: CatalogueWarmupItem | undefined) => { if (i && !chosen.includes(i)) chosen.push(i); };

  // 1 general: the bike when the client has one, otherwise the march.
  add(pool.find((i) => i.name === GENERAL_BIKE) ?? pool.find((i) => i.name === GENERAL_MARCH));
  const isGeneral = (i: CatalogueWarmupItem) => i.name === GENERAL_BIKE || i.name === GENERAL_MARCH;

  // 1 activation (for the day's groups, else any).
  const activations = pool.filter((i) => i.movementPattern === "Aktywacja" && !isGeneral(i)).sort(byRelevance(ctx.dayGroups));
  const activation = activations.find((i) => overlap(i, ctx.dayGroups) > 0) ?? activations[0];

  // 2–3 for the day's muscle groups (relevant only), without the activation.
  const forDay = pool
    .filter((i) => !isGeneral(i) && i !== activation && i.movementPattern !== "Aktywacja" && overlap(i, ctx.dayGroups) > 0)
    .sort(byRelevance(ctx.dayGroups));
  forDay.slice(0, 3).forEach(add);
  // Not enough relevant ones: fill up to 2 with the remaining simple mobilisation.
  if (chosen.length < 3) {
    pool.filter((i) => !isGeneral(i) && i !== activation && i.movementPattern === "Mobilizacja" && !chosen.includes(i))
      .sort((a, b) => a.id - b.id)
      .slice(0, 3 - chosen.length)
      .forEach(add);
  }
  add(activation);
  return chosen;
}

const BREATHING = "Oddychanie";
const isRoller = (i: CatalogueWarmupItem) => i.equipment.includes("Roller");

export function selectCooldown(catalogue: readonly CatalogueWarmupItem[], ctx: SelectionContext): CatalogueWarmupItem[] {
  const all = catalogue.filter((i) => i.role === "rozciąganie" && eligible(i, ctx) && (ctx.rollerAllowed === true || !isRoller(i))).sort(byRelevance(ctx.dayGroups));
  const breathing = all.filter((i) => i.movementPattern === BREATHING).sort((a, b) => a.id - b.id);
  const pool = all.filter((i) => i.movementPattern !== BREATHING);
  // Only when the client switched it on; rotated with the day's groups so consecutive days differ; none when there is no eligible one.
  const calm = ctx.breathing === true && breathing.length ? breathing[ctx.dayGroups.join("|").length % breathing.length] : undefined;
  const limit = calm ? 3 : 4;
  let rollers = 0;
  const take = (list: CatalogueWarmupItem[], n: number) => {
    const out: CatalogueWarmupItem[] = [];
    for (const i of list) {
      if (out.length >= n) break;
      if (isRoller(i)) { if (rollers >= 1) continue; rollers++; }
      out.push(i);
    }
    return out;
  };
  const relevant = take(pool.filter((i) => overlap(i, ctx.dayGroups) > 0), limit);
  const minimum = Math.min(3, limit);
  const chosen = relevant.length >= minimum ? relevant : [...relevant, ...take(pool.filter((i) => !relevant.includes(i)), minimum - relevant.length)];
  return calm ? [...chosen, calm] : chosen;
}

// ─── Display ──────────────────────────────────────────────────────────────────

/** "10 × na stronę", "20 s", "30 s na stronę", "ok. 4 min" — information only, no timer. */
export function formatAmount(it: Pick<CatalogueWarmupItem, "defaultReps" | "defaultDurationSeconds" | "perSide">): string {
  const side = it.perSide ? " na stronę" : "";
  if (it.defaultDurationSeconds != null) {
    const s = it.defaultDurationSeconds;
    return s >= 180 ? `ok. ${Math.round(s / 60)} min${side}` : `${s} s${side}`;
  }
  if (it.defaultReps != null) return `${it.defaultReps} ×${side}`;
  return "";
}

/** Rough minutes: 4 s per repetition, both sides when per side, 10 s to switch between exercises. */
export function estimateMinutes(items: readonly Pick<CatalogueWarmupItem, "defaultReps" | "defaultDurationSeconds" | "perSide">[]): number {
  const seconds = items.reduce((sum, it) => {
    const base = it.defaultDurationSeconds ?? (it.defaultReps ?? 10) * 4;
    return sum + base * (it.perSide ? 2 : 1) + 10;
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}
