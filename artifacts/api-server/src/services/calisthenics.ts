/**
 * Kalistenika — a TRAINING STYLE, not a goal (docs/KALISTENIKA.md). OFF by default: CALISTHENICS_ENABLED=1 turns it on; without the flag the
 * generator ignores the style entirely and behaves exactly as before.
 *
 * The style only (1) narrows the pool to body weight, pull-up bar, parallel bars, gymnastic rings and resistance bands, (2) lays the week out by
 * stations (bar / parallel bars and push-ups / legs and core), (3) prefers the calisthenics ladder step of the client's level (never above it) and
 * (4) puts a 2-jump block at the start of the leg day. Every other generator filter (joints, pain, level, place, hidden, exclusions, health
 * consent, beginner rules) still runs on the same pool afterwards. Pure logic, no database.
 */
import { plyoRule, SPORT_GOAL, levelRank, type PlyoRule } from "./plyoBlock";
import { normalizeEquipmentList, expandEquipmentForLocation } from "./equipmentNormalizer";
import { LADDER_RANK, type LadderRow } from "./ladderSelection";

export const CALISTHENICS_STYLE = "calisthenics" as const;
export const CALISTHENICS_MAX_EXERCISES = 5;
export const calisthenicsEnabled = (env: NodeJS.ProcessEnv = process.env) => env.CALISTHENICS_ENABLED === "1";

/** True only when the flag is on AND the request asked for the style. */
export const calisthenicsActive = (style: string | null | undefined, env: NodeJS.ProcessEnv = process.env) =>
  calisthenicsEnabled(env) && style === CALISTHENICS_STYLE;

// ─── Equipment ────────────────────────────────────────────────────────────────

const BODYWEIGHT = ["Masa własnego ciała", "Brak sprzętu"];
// "Ławeczka treningowa" = a bench, a chair or a park bench (owner's decision 54.2, 28.10.2026): at home and outdoors it always counts as available.
const ALLOWED_EQUIPMENT = new Set<string>([...BODYWEIGHT, "Drążek do podciągania", "Poręcze", "Kółka gimnastyczne", "Gumy oporowe", "Ławeczka treningowa"]);
const BENCH = "Ławeczka treningowa";

/** Equipment text the compatibility filter should see in this style: at home and in the outdoor gym a bench / chair / park bench is added. */
export function calisthenicsEquipmentText(location: string | null | undefined, equipmentText: string | null | undefined): string | null {
  const loc = (location ?? "").trim().toLowerCase();
  if (loc !== "dom" && loc !== "siłownia plenerowa") return equipmentText ?? null;
  const have = normalizeEquipmentList(equipmentText);
  return have.includes(BENCH) ? (equipmentText ?? null) : [...have.filter((e) => !BODYWEIGHT.includes(e)), BENCH].join(", ");
}

/**
 * Can the exercise be done with body weight / bar / parallel bars / rings / bands only? Mirrors the catalogue's "any of" equipment model:
 * an exercise listing body weight among its options (e.g. "Wykrok w tył": dumbbells, barbell or body weight) is done with body weight;
 * otherwise EVERY listed implement must be on the list. Anything required in addition (requiredEquipmentAll) must be on the list too.
 */
export function isCalisthenicsExercise(ex: { equipment?: readonly string[] | null; requiredEquipmentAll?: readonly string[] | null }): boolean {
  const equipment = normalizeEquipmentList((ex.equipment ?? []).join(","));
  const required = normalizeEquipmentList((ex.requiredEquipmentAll ?? []).join(","));
  if (!required.every((e) => ALLOWED_EQUIPMENT.has(e))) return false;
  if (equipment.length === 0) return true;
  if (equipment.some((e) => BODYWEIGHT.includes(e))) return true;
  return equipment.every((e) => ALLOWED_EQUIPMENT.has(e));
}

/** Beginner safety of the style: "Brak aktywności" and "Początkujący" get verified, trainer-approved exercises only. */
export function calisthenicsLevelAllows(
  ex: { verificationStatus?: string | null; reviewedByTrainer?: boolean | null },
  effectiveLevel: string | null | undefined,
): boolean {
  if (levelRank(effectiveLevel) > 1) return true;
  return ex.verificationStatus === "zweryfikowane" && ex.reviewedByTrainer !== false;
}

// ─── Stations and days ────────────────────────────────────────────────────────

