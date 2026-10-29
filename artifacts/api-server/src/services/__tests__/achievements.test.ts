import { describe, it, expect } from "vitest";
import {
  computeAchievements, pickCelebration, plural, weekStart, PROTECTION_EVERY_WEEKS,
  type AchInput, type AchSession, type AchSet, type Candidate,
} from "../achievements";
import { shiftDate } from "../steps";

const MON = "2026-09-07"; // a Monday
let nextId = 1;
/** n sessions in week `w` (0 = the week of MON), on consecutive days from Monday. */
function week(w: number, n: number, over: Partial<AchSession> = {}): AchSession[] {
  return Array.from({ length: n }, (_, i) => {
    const date = shiftDate(MON, w * 7 + i);
    return { id: nextId++, date, order: Date.parse(`${date}T12:00:00Z`), planDays: 3, pain: false, ...over };
  });
}
/** "Today" = Monday after the last session's week (the new week has just begun and is neutral), unless a test sets it. */
const afterLast = (ss: readonly AchSession[]) => shiftDate(weekStart(ss.reduce((m, s) => (s.date > m ? s.date : m), MON)), 7);
const base = (sessions: AchSession[], over: Partial<AchInput> = {}): AchInput => ({
  today: afterLast(sessions), sessions, sets: [], pauses: [], ladder: [], stepsGoal: null, steps: [], planDaysNow: 3, monthlyChallenge: false, ...over,
});
const keys = (r: { candidates: Candidate[] }, kind?: string) => r.candidates.filter((c) => !kind || c.kind === kind).map((c) => `${c.kind}:${c.key}`);
const set = (s: AchSession, exerciseId: number, setNumber: number, weightKg: number, reps: number, plannedSets: number | null = 3, name = "Przysiad"): AchSet =>
  ({ sessionId: s.id, exerciseId, exerciseName: name, setNumber, weightKg, reps, plannedSets });

describe("weeks and wording", () => {
  it("a week starts on Monday; Polish plural", () => {
    expect(weekStart("2026-10-28")).toBe("2026-10-26");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday
    expect([1, 2, 5, 12, 22, 25].map((n) => plural(n, "tydzień", "tygodnie", "tygodni"))).toEqual(["tydzień", "tygodnie", "tygodni", "tygodni", "tygodnie", "tygodni"]);
  });
});

describe("weekly streak", () => {
  it("consecutive weeks with the whole plan done build the streak and its milestones", () => {
    const r = computeAchievements(base([...week(0, 3), ...week(1, 3), ...week(2, 3), ...week(3, 3)]));
    expect(r.streakWeeks).toBe(4);
    expect(keys(r, "week_streak")).toEqual(["week_streak:2", "week_streak:4"]);
  });
  it("a week with fewer sessions than the plan does not count", () => {
    const r = computeAchievements(base([...week(0, 3), ...week(1, 2), ...week(2, 3)]));
    expect(r.streakWeeks).toBe(2); // the short week was forgiven (it did not add to the streak), the next one continued it
    expect(keys(r, "week_streak")).toEqual(["week_streak:2"]);
  });
  it("protection: ONE missed week is forgiven, but at most once in 6 weeks", () => {
    const forgiven = computeAchievements(base([...week(0, 3), ...week(1, 3), /* missed */ ...week(3, 3)]));
    expect(forgiven.streakWeeks).toBe(3);
    const second = computeAchievements(base([...week(0, 3), ...week(1, 3), ...week(3, 3), /* missed again too soon */ ...week(5, 3)]));
    expect(second.streakWeeks).toBe(1); // the second miss within 6 weeks ends the streak; the week after it starts a new one
    expect(PROTECTION_EVERY_WEEKS).toBe(6);
    const later = computeAchievements(base([...week(0, 3), ...week(1, 3), ...[2, 3, 4, 5, 6].flatMap((w) => week(w, 3)), /* miss at 7 */ ...week(8, 3)]));
    expect(later.streakWeeks).toBe(8); // 7 met weeks + forgiven miss (week 7) + week 8
  });
  it("two weeks missed in a row end the streak", () => {
    const r = computeAchievements(base([...week(0, 3), ...week(1, 3), ...week(4, 3)]));
    expect(r.streakWeeks).toBe(1);
  });
  it("holiday / illness weeks are neutral: they neither count, nor break, nor use up the protection", () => {
    const pause = [{ start: shiftDate(MON, 7), end: shiftDate(MON, 13) }]; // week 1
    const r = computeAchievements(base([...week(0, 3), /* paused */ ...week(2, 3)], { pauses: pause }));
    expect(r.streakWeeks).toBe(2);
    // the protection is still available after the pause
    const r2 = computeAchievements(base([...week(0, 3), /* paused */ /* miss */ ...week(3, 3)], { pauses: pause }));
    expect(r2.streakWeeks).toBe(2);
    // a paused week in which the client trained the whole plan still counts
    const r3 = computeAchievements(base([...week(0, 3), ...week(1, 3)], { pauses: pause }));
    expect(r3.streakWeeks).toBe(2);
  });
  it("the current week that is not finished yet never breaks the streak", () => {
    const today = shiftDate(MON, 2 * 7 + 2); // Wednesday of week 2, nothing done yet this week
    const r = computeAchievements(base([...week(0, 3), ...week(1, 3)], { today }));
    expect(r.streakWeeks).toBe(2);
  });
  it("an empty week takes the goal from the nearest earlier known one", () => {
    const r = computeAchievements(base([...week(0, 4, { planDays: 4 }), ...week(1, 4, { planDays: 4 })], { planDaysNow: 4 }));
    expect(r.streakWeeks).toBe(2);
  });
});

