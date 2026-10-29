/**
 * Osiągnięcia (blok 4, docs/OSIAGNIECIA.md) — pure engine, no database. OFF by default: ACHIEVEMENTS_ENABLED=1 turns the module on.
 *
 * Everything is DERIVED from the whole history on every run and stored with a unique (client, kind, key), so the result does not depend on the order of
 * events: an offline retry, a duplicated session or a late set cannot create a second award or miss one.
 *
 * Ethics (enforced here and in the tests): no shame (this module only ever produces awards; a broken streak is simply not mentioned); nothing is
 * awarded for training above the plan (a week counts at most as many sessions as the plan has days; only planned sets count for records and ladder
 * steps); nothing is awarded by a session on a day with a reported pain; no rankings; at most one award is chosen to be shown after a session.
 */
import { recordGain } from "./training";
import { shiftDate } from "./steps";

export const achievementsEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ACHIEVEMENTS_ENABLED === "1";
export const monthlyChallengeEnabled = (env: NodeJS.ProcessEnv = process.env) => achievementsEnabled(env) && env.ACHIEVEMENTS_MONTHLY_CHALLENGE === "1";

export const STREAK_MILESTONES = [2, 4, 8, 12, 26, 52] as const;
export const SESSION_MILESTONES = [1, 10, 25, 50, 100, 250] as const;
/** One missed week is forgiven, at most once in this many weeks. */
export const PROTECTION_EVERY_WEEKS = 6;
export const FIRST_MONTH_DAYS = 28;
export const FIRST_MONTH_MIN_SESSIONS = 4;
export const STEPS_WEEK_MIN_DAYS = 5;
export const MONTH_CHALLENGE_WEEKS = 4;

export type AchievementKind = "week_streak" | "record" | "milestone" | "first_month" | "ladder_step" | "steps_week" | "month_challenge";

export interface AchSession {
  id: number;
  /** YYYY-MM-DD of the training */
  date: string;
  /** chronological sort key (completion time) */
  order: number;
  /** days of the plan this session belongs to = the weekly goal */
  planDays: number;
  /** a pain was reported on this calendar day */
  pain: boolean;
}
export interface AchSet {
  sessionId: number;
  exerciseId: number;
  exerciseName: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  /** planned working sets of the exercise in the plan; null = not in the plan */
  plannedSets: number | null;
}
export interface AchLadder { exerciseId: number; pattern: string; stepOrder: number }
export interface AchInput {
  today: string;
  sessions: readonly AchSession[];
  sets: readonly AchSet[];
  pauses: ReadonlyArray<{ start: string; end: string }>;
  ladder: readonly AchLadder[];
  stepsGoal: number | null;
  steps: ReadonlyArray<{ day: string; steps: number }>;
  planDaysNow: number | null;
  monthlyChallenge: boolean;
}
export interface Candidate {
  kind: AchievementKind;
  key: string;
  title: string;
  body: string | null;
  sessionId: number | null;
  detail: Record<string, unknown> | null;
  /** which award to show right after a session (higher wins) */
  priority: number;
}
export interface AchResult { candidates: Candidate[]; streakWeeks: number }

// ─── Dates and wording ────────────────────────────────────────────────────────