export interface Stations { bar: boolean; parallelBars: boolean; rings: boolean; bands: boolean }

export function stationsFor(location: string | null | undefined, equipmentText: string | null | undefined): Stations {
  const have = new Set(expandEquipmentForLocation(normalizeEquipmentList(equipmentText), location));
  return {
    bar: have.has("Drążek do podciągania"), parallelBars: have.has("Poręcze"),
    rings: have.has("Kółka gimnastyczne"), bands: have.has("Gumy oporowe"),
  };
}

export type CalisthenicsDayType = "pull" | "push" | "legs" | "upper" | "full_body";
export interface CalisthenicsDay { dayIndex: number; dayName: string; dayType: CalisthenicsDayType }

const NAMES: Record<CalisthenicsDayType, string> = {
  pull: "Drążek", push: "Poręcze i pompki", legs: "Nogi i core", upper: "Góra ciała", full_body: "Całe ciało",
};
const TEMPLATES: Record<number, CalisthenicsDayType[]> = {
  1: ["full_body"],
  2: ["upper", "legs"],
  3: ["pull", "push", "legs"],
  4: ["pull", "push", "legs", "upper"],
  5: ["pull", "push", "legs", "upper", "full_body"],
};
export const NO_PULL_STATION_NOTE = "Kalistenika wymaga drążka, kółek lub gumy do dni przyciągania — ten dzień zastąpiono dniem pchania.";

/** Days of the week by station. 2–5 days (other numbers are clamped); without any pulling station a pull day becomes a push day, with a warning. */
export function calisthenicsDays(trainingDays: number, stations: Stations): { days: CalisthenicsDay[]; warnings: string[] } {
  const n = Math.min(5, Math.max(1, Math.round(trainingDays) || 1));
  const warnings: string[] = [];
  const canPull = stations.bar || stations.rings || stations.bands;
  const types = TEMPLATES[n]!.map((t) => {
    if (t === "pull" && !canPull) { if (!warnings.includes(NO_PULL_STATION_NOTE)) warnings.push(NO_PULL_STATION_NOTE); return "push" as const; }
    return t;
  });
  if (trainingDays > 5) warnings.push("Kalistenika: maksymalnie 5 dni w tygodniu — ułożono 5.");
  return { days: types.map((t, i) => ({ dayIndex: i, dayName: NAMES[t], dayType: t })), warnings };
}

// ─── Ladders (only exercises that already exist; missing steps are skipped) ──

type LadderLevel = keyof typeof LADDER_RANK;
const L = { BA: "Brak aktywności fizycznej", P: "Początkujący", S: "Średniozaawansowany", Z: "Zaawansowany" } as const satisfies Record<string, LadderLevel>;