describe("ethics: nothing for training above the plan", () => {
  it("a week counts at most plan-days sessions; extra sessions award nothing and do not speed up milestones", () => {
    const ss = week(0, 5); // plan = 3 → only the first 3 are countable
    const r = computeAchievements(base(ss));
    expect(keys(r, "milestone")).toEqual(["milestone:1"]);
    expect(r.candidates.find((c) => c.kind === "milestone")!.sessionId).toBe(ss[0]!.id);
    // 10 sessions in one week of a 3-day plan: still far from the 10th training
    expect(keys(computeAchievements(base(week(0, 10))), "milestone")).toEqual(["milestone:1"]);
  });
  it("a record in an extra session (above the weekly plan) is not awarded", () => {
    const ss = week(0, 4);
    const sets = [set(ss[0]!, 7, 1, 50, 8), set(ss[3]!, 7, 1, 80, 8)]; // 4th session of a 3-day plan beats the earlier one
    expect(keys(computeAchievements(base(ss, { sets })), "record")).toEqual([]);
  });
  it("sets above the planned number and exercises outside the plan never give a record", () => {
    const [a, b] = week(0, 2) as [AchSession, AchSession];
    const sets = [set(a, 7, 1, 50, 8), set(b, 7, 4, 90, 8, 3) /* 4th set of 3 planned */, set(b, 8, 1, 100, 5, null) /* not in plan */, set(a, 8, 1, 60, 5, null)];
    expect(keys(computeAchievements(base([a, b], { sets })), "record")).toEqual([]);
  });
  it("only a heavier weight is a record; the first time an exercise is done is not", () => {
    const [a, b, c] = week(0, 3) as [AchSession, AchSession, AchSession];
    const sets = [set(a, 7, 1, 50, 8), set(b, 7, 1, 50, 8), set(c, 7, 1, 55, 8, 3, "Przysiad ze sztangą")];
    const r = computeAchievements(base([a, b, c], { sets }));
    expect(keys(r, "record")).toEqual([`record:7:${c.id}`]);
    const rec = r.candidates.find((x) => x.kind === "record")!;
    expect(rec.title).toBe("Nowy rekord: Przysiad ze sztangą");
    expect(rec.body).toContain("55 kg × 8");
  });
});

