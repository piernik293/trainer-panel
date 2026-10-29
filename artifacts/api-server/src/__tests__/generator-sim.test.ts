/**
 * Generator simulation (blok 1, noc 28.10.2026): random but realistic interviews → full weeks through the same route the plan wizard calls
 * (POST generate-day, day types from getDayTemplate), then an INDEPENDENT oracle checks every exercise against the catalogue rows in the database.
 * Safety and feasibility violations must be 0. Quality numbers (balance, volume, time, variety) go to the report.
 *
 *   scripts/generator-sim.sh            → 1000 profiles, report in docs/generator-sim-report.json (manual)
 *   normal test run (CI)                → SIM_N=24 profiles, same checks
 * Env: SIM_N, SIM_SEED, SIM_REPORT (path), SIM_STYLE (reserved for the calisthenics style).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: "gensim_trainer" }),
  clerkClient: { users: { getUser: async () => ({ primaryEmailAddress: { emailAddress: "maksymilian616@gmail.com" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import {
  db, pool, trainersTable, clientsTable, surveysTable, exercisesTable, painReportsTable, workoutSessionsTable,
  workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, volumeGuidelineVersionsTable,
} from "@workspace/db";
import { resolveEffectiveLevel } from "@workspace/survey-config";
import { lacksJointData } from "../services/jointData";
import { normalizeEquipmentList } from "../services/equipmentNormalizer";
import { calisthenicsDays, stationsFor, isCalisthenicsExercise, isCalisthenicsLegDay } from "../services/calisthenics";
import { selectWarmup, selectCooldown, type CatalogueWarmupItem } from "../services/warmupSelection";
import { WARMUP_ROLES } from "../lib/exerciseRoles";
import { getDayTemplate, recommendSplitType } from "../services/planDraftVolumeDistributionService";

const STYLE = process.env.SIM_STYLE ?? ""; // "" = standard, "calisthenics" = docs/KALISTENIKA.md (forces the flag on for this run)
if (STYLE === "calisthenics") process.env.CALISTHENICS_ENABLED = "1";
const N = Number(process.env.SIM_N ?? 24);
const SEED = Number(process.env.SIM_SEED ?? 20261028);
const REPORT = process.env.SIM_REPORT ?? "";
const DUMP = process.env.SIM_DUMP ?? ""; // optional: per-day results of the first generation (profile, type, status, exercise ids, warm-up, cool-down) for the catalogue and graphics lists

// ── seeded PRNG ──────────────────────────────────────────────────────────────
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rnd = mulberry32(SEED);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const chance = (p: number) => rnd() < p;
function weighted<T>(xs: ReadonlyArray<readonly [T, number]>): T {
  const total = xs.reduce((s, [, w]) => s + w, 0); let r = rnd() * total;
  for (const [x, w] of xs) { if ((r -= w) <= 0) return x; }
  return xs[xs.length - 1]![0];
}

// ── profile ──────────────────────────────────────────────────────────────────
const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"] as const;
const GOALS = ["Budowa sylwetki", "Zwiększenie siły", "Redukcja tkanki tłuszczowej", "Poprawa kondycji", "Poprawa sprawności", "Cel sportowy"] as const;
const JUMP = ["Nie — dopiero zaczynam", "Trochę — robiłem/am okazjonalnie", "Tak — robię regularnie"] as const;
const JOINT_TEXT: Record<string, string> = {
  Kolano: "boli mnie kolano", Biodro: "problem z biodrem", "Plecy — dół": "ból w odcinku lędźwiowym",
  Bark: "ból barku", Łokieć: "łokieć tenisisty", Nadgarstek: "ból nadgarstka",
};
const JOINTS = Object.keys(JOINT_TEXT);
const SESSION_OPTION = (min: number) => (min <= 45 ? "30–45 min" : min <= 60 ? "45–60 min" : min <= 90 ? "60–90 min" : "90+ min");
const PLACES = [
  { key: "gym", location: "Siłownia", equipment: null as string | null, allowed: null as string[] | null, exLoc: "Siłownia" },
  { key: "home0", location: "Dom", equipment: "Brak sprzętu", allowed: [] as string[], exLoc: "Dom" },
  { key: "homeBand", location: "Dom", equipment: "Gumy oporowe", allowed: ["Gumy oporowe"], exLoc: "Dom" },
  { key: "homeDb", location: "Dom", equipment: "Hantle", allowed: ["Hantle"], exLoc: "Dom" },
  { key: "homeBar", location: "Dom", equipment: "Drążek do podciągania, Gumy oporowe", allowed: ["Drążek do podciągania", "Gumy oporowe"], exLoc: "Dom" },
  { key: "outdoor", location: "Siłownia plenerowa", equipment: "Drążek do podciągania, Uchwyty do pompek", allowed: ["Drążek do podciągania", "Uchwyty do pompek", "Gumy oporowe"], exLoc: "Plener" },
] as const;

interface Profile {
  id: number; level: string; effective: string; goal: string; place: (typeof PLACES)[number]["key"]; days: number; minutes: number;
  joints: string[]; viaPain: boolean; avoidIds: number[]; jump: string | null; consent: string | null; trainingDuration: string;
}

// ── catalogue snapshot (the oracle reads rows, never the generator's response) ─
type Ex = typeof exercisesTable.$inferSelect;
const cat = new Map<number, Ex>();
let warmCatalogue: CatalogueWarmupItem[] = [];
const rank = (l: string | null | undefined) => (l ? (LEVELS as readonly string[]).indexOf(l) : -1);

const PUSH = (p: string | null) => !!p && p.startsWith("Pchanie");
const PULL = (p: string | null) => !!p && p.startsWith("Przyciąganie");
const KNEE = (p: string | null) => p === "Przysiad" || p === "Wykrok" || p === "Wyprost kolana";
const HIP = (p: string | null) => p === "Zawias biodrowy";

let ctx = "";
const styleViolations: Violation[] = [];
const jointGap = { reportedJoint: 0, noConsent: 0, noReports: 0, total: 0 }; // exercises placed in plans that lack joint-load data, by kind of client
interface Violation { rule: string; profile: number; level: string; goal: string; place: string; exercise: string; id: number; detail?: string }

function plyoAllowed(ex: Ex, p0: Profile): boolean {
  let p = p0;
  if (STYLE === "calisthenics") {
    // docs/KALISTENIKA.md: jumps only on the leg day, whatever the goal; the lower of level and experience (no question outside the sport goal = "Nie")
    const legDay = /dzień (legs|lower)/.test(ctx);
    if (!legDay) { const plyo = !!ex.intensity && ex.role !== "technika biegu" || ex.role === "przygotowanie do skoków"; if (plyo) return false; }
    p = { ...p0, goal: "Cel sportowy", jump: p0.goal === "Cel sportowy" ? p0.jump : null };
  }
  const isLanding = ex.role === "przygotowanie do skoków";
  const isPlyo = isLanding || (!!ex.intensity && ex.role !== "technika biegu" && !(ex.equipment ?? []).some((e) => e === "Worek bokserski" || e === "Młot i opona"));
  if (!isPlyo) return true;
  const lvl = rank(p.effective);
  if (lvl < 1) return false;
  if (p.goal === "Poprawa kondycji" || p.goal === "Poprawa sprawności") return lvl >= 2 && !isLanding && ex.intensity === "niska";
  if (p.goal !== "Cel sportowy") return false;
  const exp = p.jump === JUMP[2] ? 3 : p.jump === JUMP[1] ? 2 : 1;
  const r = Math.min(lvl, exp);
  const allowed = r === 1 ? ["niska"] : r === 2 ? ["niska", "średnia"] : ["niska", "średnia", "wysoka"];
  if (isLanding) return true;
  return allowed.includes(ex.intensity ?? "");
}

function checkExercise(ex: Ex, p: Profile, out: Violation[], feas: Violation[]) {
  const v = (rule: string, detail?: string): Violation => ({ rule, profile: p.id, level: p.effective, goal: p.goal, place: p.place, exercise: ex.name, id: ex.id, detail: `${detail ?? ""} [${ctx}]` });
  const lvl = rank(p.effective);
  if (ex.hidden) out.push(v("ukryte"));
  if (p.joints.length && (ex.jointStressAreas ?? []).some((j) => p.joints.includes(j))) out.push(v("zgłoszony staw", `${(ex.jointStressAreas ?? []).join(",")} | zgłoszono: ${p.joints.join(",")} (${p.viaPain ? "ból" : "wywiad"}) | zgoda: ${p.consent}`));
  if (ex.difficultyLevel && rank(ex.difficultyLevel) > Math.max(lvl, 1)) out.push(v("ponad poziom", `${ex.difficultyLevel} dla ${p.effective}`));
  if (lvl === 0 && ex.suitableForNoActivity !== true) out.push(v("BA bez suitableForNoActivity"));
  if (lvl <= 1 && (ex.learningDifficulty == null)) out.push(v("BA/P bez learningDifficulty"));
  if (lvl <= 1 && ex.reviewedByTrainer === false) out.push(v("BA/P niezatwierdzone przez trenera"));
  // Decision 3c (owner, 28.10.2026): missing joint-load data is a violation, so the hole stays visible (every client, not only those with a reported joint)
  if (lacksJointData(ex)) { jointGap.total++; if (p.joints.length) jointGap.reportedJoint++; else if (p.consent === "declined") jointGap.noConsent++; else jointGap.noReports++; }
  if (lacksJointData(ex)) out.push(v("brak danych o stawach", `poziom: ${ex.jointStress ?? "brak"}, stawy: ${ex.jointStressAreas == null ? "brak" : `[${ex.jointStressAreas.join(",")}]`}; klient: ${p.joints.length ? "zgłoszony staw" : p.consent === "declined" ? "bez zgody" : "bez zgłoszeń"}`));
  if (!plyoAllowed(ex, p)) out.push(v("pliometria wbrew zasadom", `${ex.intensity ?? ex.role}`));
  if (p.avoidIds.includes(ex.id)) out.push(v("wykluczone ćwiczenie"));
  if (p.consent === "declined" && ex.jointStress === "Wysokie") out.push(v("brak zgody zdrowotnej a wysokie obciążenie stawów"));
  if (STYLE === "calisthenics") {
    const inBlock = ctx.includes("blok");
    if (!isCalisthenicsExercise(ex)) out.push(v("kalistenika: sprzęt spoza listy", (ex.equipment ?? []).join("/")));
    if (lvl <= 1 && (ex.verificationStatus !== "zweryfikowane" || ex.reviewedByTrainer === false)) out.push(v("kalistenika: BA/P niezweryfikowane"));
    // P: only the lower rungs (bench dips, australian rows, hang, scapular pull-ups are P rungs approved by the owner 28.10.2026); the upper rungs never
    if (lvl === 1 && /^Podciąganie(?! kolan)|^Dipy na poręczach|^Dipy na kółkach|^Dipy z |Muscle-up|jednorącz|Pistol|w staniu na rękach|łucznik|^Negatywy|Toes to bar|Unoszenie (kolan|prostych nóg) w zwisie|hanging pike|nogi proste|nogi wyżej/i.test(ex.name)) out.push(v("kalistenika: P górny szczebel", ex.name));
    // BA: nothing on the bar or the parallel bars, no hanging
    if (lvl === 0 && /zwis|podciąg|dipy|negatywy|muscle-up|toes to bar|australijsk/i.test(ex.name)) out.push(v("kalistenika: BA zwis/drążek/poręcze", ex.name));
    if (lvl === 0 && /zwis|podciąg|dipy/i.test(ex.name)) out.push(v("kalistenika: BA zwis/podciąganie/dipy", ex.name));
    void inBlock;
  }
  // feasibility
  const place = PLACES.find((x) => x.key === p.place)!;
  if (place.allowed) {
    const have = new Set<string>([...place.allowed, "Masa własnego ciała", "Brak sprzętu", ...(STYLE === "calisthenics" ? ["Ławeczka treningowa"] : [])]); // decision 54.2: bench / chair counts at home and outdoors in the calisthenics style
    const eq = normalizeEquipmentList((ex.equipment ?? []).join(","));
    const okAny = eq.length === 0 || eq.some((e) => have.has(e));
    const all = normalizeEquipmentList((ex.requiredEquipmentAll ?? []).join(","));
    const okAll = all.every((e) => have.has(e));
    if (!okAny || !okAll) feas.push(v("sprzęt spoza miejsca", `${eq.join("/")} ${all.length ? "all:" + all.join("/") : ""}`));
  }
  if ((ex.trainingLocation ?? []).length && !(ex.trainingLocation ?? []).includes(place.exLoc)) feas.push(v("ćwiczenie spoza miejsca", `${(ex.trainingLocation ?? []).join("/")} ≠ ${place.exLoc}`));
}

// ── fixtures ─────────────────────────────────────────────────────────────────
let trainerId = 0;
const clientIds: number[] = [];
let guidelineId = 0;
const exerciseIds: number[] = [];

function makeProfile(i: number): Profile {
  const level = weighted([[LEVELS[0], 2], [LEVELS[1], 4], [LEVELS[2], 3], [LEVELS[3], 2]] as const);
  const trainingDuration = level === "Średniozaawansowany" || level === "Zaawansowany" ? pick(["3 lata", "5 lat", "1 rok", "6 lat"]) : pick(["3 miesiące", "pół roku", ""]);
  const effective = resolveEffectiveLevel(level, trainingDuration).effective ?? level;
  const goal = pick(GOALS);
  const place = STYLE === "calisthenics"
    ? weighted([["gym", 2], ["home0", 2], ["homeBand", 2], ["homeBar", 3], ["outdoor", 4]] as const)
    : weighted([["gym", 5], ["home0", 2], ["homeBand", 2], ["homeDb", 2], ["outdoor", 2]] as const);
  const joints = chance(0.35) ? [pick(JOINTS), ...(chance(0.3) ? [pick(JOINTS)] : [])].filter((j, k, a) => a.indexOf(j) === k) : [];
  const avoidIds = chance(0.2) ? Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(exerciseIds)) : [];
  return {
    id: i, level, effective, goal, place, days: 2 + Math.floor(rnd() * 5), minutes: 30 + Math.floor(rnd() * 7) * 10,
    joints, viaPain: joints.length > 0 && chance(0.5), avoidIds, jump: goal === "Cel sportowy" ? (chance(0.1) ? null : pick(JUMP)) : null,
    consent: chance(0.06) ? "declined" : null, trainingDuration,
  };
}

async function createClient(p: Profile): Promise<number> {
  const place = PLACES.find((x) => x.key === p.place)!;
  const [c] = await db.insert(clientsTable).values({ firstName: "Sym", lastName: "gensim", trainerId, status: "active" }).returning();
  clientIds.push(c.id);
  const text = p.joints.length && !p.viaPain ? p.joints.map((j) => JOINT_TEXT[j]).join(", ") : null;
  const [sv] = await db.insert(surveysTable).values({
    clientId: c.id, dateOfBirth: "1988-05-05", gender: chance(0.5) ? "female" : "male", heightCm: 150 + Math.floor(rnd() * 45), weightKg: 55 + Math.floor(rnd() * 40),
    experienceLevel: p.level, trainingDuration: p.trainingDuration || null, trainingLocation: place.location, equipment: place.equipment,
    sessionDuration: SESSION_OPTION(p.minutes), activityLevel: "Lekka aktywność", sleepHours: "7", planStylePreference: "Dowolny",
    trainingGoal: p.goal, jumpExperience: p.jump, injuryStatus: text ? "Tak" : "Brak", healthLimitations: text,
    desiredWeeklyFrequency: p.days, weeklyFrequency: p.days, avoidedExerciseIds: p.avoidIds, healthConsentStatus: p.consent,
    athleteStatus: p.goal === "Cel sportowy" ? "Tak — amatorsko" : "Nie", sportDiscipline: p.goal === "Cel sportowy" ? "piłka nożna" : null,
    sportPerformanceNeeds: p.goal === "Cel sportowy" ? ["Dynamika"] : [],
  } as never).returning();
  if (p.viaPain) {
    const [plan] = await db.insert(workoutPlansTable).values({ clientId: c.id, surveyId: sv.id, guidelineVersionId: guidelineId, experienceLevelUsed: p.level, title: "gensim-pain" } as never).returning();
    const [pd] = await db.insert(workoutPlanDaysTable).values({ planId: plan.id, dayOrder: 1, dayName: "Dzień 1" } as never).returning();
    const [s] = await db.insert(workoutSessionsTable).values({ clientId: c.id, planId: plan.id, planDayId: pd.id, sessionDate: new Date().toISOString().slice(0, 10) } as never).returning();
    for (const j of p.joints) await db.insert(painReportsTable).values({ sessionId: s.id, clientId: c.id, area: j, severity: 3, clientUuid: randomUUID(), createdAt: new Date(Date.now() - 2 * 86_400_000) });
  }
  return c.id;
}

interface DayOut { error?: string; code?: string; limited?: boolean; type: string; exercises: Array<{ id: number; sets: number; restSeconds: number; repsLabel: string }>; status: number; warnings: number }

async function generateWeek(clientId: number, p: Profile): Promise<DayOut[]> {
  const place = PLACES.find((x) => x.key === p.place)!;
  const split = recommendSplitType(p.effective, p.days).recommended ?? "full_body";
  const template = STYLE === "calisthenics"
    ? calisthenicsDays(p.days, stationsFor(place.location, place.equipment)).days
    : getDayTemplate(split, p.days);
  const gid = randomUUID();
  const used: number[] = []; const raw: Array<{ exerciseId: number; sets: number }> = [];
  const typeCount: Record<string, number> = {}; const lastByType: Record<string, Array<{ id: number; equipment: string[] }>> = {};
  const out: DayOut[] = [];
  const types = template.map((d) => d.dayType.toLowerCase()).map((t) => (t === "full_body_a" || t === "full_body_b" ? "full_body" : t)).filter((t) => ["push", "pull", "legs", "upper", "lower", "plyo", "full_body"].includes(t));
  let idx = 0;
  for (const t of types) {
    const alt = typeCount[t] ?? 0; typeCount[t] = alt + 1;
    const res = await request(app).post(`/api/clients/${clientId}/plan-draft/generate-day`).send({
      generationId: gid, ...(STYLE ? { style: STYLE } : {}), generationDayIndex: idx++, expectedDayCount: types.length, v0SessionType: t, alternativeIndex: alt,
      weekUsedExerciseIds: [...used], sameTypePreviousExercises: lastByType[t] ?? [], weekExercisesRaw: t === "full_body" ? raw : [],
    });
    const exs = ((res.body.exercises ?? []) as Array<{ id: number; equipment: string[]; matchReasons?: string[]; prescription?: { sets: number; restSeconds: number; repsLabel: string } }>);
    if (STYLE === "calisthenics") {
      const main = exs.filter((e) => !(e.matchReasons ?? []).includes("Blok pliometryczny")).length;
      const jumps = exs.length - main;
      if (main > 5) styleViolations.push({ rule: "kalistenika: więcej niż 5 ćwiczeń", profile: -1, level: "", goal: "", place: "", exercise: t, id: 0, detail: String(main) });
      if (jumps > 2 || (jumps > 0 && !isCalisthenicsLegDay(t))) styleViolations.push({ rule: "kalistenika: skoki poza dniem nóg lub więcej niż 2", profile: -1, level: "", goal: "", place: "", exercise: t, id: 0, detail: String(jumps) });
    }
    for (const e of exs) { used.push(e.id); raw.push({ exerciseId: e.id, sets: e.prescription?.sets ?? 1 }); }
    lastByType[t] = exs.map((e) => ({ id: e.id, equipment: e.equipment ?? [] }));
    out.push({ error: res.status === 200 ? undefined : String(res.body.error ?? ""), code: res.body.code, limited: typeof res.body.limitedDayNote === "string", type: t, status: res.status, warnings: (res.body.structuralWarnings ?? []).length, exercises: exs.map((e) => ({ id: e.id, sets: e.prescription?.sets ?? 0, restSeconds: e.prescription?.restSeconds ?? 0, repsLabel: e.prescription?.repsLabel ?? "" })) });
  }
  return out;
}

async function savePlan(clientId: number, week: DayOut[]) {
  const [sv] = await db.select({ id: surveysTable.id }).from(surveysTable).where(eq(surveysTable.clientId, clientId)).limit(1);
  const [plan] = await db.insert(workoutPlansTable).values({ clientId, surveyId: sv.id, guidelineVersionId: guidelineId, experienceLevelUsed: "x", title: "gensim-week" } as never).returning();
  let order = 1;
  for (const d of week) {
    const [pd] = await db.insert(workoutPlanDaysTable).values({ planId: plan.id, dayOrder: order++, dayName: d.type } as never).returning();
    let o = 1;
    for (const e of d.exercises) await db.insert(workoutPlanExercisesTable).values({ dayId: pd.id, exerciseId: e.id, orderInDay: o++, workingSets: Math.max(1, e.sets) } as never);
  }
}

beforeAll(async () => {
  const [t] = await db.insert(trainersTable).values({ clerkUserId: "gensim_trainer" }).onConflictDoUpdate({ target: trainersTable.clerkUserId, set: { clerkUserId: "gensim_trainer" } }).returning();
  trainerId = t.id;
  const [g] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).limit(1);
  guidelineId = g.id;
  for (const e of await db.select().from(exercisesTable)) { cat.set(e.id, e); if (!e.hidden) exerciseIds.push(e.id); }
  warmCatalogue = [...cat.values()].filter((e) => e.isActive && e.role && (WARMUP_ROLES as readonly string[]).includes(e.role)) as unknown as CatalogueWarmupItem[];
}, 120_000);

afterAll(async () => {
  const left = (await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.trainerId, trainerId))).map((r) => r.id);
  const ids = [...new Set([...clientIds, ...left])];
  if (ids.length) {
    await db.delete(painReportsTable).where(inArray(painReportsTable.clientId, ids));
    await db.delete(workoutSessionsTable).where(inArray(workoutSessionsTable.clientId, ids));
    await db.delete(workoutPlansTable).where(inArray(workoutPlansTable.clientId, ids));
    await db.delete(surveysTable).where(inArray(surveysTable.clientId, ids));
    await db.delete(clientsTable).where(inArray(clientsTable.id, ids));
  }
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
  await pool.end();
});

describe("generator simulation", () => {
  it(`${N} random profiles: safety and feasibility violations = 0`, async () => {
    const safetyAll: Violation[] = []; const safety = safetyAll; const feas: Violation[] = [];
    const stat = { limitedDays: 0, wrongRefusalText: 0, profiles: 0, days: 0, daysRefused: 0, exercises: 0, emptyDays: 0, structuralWarnings: 0, dupInPlan: 0, plans: 0 };
    const sets = { push: 0, pull: 0, knee: 0, hip: 0 };
    const balance: Array<{ push: number; pull: number; knee: number; hip: number }> = [];
    const perSession: Record<string, number[]> = {}; const timeRatio: Record<string, number[]> = {};
    const overlapBy: Record<string, number[]> = {}; const freq = new Map<number, number>(); let variants = 0; let total = 0; const overlap: number[] = [];
    // Informational (not a rule yet — docs/KATALOG-STANDARD.md: "do weryfikacji = niedopuszczone" is not switched on): share of unverified catalogue rows in plans.
    const unverified: Record<string, { all: number; unverified: number }> = {};
    const refusedWhy: Record<string, number> = {}; const refused: Record<string, number> = {}; const dupBy: Record<string, number> = {}; const profilesBy: Record<string, number> = {};
    const byGoalPlyo: Record<string, { plans: number; withPlyo: number }> = {};
    const weekMuscle: Record<string, number[]> = {};
    const dump: Array<{ p: number; level: string; place: string; t: string; status: number; ids: number[]; warm: number[]; cool: number[] }> = [];
    for (let i = 0; i < N; i++) {
      const p = makeProfile(i);
      const cid = await createClient(p);
      const week = await generateWeek(cid, p);
      stat.profiles++; stat.plans++;
      if (DUMP) week.forEach((d, di) => {
        // the warm-up and cool-down of the day, chosen by the same functions as the app
        const groups = [...new Set(d.exercises.map((e) => cat.get(e.id)?.mainMuscleGroup).filter((g): g is string => !!g))];
        const place = PLACES.find((x) => x.key === p.place)!;
        const ctx = { dayGroups: groups, level: p.effective, painAreas: new Set(p.joints), conservative: p.consent === "declined", trainingLocation: place.location, equipmentText: place.equipment, rollerAllowed: di % 2 === 0 };
        const ok = d.status === 200;
        dump.push({ p: i, level: p.effective, place: p.place, t: d.type, status: d.status, ids: d.exercises.map((e) => e.id), warm: ok ? selectWarmup(warmCatalogue, ctx).map((x) => x.id) : [], cool: ok ? selectCooldown(warmCatalogue, ctx).map((x) => x.id) : [] });
      });
      const bucket = `${p.place}|${p.effective}`; profilesBy[bucket] = (profilesBy[bucket] ?? 0) + 1;
      const ids = week.flatMap((d) => d.exercises.map((e) => e.id));
      stat.exercises += ids.length;
      if (new Set(ids).size !== ids.length) { stat.dupInPlan++; dupBy[bucket] = (dupBy[bucket] ?? 0) + 1; }
      const b = { push: 0, pull: 0, knee: 0, hip: 0 }; let anyPlyo = false;
      for (const d of week) {
        stat.days++;
        if (d.limited) stat.limitedDays++;
        if (d.status !== 200 && (d.code !== "TOO_FEW_EXERCISES" || !d.error || /V0|exercises required/.test(d.error))) stat.wrongRefusalText++;
        if (d.status !== 200) { stat.daysRefused++; refused[`${bucket}|${d.type}`] = (refused[`${bucket}|${d.type}`] ?? 0) + 1; const why = `${p.place === "gym" ? "gym" : "home/outdoor"}|${d.error}`; refusedWhy[why] = (refusedWhy[why] ?? 0) + 1; continue; }
        if (d.exercises.length === 0) stat.emptyDays++;
        stat.structuralWarnings += d.warnings;
        let minutes = 6; // warm-up + cool-down allowance
        let workSets = 0;
        for (const e of d.exercises) {
          const ex = cat.get(e.id)!; total++; freq.set(e.id, (freq.get(e.id) ?? 0) + 1);
          if (ex.parentExerciseId != null) variants++;
          const u = (unverified[p.effective] ??= { all: 0, unverified: 0 }); u.all++; if (ex.verificationStatus !== "zweryfikowane") u.unverified++;
          ctx = `1. generacja, dzień ${d.type}`; checkExercise(ex, p, safety, feas);
          if (ex.intensity && ex.role !== "technika biegu") anyPlyo = true;
          workSets += e.sets; minutes += e.sets * (40 + e.restSeconds) / 60;
          if (PUSH(ex.movementPattern)) b.push += e.sets; if (PULL(ex.movementPattern)) b.pull += e.sets;
          if (KNEE(ex.movementPattern)) b.knee += e.sets; if (HIP(ex.movementPattern)) b.hip += e.sets;
          (weekMuscle[ex.mainMuscleGroup] ??= []).push(e.sets);
        }
        (perSession[p.effective] ??= []).push(workSets);
        (timeRatio[p.effective] ??= []).push(minutes / p.minutes);
      }
      (sets.push += b.push, sets.pull += b.pull, sets.knee += b.knee, sets.hip += b.hip);
      balance.push(b);
      (byGoalPlyo[p.goal] ??= { plans: 0, withPlyo: 0 }).plans++; if (anyPlyo) byGoalPlyo[p.goal]!.withPlyo++;
      // "Generuj od nowa": save the week, generate again, measure repetition
      await savePlan(cid, week);
      const again = await generateWeek(cid, p);
      for (const d of again) for (const e of d.exercises) { ctx = `generuj od nowa, dzień ${d.type}`; checkExercise(cat.get(e.id)!, p, safety, feas); }
      const prev = new Set(ids); const ids2 = again.flatMap((d) => d.exercises.map((e) => e.id));
      if (ids2.length) { const o = ids2.filter((x) => prev.has(x)).length / ids2.length; overlap.push(o); (overlapBy[`${p.place === "gym" ? "gym" : "dom/plener"}|${p.effective}`] ??= []).push(o); }
    }
    const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, n]) => ({ id, name: cat.get(id)!.name, n, share: +(n / total).toFixed(3) }));
    // "ponad poziom" is a hard rule since decision 50b (28.10.2026) and counts as a safety violation (together with the style checks).
    safetyAll.push(...styleViolations);
    const aboveLevel = safetyAll.filter((x) => x.rule === "ponad poziom");
    const report = {
      aboveLevel: { count: aboveLevel.length, byLevel: Object.fromEntries([...new Set(aboveLevel.map((x) => x.level))].map((l) => [l, aboveLevel.filter((x) => x.level === l).length])), samples: aboveLevel.slice(0, 12) },
      missingJointData: jointGap,
      style: STYLE || "standard", seed: SEED, n: N, stat, safetyViolations: safety.length, feasibilityViolations: feas.length,
      safetyByRule: Object.fromEntries([...new Set(safety.map((x) => x.rule))].map((r) => [r, safety.filter((x) => x.rule === r).length])),
      feasibilityByRule: Object.fromEntries([...new Set(feas.map((x) => x.rule))].map((r) => [r, feas.filter((x) => x.rule === r).length])),
      samples: {
        safety: [...new Set(safety.map((x) => x.rule))].flatMap((r) => safety.filter((x) => x.rule === r).slice(0, 12)),
        feasibility: [...new Set(feas.map((x) => x.rule))].flatMap((r) => feas.filter((x) => x.rule === r).slice(0, 12)),
      },
      balance: { totals: sets, pushToPull: +(sets.push / Math.max(1, sets.pull)).toFixed(2), kneeToHip: +(sets.knee / Math.max(1, sets.hip)).toFixed(2),
        plansPushPullOutside_0_5_2: balance.filter((b) => b.pull > 0 && (b.push / b.pull < 0.5 || b.push / b.pull > 2)).length,
        plansWithoutPull: balance.filter((b) => b.pull === 0).length },
      setsPerSessionMedianByLevel: Object.fromEntries(Object.entries(perSession).map(([k, v]) => [k, med(v)])),
      timeEstimateToDeclaredMedianByLevel: Object.fromEntries(Object.entries(timeRatio).map(([k, v]) => [k, +med(v).toFixed(2)])),
      timeEstimateOver130pct: Object.values(timeRatio).flat().filter((x) => x > 1.3).length,
      timeEstimateUnder60pct: Object.values(timeRatio).flat().filter((x) => x < 0.6).length,
      variety: { variantShare: +(variants / Math.max(1, total)).toFixed(3), topExercises: top, medianOverlapWithPreviousPlan: +med(overlap).toFixed(2),
        medianOverlapByLevel: Object.fromEntries(Object.entries(overlapBy).map(([k, v]) => [k, +med(v).toFixed(2)])), overlapAbove50pct: overlap.filter((x) => x > 0.5).length, comparedPlans: overlap.length },
      goalPlyo: byGoalPlyo, unverifiedInPlansByLevel: unverified, refusedDaysByPlaceLevelType: refused, refusedReasons: refusedWhy, plansWithDuplicatesByPlaceLevel: dupBy, profilesByPlaceLevel: profilesBy,
    };
    if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 1));
    if (DUMP) writeFileSync(DUMP, JSON.stringify(dump));
    expect(stat.wrongRefusalText, "odmowa bez komunikatu dla trenera").toBe(0);
    expect(safety.slice(0, 5), "naruszenia bezpieczeństwa").toEqual([]);
    expect(feas.slice(0, 5), "naruszenia wykonalności").toEqual([]);
  }, 6 * 3_600_000);
});