export const CALISTHENICS_LADDERS: ReadonlyArray<{ pattern: string; steps: ReadonlyArray<readonly [name: string, level: LadderLevel]> }> = [
  { pattern: "Kalistenika: podciąganie", steps: [
    ["Zwis na drążku", L.P], ["Łopatkowe podciągnięcia w zwisie (scapular pull-up)", L.P], ["Negatywy podciągnięcia", L.S], ["Podciąganie z gumą wspomagającą", L.S],
    ["Podciąganie podchwytem (chin-up)", L.S], ["Podciąganie na drążku", L.Z], ["Podciąganie na drążku chwytem neutralnym", L.Z], ["Podciąganie łucznik (archer)", L.Z],
    ["Podciąganie z obciążeniem", L.Z], ["Muscle-up na drążku (bez wymachu)", L.Z],
  ] },
  { pattern: "Kalistenika: dipy", steps: [
    ["Dipy na ławce", L.P], ["Negatywy dipów", L.S], ["Dipy z gumą", L.S], ["Dipy na poręczach", L.S], ["Dipy na kółkach gimnastycznych", L.Z], ["Dipy z obciążeniem", L.Z],
  ] },
  { pattern: "Kalistenika: pompki", steps: [
    ["Pompki ścienne", L.BA], ["Pompki na podwyższeniu", L.P], ["Pompki na kolanach", L.P], ["Pompki klasyczne", L.P],
    ["Pompki z nogami na podwyższeniu", L.S], ["Pompki z gumą oporową", L.S], ["Pompki plus", L.S], ["Pompki z biodrami w górze (pike)", L.S], ["Pompki z wybiciem", L.S],
    ["Pompki łucznik (archer)", L.Z], ["Pompka jednorącz", L.Z], ["Pompki na kółkach gimnastycznych", L.Z], ["Pompki w staniu na rękach", L.Z],
  ] },
  { pattern: "Kalistenika: wiosłowanie", steps: [
    ["Wiosłowanie gumą oporową", L.BA], ["Wiosłowanie w zwisie pod sztangą (australijskie podciąganie)", L.P], ["Wiosłowanie australijskie — nogi proste", L.S],
    ["Wiosłowanie australijskie — nogi wyżej lub na kółkach", L.Z],
  ] },
  { pattern: "Kalistenika: brzuch w zwisie", steps: [
    ["Unoszenie kolan w zwisie", L.S], ["Unoszenie prostych nóg w zwisie", L.S], ["Składanie ciała w zwisie (hanging pike)", L.Z], ["Toes to bar", L.Z],
  ] },
  { pattern: "Kalistenika: nogi", steps: [
    ["Przysiad do skrzyni z masą własnego ciała", L.BA], ["Wejście na niskie podwyższenie z podparciem", L.BA], ["Przysiad z masą własnego ciała", L.P],
    ["Przysiad wykroczny z podparciem", L.P], ["Wykrok w tył", L.P], ["Przysiad kozacki", L.S], ["Przysiad bułgarski", L.Z], ["Pistol z podparciem", L.Z], ["Przysiad na jednej nodze (Pistol Squat)", L.Z],
  ] },
  { pattern: "Kalistenika: core", steps: [
    ["Dead bug", L.BA], ["Plank", L.P], ["Plank boczny", L.P], ["Hollow body hold", L.S], ["Scyzoryki (V-up)", L.S], ["L-sit na podłodze", L.Z],
  ] },
];

export const calisthenicsLadderNames = (): string[] => [...new Set(CALISTHENICS_LADDERS.flatMap((l) => l.steps.map(([n]) => n)))];

/** Ladder rows for the style; `idByName` comes from the catalogue, names that are not there are skipped (no invented exercises). */
export function calisthenicsLadderRows(idByName: ReadonlyMap<string, number>): LadderRow[] {
  return CALISTHENICS_LADDERS.flatMap((ladder) =>
    ladder.steps.flatMap(([name, level], i) => {
      const exerciseId = idByName.get(name);
      return exerciseId === undefined ? [] : [{ pattern: ladder.pattern, stepOrder: i + 1, level, exerciseId }];
    }),
  );
}

// ─── Jumps on the leg day ─────────────────────────────────────────────────────

const NO_PLYO: PlyoRule = { allowed: false, rank: 0, intensities: [], landing: false, count: 0 };
export const isCalisthenicsLegDay = (sessionType: string) => sessionType === "legs" || sessionType === "lower";

/**
 * Jump block of the calisthenics leg day: the lower of the effective level and the jump experience (no question outside the sport goal = "Nie"),
 * "Brak aktywności" none, "Początkujący" only the landing drill + low intensity, "wysoka" only for "Zaawansowany" with "Tak". Always 2 exercises.
 * Other days of the week have no jumps.
 */
export function calisthenicsPlyoRule(a: { sessionType: string; goal: string | null | undefined; effectiveLevel: string | null | undefined; jumpExperience: string | null | undefined }): PlyoRule {
  if (!isCalisthenicsLegDay(a.sessionType)) return NO_PLYO;
  const rule = plyoRule({ goal: SPORT_GOAL, effectiveLevel: a.effectiveLevel, jumpExperience: a.goal === SPORT_GOAL ? a.jumpExperience : null });
  return rule.allowed ? { ...rule, count: 2 } : NO_PLYO;
}

// ─── Day size ─────────────────────────────────────────────────────────────────

/** About 5 exercises per unit: drops the last non-core exercises first and keeps one closing core exercise (the jump block is added afterwards). */
export function capCalisthenicsDay<T extends { mainMuscleGroup?: string | null }>(exercises: readonly T[], max = CALISTHENICS_MAX_EXERCISES): T[] {
  if (exercises.length <= max) return [...exercises];
  const isCore = (e: T) => e.mainMuscleGroup === "Brzuch";
  const core = [...exercises].reverse().find(isCore);
  const rest = exercises.filter((e) => e !== core);
  const kept = rest.slice(0, core ? max - 1 : max);
  return core ? [...kept, core] : kept;
}