describe("ethics: nothing after a reported pain that day", () => {
  it("a painful session awards nothing (record, milestone, streak), the award comes with the next clean one", () => {
    const first9 = [...week(0, 3), ...week(1, 3), ...week(2, 3)];
    const tenth = week(3, 1, { pain: true })[0]!;
    const withPain = computeAchievements(base([...first9, tenth]));
    expect(keys(withPain, "milestone")).toEqual(["milestone:1"]);
    expect(withPain.candidates.some((c) => c.sessionId === tenth.id)).toBe(false);
    expect(keys(withPain, "week_streak")).toEqual([]); // latest session is a painful one → no time-based award now
    const next = week(3, 2).slice(1)[0]!; // a clean one on the following day
    const after = computeAchievements(base([...first9, tenth, { ...next, date: shiftDate(MON, 3 * 7 + 1) }]));
    expect(keys(after, "milestone")).toEqual(["milestone:1", "milestone:10"]);
    expect(after.candidates.find((c) => c.key === "10")!.sessionId).toBe(next.id);
  });
  it("a record set in a painful session is not awarded, but it stays the baseline", () => {
    const [a, b] = week(0, 2) as [AchSession, AchSession];
    const sets = [set(a, 7, 1, 50, 8), set(b, 7, 1, 60, 8)];
    expect(keys(computeAchievements(base([a, { ...b, pain: true }], { sets })), "record")).toEqual([]);
  });
  it("the training still counts for regularity (reporting pain costs nothing)", () => {
    const r = computeAchievements(base([...week(0, 3), ...week(1, 3, { pain: true }), ...week(2, 3)]));
    expect(r.streakWeeks).toBe(3);
  });
});

describe("no shame, no loss language", () => {
  it("even when a streak is broken nothing negative is produced", () => {
    const r = computeAchievements(base([...week(0, 3), ...week(1, 3), ...week(4, 3)]));
    expect(r.streakWeeks).toBe(1);
    const text = r.candidates.map((c) => `${c.title} ${c.body ?? ""}`).join(" ").toLowerCase();
    for (const bad of ["strac", "utrac", "przerwan", "nie zdąż", "zawied", "szkoda", "ostatni raz", "wstyd"]) expect(text).not.toContain(bad);
    expect(["week_streak", "record", "milestone", "first_month", "ladder_step", "steps_week", "month_challenge"]).toEqual(expect.arrayContaining(r.candidates.map((c) => c.kind)));
  });
});

describe("milestones, first month", () => {
  it("1, 10, 25… counted trainings; text is short and warm", () => {
    const ss = Array.from({ length: 12 }, (_, w) => week(w, 3)).flat(); // 36 sessions
    const r = computeAchievements(base(ss));
    expect(keys(r, "milestone")).toEqual(["milestone:1", "milestone:10", "milestone:25"]);
    expect(r.candidates.find((c) => c.key === "1")!.title).toBe("Pierwszy trening za Tobą");
    expect(r.candidates.find((c) => c.key === "10")!.title).toBe("10. trening");
  });
  it("first month: 28 days since the first training and at least 4 trainings", () => {
    expect(keys(computeAchievements(base([...week(0, 3), ...week(1, 3)])), "first_month")).toEqual([]);
    expect(keys(computeAchievements(base([...week(0, 3), ...week(1, 3), ...week(2, 3), ...week(3, 3), ...week(4, 1)])), "first_month")).toEqual(["first_month:first_month"]);
  });
});

describe("ladder steps", () => {
  const ladder = [{ exerciseId: 10, pattern: "Pompki", stepOrder: 1 }, { exerciseId: 11, pattern: "Pompki", stepOrder: 2 }, { exerciseId: 12, pattern: "Pompki", stepOrder: 3 }];
  it("the first exposure only sets the baseline; a higher PLANNED step gives the award; the same step again gives nothing", () => {
    const [a, b, c, d] = week(0, 3).concat(week(1, 1)) as AchSession[];
    const sets = [set(a!, 10, 1, 0, 10, 3, "Pompki na kolanach"), set(b!, 10, 1, 0, 12, 3, "Pompki na kolanach"), set(c!, 11, 1, 0, 8, 3, "Pompki klasyczne"), set(d!, 11, 1, 0, 9, 3, "Pompki klasyczne")];
    const r = computeAchievements(base([a!, b!, c!, d!], { sets, ladder }));
    expect(keys(r, "ladder_step")).toEqual(["ladder_step:Pompki:2"]);
    expect(r.candidates.find((x) => x.kind === "ladder_step")!.title).toBe("Nowy szczebel: Pompki klasyczne");
    expect(r.candidates.find((x) => x.kind === "ladder_step")!.sessionId).toBe(c!.id);
  });
  it("a higher step done outside the plan gives nothing and does not move the baseline", () => {
    const [a, b] = week(0, 2) as [AchSession, AchSession];
    const sets = [set(a, 10, 1, 0, 10), set(b, 12, 1, 0, 3, null, "Pompki z wybiciem")];
    expect(keys(computeAchievements(base([a, b], { sets, ladder })), "ladder_step")).toEqual([]);
  });
});