/** Monday of the week (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDate(date, -dow);
}
const monthOf = (date: string) => date.slice(0, 7);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Polish plural: 1 → one, 2–4 (not 12–14) → few, otherwise many. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (n === 1) return one;
  return m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14) ? few : many;
}
const kg = (v: number) => `${String(Math.round(v * 100) / 100).replace(".", ",")} kg`;

// ─── Engine ───────────────────────────────────────────────────────────────────

export function computeAchievements(input: AchInput): AchResult {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const add = (c: Candidate) => { const id = `${c.kind}:${c.key}`; if (!seen.has(id)) { seen.add(id); out.push(c); } };

  const sessions = [...input.sessions].sort((a, b) => a.order - b.order || a.id - b.id);
  const setsBySession = new Map<number, AchSet[]>();
  for (const s of input.sets) setsBySession.set(s.sessionId, [...(setsBySession.get(s.sessionId) ?? []), s]);

  // Weekly cap: only the first `planDays` sessions of a week count (no reward for training above the plan).
  const perWeek = new Map<string, number>();
  const countable = new Set<number>();
  for (const s of sessions) {
    const ws = weekStart(s.date);
    const n = (perWeek.get(ws) ?? 0) + 1;
    perWeek.set(ws, n);
    if (s.planDays <= 0 || n <= s.planDays) countable.add(s.id);
  }
  /** A session may trigger an award: within the weekly plan and no pain reported that day. */
  const triggers = (s: AchSession) => countable.has(s.id) && !s.pain;
  const lastSession = sessions[sessions.length - 1];
  const latestOk = !lastSession || triggers(lastSession);

  // ── Records (existing rule recordGain; only planned sets; baseline = everything done before) ──
  const hist = new Map<number, { weightKg: number | null; reps: number | null }[]>();
  for (const s of sessions) {
    const mine = setsBySession.get(s.id) ?? [];
    if (triggers(s)) {
      for (const exId of new Set(mine.map((x) => x.exerciseId))) {
        const past = hist.get(exId) ?? [];
        let top: { gain: number; set: AchSet } | null = null;
        for (const x of mine.filter((y) => y.exerciseId === exId && y.plannedSets != null && y.setNumber <= y.plannedSets)) {
          const gain = recordGain(past, { weightKg: x.weightKg, reps: x.reps });
          if (gain != null && (!top || gain > top.gain)) top = { gain, set: x };
        }
        if (top) {
          const w = top.set;
          add({
            kind: "record", key: `${exId}:${s.id}`, title: `Nowy rekord: ${w.exerciseName}`,
            body: `${kg(w.weightKg!)} × ${w.reps} (o ${kg(top.gain)} więcej niż dotąd)`, sessionId: s.id,
            detail: { exerciseId: exId, weightKg: w.weightKg, reps: w.reps, gainKg: top.gain }, priority: 2,
          });
        }
      }
    }
    for (const x of mine) hist.set(x.exerciseId, [...(hist.get(x.exerciseId) ?? []), { weightKg: x.weightKg, reps: x.reps }]);
  }

  // ── Milestones: counted trainings within the plan; the award waits for the next clean session ──
  let count = 0;
  const pending: number[] = [];
  const queued = new Set<number>();
  for (const s of sessions) {
    if (countable.has(s.id)) {
      count++;
      for (const t of SESSION_MILESTONES) if (t <= count && !queued.has(t)) { queued.add(t); pending.push(t); }
    }
    if (triggers(s) && pending.length) {
      for (const t of pending.splice(0)) {
        add({
          kind: "milestone", key: String(t), sessionId: s.id, detail: { count: t }, priority: 3 + t / 1000,
          title: t === 1 ? "Pierwszy trening za Tobą" : `${t}. trening`,
          body: t === 1 ? "Najtrudniejszy krok zrobiony." : "Tak trzymaj — to naprawdę się sumuje.",
        });
      }
    }
  }

  // ── First month: 28 days since the first training and at least 4 counted trainings ──
  const first = sessions.find((s) => countable.has(s.id));
  if (first) {
    let n = 0;
    for (const s of sessions) {
      if (countable.has(s.id)) n++;
      if (triggers(s) && daysBetween(first.date, s.date) >= FIRST_MONTH_DAYS && n >= FIRST_MONTH_MIN_SESSIONS) {
        add({ kind: "first_month", key: "first_month", title: "Pierwszy miesiąc za Tobą", body: "Regularność robi różnicę.", sessionId: s.id, detail: null, priority: 3 });
        break;
      }
    }
  }

  // ── Ladder steps: first PLANNED set on a higher step of a ladder than anything planned before in it (first exposure only sets the baseline) ──
  const ladderOf = new Map<number, AchLadder[]>();
  for (const l of input.ladder) ladderOf.set(l.exerciseId, [...(ladderOf.get(l.exerciseId) ?? []), l]);
  const maxStep = new Map<string, number>();
  for (const s of sessions) {
    if (!triggers(s)) continue;
    const planned = (setsBySession.get(s.id) ?? []).filter((x) => x.plannedSets != null && x.setNumber <= x.plannedSets);
    const best = new Map<string, { step: number; name: string; exerciseId: number }>();
    for (const x of planned) for (const l of ladderOf.get(x.exerciseId) ?? []) {
      const cur = best.get(l.pattern);
      if (!cur || l.stepOrder > cur.step) best.set(l.pattern, { step: l.stepOrder, name: x.exerciseName, exerciseId: x.exerciseId });
    }
    for (const [pattern, b] of best) {
      const prev = maxStep.get(pattern);
      if (prev !== undefined && b.step > prev) {
        add({
          kind: "ladder_step", key: `${pattern}:${b.step}`, title: `Nowy szczebel: ${b.name}`, body: "Nowy poziom tego ruchu!",
          sessionId: s.id, detail: { pattern, step: b.step, exerciseId: b.exerciseId }, priority: 5,
        });
      }
      if (prev === undefined || b.step > prev) maxStep.set(pattern, b.step);
    }
  }

  // ── Weekly streak (needs a clean latest session so that nothing is awarded by a painful or over-plan one) ──
  const thisWeek = weekStart(input.today);
  const doneByWeek = new Map<string, number>();
  const goalByWeek = new Map<string, number>();
  for (const s of sessions) {
    const ws = weekStart(s.date);
    if (countable.has(s.id)) doneByWeek.set(ws, (doneByWeek.get(ws) ?? 0) + 1);
    goalByWeek.set(ws, Math.max(goalByWeek.get(ws) ?? 0, s.planDays));
  }
  const paused = (ws: string) => input.pauses.some((p) => p.start <= shiftDate(ws, 6) && p.end >= ws);
  let streak = 0;
  if (sessions.length > 0) {
    let lastBridge = -Infinity;
    const firstWeek = weekStart(sessions[0]!.date);
    const weeks: string[] = [];
    for (let w = firstWeek; w <= thisWeek; w = shiftDate(w, 7)) weeks.push(w);
    // goal of a week = the plan days of its sessions; an empty week takes the nearest earlier known goal (else the current plan)
    let lastGoal = input.planDaysNow ?? 0;
    const known = weeks.map((w) => { const g = goalByWeek.get(w) ?? 0; if (g > 0) lastGoal = g; return g > 0 ? g : lastGoal; });
    weeks.forEach((w, i) => {
      const g = known[i]!;
      if (g <= 0) return; // no goal known: neutral
      const met = (doneByWeek.get(w) ?? 0) >= g;
      const isCurrent = w === thisWeek;
      if (!met) {
        if (isCurrent || paused(w)) return; // still going / holiday or illness: neutral
        if (streak > 0 && i - lastBridge >= PROTECTION_EVERY_WEEKS) { lastBridge = i; return; } // one forgiven week
        streak = 0;
        return;
      }
      streak++;
      if (latestOk) for (const t of STREAK_MILESTONES) if (streak >= t) {
        add({
          kind: "week_streak", key: String(t), sessionId: null, detail: { weeks: t }, priority: 4 + t / 1000,
          title: `${t} ${plural(t, "tydzień", "tygodnie", "tygodni")} z rzędu`, body: "Trenujesz regularnie — tak trzymaj.",
        });
      }
    });
  }

  // ── Steps: a finished week with at least 5 days entered and an average that reaches the goal ──
  if (input.stepsGoal && input.stepsGoal > 0 && latestOk) {
    const byWeek = new Map<string, number[]>();
    for (const r of input.steps) byWeek.set(weekStart(r.day), [...(byWeek.get(weekStart(r.day)) ?? []), r.steps]);
    for (const [ws, vals] of byWeek) {
      if (shiftDate(ws, 6) >= input.today || vals.length < STEPS_WEEK_MIN_DAYS) continue;
      if (vals.reduce((a, b) => a + b, 0) / vals.length >= input.stepsGoal) {
        add({ kind: "steps_week", key: ws, title: "Tydzień z celem kroków", body: "Ruch na co dzień też się liczy.", sessionId: null, detail: { weekStart: ws, goal: input.stepsGoal }, priority: 1 });
      }
    }
  }

  // ── Monthly challenge (optional): plan days per week × 4 counted trainings in a calendar month ──
  if (input.monthlyChallenge && (input.planDaysNow ?? 0) > 0) {
    const target = input.planDaysNow! * MONTH_CHALLENGE_WEEKS;
    const byMonth = new Map<string, AchSession[]>();
    for (const s of sessions) if (countable.has(s.id)) byMonth.set(monthOf(s.date), [...(byMonth.get(monthOf(s.date)) ?? []), s]);
    for (const [month, list] of byMonth) {
      const trigger = list.slice(target - 1).find(triggers);
      if (list.length >= target && trigger) {
        add({ kind: "month_challenge", key: month, title: `Wyzwanie miesiąca: ${target} ${plural(target, "trening", "treningi", "treningów")}`, body: "Cały miesiąc w rytmie planu.", sessionId: trigger.id, detail: { month, target }, priority: 3 });
      }
    }
  }

  return { candidates: out, streakWeeks: streak };
}

/** The one award to show right after a session: the highest priority among the newly earned. */
export function pickCelebration<T extends { priority: number }>(earned: readonly T[]): T | null {
  return earned.reduce<T | null>((best, c) => (!best || c.priority > best.priority ? c : best), null);
}
