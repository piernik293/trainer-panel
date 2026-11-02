/**
 * Solo: serwerowe prowadzenie generatora (docs/SOLO-STEROWNIK.md). Osoba bez trenera nie ma kreatora w panelu, więc serwer sam układa plan:
 * wywiad (survey) → poziom efektywny → liczba dni → podział → kolejne dni przez TEN SAM silnik co kreator trenera (generateDayHandler) z regułami Solo
 * (tylko ćwiczenia zatwierdzone, skoki tylko przy „Tak” i od Ś, ćwiczenie z bólem wypada na 90 dni) → zapis jako AKTYWNY plan.
 * Uproszczenie wersji 1: dawkowanie (serie, powtórzenia, przerwy) bierze z silnika (prescribeExercise), bez ręcznego bilansu objętości trenera.
 * Dotyczy też „Mojego treningu” trenera (jego własny wiersz klienta). Nic tu nie dotyka kont trenerów ani cudzych podopiecznych.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import { db, clientsTable, surveysTable, workoutPlansTable, workoutPlanDaysTable, workoutPlanExercisesTable, volumeGuidelineVersionsTable } from "@workspace/db";
import { generateDayHandler, type GenerateDayReq } from "../routes/planDraftGenerateDay";
import { withEffectiveLevel } from "../lib/effectiveLevel";
import { getDayTemplate, recommendSplitType } from "./planDraftVolumeDistributionService";
import { betaNoLimits } from "./subscriptionService";
import { isSelfTraining } from "./selfTraining";

export const SOLO_PLAN_COOLDOWN_DAYS = 14;
const CYCLE_WEEKS: Record<string, number> = { "Brak aktywności fizycznej": 4, "Początkujący": 4, "Średniozaawansowany": 6, "Zaawansowany": 8 };
const MAX_DAYS: Record<string, number> = { "Brak aktywności fizycznej": 3, "Początkujący": 4, "Średniozaawansowany": 5, "Zaawansowany": 5 };
const RIR: Record<string, number> = { "Brak aktywności fizycznej": 3, "Początkujący": 2, "Średniozaawansowany": 2, "Zaawansowany": 2 };
const TYPES = ["push", "pull", "legs", "upper", "lower", "plyo", "full_body"] as const;

export type SoloPlanResult =
  | { ok: true; planId: number; days: number; cycleWeeks: number; skippedDays: number; endDate: string }
  | { ok: false; code: "NOT_SOLO" | "NO_SURVEY" | "PLAN_LIMIT" | "NO_SAFE_PLAN"; message: string; retryAfter?: string };

/** Czysta funkcja: liczba dni w tygodniu (2–5) z odpowiedzi, ograniczona poziomem. */
export function soloDayCount(desired: number | null | undefined, level: string): number {
  const d = Math.round(desired ?? 3);
  return Math.max(2, Math.min(MAX_DAYS[level] ?? 3, Number.isFinite(d) ? d : 3));
}
export const soloCycleWeeks = (level: string) => CYCLE_WEEKS[level] ?? 4;

export function parseRepsLabel(label: string | undefined): { min: number; max: number } {
  const m = (label ?? "").match(/^(\d+)[–-](\d+)/);
  return m ? { min: Number(m[1]), max: Number(m[2]) } : { min: 8, max: 12 };
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

function fakeRes() {
  const out: { status: number; body: any } = { status: 200, body: undefined }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; return res; }, sendStatus(c: number) { out.status = c; return res; } };
  return { res: res as unknown as Response, out };
}

