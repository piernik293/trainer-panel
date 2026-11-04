/**
 * Katalog osiągnięć do ekranu „Postępy” (nowy wygląd): zdobyte → w toku (najbliższy próg każdej serii, z postępem) → zablokowane (nazwa widoczna).
 * Czysta funkcja, bez bazy. Bez rankingów i porównań; postęp liczy tylko treningi w ramach planu (jak silnik osiągnięć).
 */
import { FIRST_MONTH_DAYS, SESSION_MILESTONES, STREAK_MILESTONES } from "./achievements";

export type CatalogueState = "earned" | "progress" | "locked";
export interface CatalogueItem {
  id: string; kind: string; title: string; hint: string; state: CatalogueState;
  /** only for "progress": value and target (e.g. 8 / 10) */
  progress: { value: number; target: number } | null;
  earnedAt: string | null; seen: boolean;
}
export interface EarnedRow { id: number; kind: string; key: string; title: string; body: string | null; earnedAt: string; seen: boolean }

const plural = (n: number, a: string, b: string, c: string) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? b : c);
const sessionTitle = (t: number) => (t === 1 ? "Pierwszy trening" : `${t} ${plural(t, "trening", "treningi", "treningów")}`);
const streakTitle = (t: number) => `${t} ${plural(t, "tydzień", "tygodnie", "tygodni")} z rzędu`;

export function buildCatalogue(earned: readonly EarnedRow[], sessionCount: number, streakWeeks: number): { items: CatalogueItem[]; earnedCount: number; total: number } {
  const have = new Map(earned.map((e) => [`${e.kind}:${e.key}`, e]));
  const out: CatalogueItem[] = [];
  const addSeries = (kind: string, targets: readonly number[], value: number, title: (t: number) => string, hint: (t: number) => string) => {
    let nextShown = false;
    for (const t of targets) {
      const e = have.get(`${kind}:${t}`);
      if (e) { out.push({ id: `${kind}:${t}`, kind, title: title(t), hint: hint(t), state: "earned", progress: null, earnedAt: e.earnedAt, seen: e.seen }); continue; }
      const inProgress = !nextShown;
      nextShown = true;
      out.push({ id: `${kind}:${t}`, kind, title: title(t), hint: hint(t), state: inProgress ? "progress" : "locked", progress: inProgress ? { value: Math.min(value, t - 1), target: t } : null, earnedAt: null, seen: true });
    }
  };
  addSeries("milestone", SESSION_MILESTONES, sessionCount, sessionTitle, (t) => `Zrób ${t} ${plural(t, "trening", "treningi", "treningów")} z planu.`);
  addSeries("week_streak", STREAK_MILESTONES, streakWeeks, streakTitle, (t) => `Zrób cały plan ${t} ${plural(t, "tydzień", "tygodnie", "tygodni")} z rzędu.`);

  const fm = have.get("first_month:first_month");
  out.push({ id: "first_month", kind: "first_month", title: "Pierwszy miesiąc", hint: `Trenuj regularnie przez ${FIRST_MONTH_DAYS} dni.`, state: fm ? "earned" : "locked", progress: null, earnedAt: fm?.earnedAt ?? null, seen: fm?.seen ?? true });

  const records = earned.filter((e) => e.kind === "record");
  const firstRecord = records.length ? records[records.length - 1]! : null; // rows are newest first: the last one is the first record
  out.push({ id: "record", kind: "record", title: "Pierwszy rekord", hint: "Pobij swój wynik w ćwiczeniu z planu.", state: firstRecord ? "earned" : "locked", progress: null, earnedAt: firstRecord?.earnedAt ?? null, seen: firstRecord?.seen ?? true });

  // Ladder steps and steps weeks exist only once earned (they depend on the person's own plan).
  for (const e of earned.filter((x) => x.kind === "ladder_step" || x.kind === "steps_week" || x.kind === "month_challenge")) {
    out.push({ id: `${e.kind}:${e.key}`, kind: e.kind, title: e.title.replace(/^Nowy szczebel: /, ""), hint: e.body ?? "", state: "earned", progress: null, earnedAt: e.earnedAt, seen: e.seen });
  }

  const rank: Record<CatalogueState, number> = { earned: 0, progress: 1, locked: 2 };
  const items = out.map((x, i) => ({ x, i })).sort((a, b) => rank[a.x.state] - rank[b.x.state] || (a.x.state === "earned" ? (b.x.earnedAt ?? "").localeCompare(a.x.earnedAt ?? "") : a.i - b.i)).map((o) => o.x);
  return { items, earnedCount: items.filter((i) => i.state === "earned").length, total: items.length };
}