describe("steps and monthly challenge", () => {
  it("a finished week with ≥ 5 entries whose average reaches the goal", () => {
    const days = (n: number, v: number) => Array.from({ length: n }, (_, i) => ({ day: shiftDate(MON, i), steps: v }));
    const ok = computeAchievements(base(week(0, 3), { stepsGoal: 8000, steps: days(5, 9000) }));
    expect(keys(ok, "steps_week")).toEqual([`steps_week:${MON}`]);
    expect(keys(computeAchievements(base(week(0, 3), { stepsGoal: 8000, steps: days(4, 12000) })), "steps_week")).toEqual([]); // too few entries
    expect(keys(computeAchievements(base(week(0, 3), { stepsGoal: 8000, steps: days(6, 5000) })), "steps_week")).toEqual([]); // below the goal
    expect(keys(computeAchievements(base(week(0, 3), { stepsGoal: null, steps: days(6, 20000) })), "steps_week")).toEqual([]); // no goal set
  });
  it("monthly challenge is optional and equals plan days × 4 counted trainings", () => {
    const sept = [0, 1, 2, 3].flatMap((w) => week(w, 3)); // 12 trainings, all in weeks starting in Sep (weeks 0–3: 7 Sep – 4 Oct)
    expect(keys(computeAchievements(base(sept)), "month_challenge")).toEqual([]);
    const on = computeAchievements(base(sept, { monthlyChallenge: true }));
    expect(keys(on, "month_challenge").length).toBe(1);
    expect(on.candidates.find((c) => c.kind === "month_challenge")!.title).toBe("Wyzwanie miesiąca: 12 treningów");
  });
});

describe("idempotence and choice of what to show", () => {
  it("running twice on the same history gives the same keys; duplicates of a session id change nothing", () => {
    const ss = [...week(0, 3), ...week(1, 3), ...week(2, 3)];
    const sets = [set(ss[0]!, 7, 1, 50, 8), set(ss[5]!, 7, 1, 55, 8)];
    const a = keys(computeAchievements(base(ss, { sets })));
    expect(keys(computeAchievements(base(ss, { sets })))).toEqual(a);
    expect(new Set(a).size).toBe(a.length);
  });
  it("shows the single most valuable award", () => {
    const earned = [{ priority: 2, id: "record" }, { priority: 5, id: "ladder" }, { priority: 4.002, id: "streak" }];
    expect(pickCelebration(earned)!.id).toBe("ladder");
    expect(pickCelebration([])).toBeNull();
  });

  it("decision 56: every award text is gender-neutral (no -łeś/-łaś forms, no slashes)", () => {
    const ss = [...Array.from({ length: 12 }, (_, w) => week(w, 3)).flat()];
    const sets = [set(ss[0]!, 7, 1, 50, 8), set(ss[5]!, 7, 1, 55, 8), set(ss[9]!, 10, 1, 0, 8, 3, "Pompki na kolanach"), set(ss[20]!, 11, 1, 0, 8, 3, "Pompki klasyczne")];
    const ladder = [{ exerciseId: 10, pattern: "Pompki", stepOrder: 1 }, { exerciseId: 11, pattern: "Pompki", stepOrder: 2 }];
    const r = computeAchievements(base(ss, { sets, ladder, monthlyChallenge: true, stepsGoal: 5000, steps: Array.from({ length: 6 }, (_, i) => ({ day: shiftDate(MON, i), steps: 9000 })) }));
    const kinds = new Set(r.candidates.map((c) => c.kind));
    for (const k of ["week_streak", "record", "milestone", "first_month", "ladder_step", "steps_week"]) expect(kinds.has(k as never), k).toBe(true);
    for (const c of r.candidates) expect(`${c.title} ${c.body ?? ""}`, c.kind).not.toMatch(/\p{L}+(?:łeś|łaś|łem|łam)\b|\/-?(?:aś|am)\b|\(a\)/u);
  });
});