export async function generateSoloPlan(clientId: number, now: Date = new Date()): Promise<SoloPlanResult> {
  const [client] = await db.select({ id: clientsTable.id, trainerId: clientsTable.trainerId, override: clientsTable.experienceLevelOverride }).from(clientsTable).where(eq(clientsTable.id, clientId));
  if (!client || (client.trainerId !== null && !(await isSelfTraining(clientId)))) return { ok: false, code: "NOT_SOLO", message: "Plan układa Twój trener." };

  const [rawSurvey] = await db.select().from(surveysTable).where(eq(surveysTable.clientId, clientId)).orderBy(desc(surveysTable.createdAt)).limit(1);
  if (!rawSurvey) return { ok: false, code: "NO_SURVEY", message: "Najpierw odpowiedz na kilka pytań o siebie." };

  if (!betaNoLimits()) {
    const since = addDays(now, -SOLO_PLAN_COOLDOWN_DAYS);
    const [last] = await db.select({ createdAt: workoutPlansTable.createdAt }).from(workoutPlansTable)
      .where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.createdBy, "solo"), gte(workoutPlansTable.createdAt, since))).orderBy(desc(workoutPlansTable.createdAt)).limit(1);
    if (last) {
      const next = isoDay(addDays(last.createdAt, SOLO_PLAN_COOLDOWN_DAYS));
      const daysLeft = Math.max(1, Math.ceil((addDays(last.createdAt, SOLO_PLAN_COOLDOWN_DAYS).getTime() - Date.now()) / 86_400_000));
      return { ok: false, code: "PLAN_LIMIT", message: `Nowy plan możesz ułożyć za ${daysLeft} ${daysLeft === 1 ? "dzień" : "dni"} — ciało potrzebuje czasu na efekty.`, retryAfter: next };
    }
  }

  const survey = withEffectiveLevel(rawSurvey, client.override);
  const level = survey.experienceLevel ?? "Początkujący";
  const days = soloDayCount(survey.desiredWeeklyFrequency, level);
  const split = recommendSplitType(level, days).recommended ?? "full_body";
  const template = getDayTemplate(split, days);
  const types = template.map((d) => d.dayType.toLowerCase()).map((t) => (t === "full_body_a" || t === "full_body_b" ? "full_body" : t)).filter((t): t is (typeof TYPES)[number] => (TYPES as readonly string[]).includes(t));

  const gid = randomUUID();
  const used: number[] = []; const raw: Array<{ exerciseId: number; sets: number }> = [];
  const typeCount: Record<string, number> = {}; const lastByType: Record<string, Array<{ id: number; equipment: string[] }>> = {};
  const dayResults: Array<{ type: string; exercises: Array<{ id: number; prescription?: { sets: number; repsLabel: string; restSeconds: number } }> }> = [];
  let skipped = 0; let idx = 0;
  for (const t of types) {
    const alt = typeCount[t] ?? 0; typeCount[t] = alt + 1;
    const { res, out } = fakeRes();
    const req = {
      params: { clientId: String(clientId) }, soloClientId: clientId,
      body: { generationId: gid, generationDayIndex: idx++, expectedDayCount: types.length, v0SessionType: t, alternativeIndex: alt, weekUsedExerciseIds: [...used], sameTypePreviousExercises: lastByType[t] ?? [], weekExercisesRaw: t === "full_body" ? raw : [] },
    } as unknown as GenerateDayReq;
    await generateDayHandler(req, res);
    const exs = (out.body?.exercises ?? []) as Array<{ id: number; equipment?: string[]; prescription?: { sets: number; repsLabel: string; restSeconds: number } }>;
    if (out.status !== 200 || exs.length === 0) { skipped++; continue; } // dzień odrzucony (np. za mało bezpiecznych ćwiczeń) — pomijamy, plan ma krótszy tydzień
    for (const e of exs) { used.push(e.id); raw.push({ exerciseId: e.id, sets: e.prescription?.sets ?? 1 }); }
    lastByType[t] = exs.map((e) => ({ id: e.id, equipment: e.equipment ?? [] }));
    dayResults.push({ type: t, exercises: exs });
  }
  if (dayResults.length === 0) return { ok: false, code: "NO_SAFE_PLAN", message: "Nie udało się ułożyć planu wyłącznie z bezpiecznych ćwiczeń. Połącz się z trenerem — ułoży plan ręcznie." };

  const [guideline] = await db.select({ id: volumeGuidelineVersionsTable.id }).from(volumeGuidelineVersionsTable).orderBy(desc(volumeGuidelineVersionsTable.id)).limit(1);
  const weeks = soloCycleWeeks(level); const end = isoDay(addDays(now, weeks * 7));
  const planId = await db.transaction(async (tx) => {
    await tx.update(workoutPlansTable).set({ status: "archived", updatedAt: new Date() } as never).where(and(eq(workoutPlansTable.clientId, clientId), eq(workoutPlansTable.status, "active")));
    const [plan] = await tx.insert(workoutPlansTable).values({
      clientId, surveyId: rawSurvey.id, guidelineVersionId: guideline!.id, experienceLevelUsed: level, title: "Mój plan", goal: survey.trainingGoal ?? null,
      status: "active", activatedAt: now, startDate: isoDay(now), endDate: end, splitType: split, blockDurationWeeks: weeks, createdBy: "solo",
    } as never).returning({ id: workoutPlansTable.id });
    let order = 1;
    for (const d of dayResults) {
      const [pd] = await tx.insert(workoutPlanDaysTable).values({ planId: plan!.id, dayOrder: order, dayName: `Dzień ${order}`, subtitle: d.type } as never).returning({ id: workoutPlanDaysTable.id });
      order++; let o = 1;
      for (const e of d.exercises) {
        const reps = parseRepsLabel(e.prescription?.repsLabel);
        await tx.insert(workoutPlanExercisesTable).values({
          dayId: pd!.id, exerciseId: e.id, orderInDay: o++, workingSets: Math.max(1, e.prescription?.sets ?? 3), repType: "range", repRangeMin: reps.min, repRangeMax: reps.max,
          rir: RIR[level] ?? 3, restSeconds: e.prescription?.restSeconds ?? 90,
        } as never);
      }
    }
    return plan!.id;
  });
  return { ok: true, planId, days: dayResults.length, cycleWeeks: weeks, skippedDays: skipped, endDate: end };
}
