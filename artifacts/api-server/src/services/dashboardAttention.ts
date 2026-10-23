/**
 * Dashboard "Wymaga Twojej uwagi" and "Pierwsze kroki" — pure logic.
 * No database access here: the route loads rows, this module decides.
 *
 * Reasons available today (priority order = array order of ATTENTION_KINDS):
 *   interview     latest completed interview from the last 7 days and no plan
 *                 created since (there is no "reviewed" flag in the schema)
 *   no_plan       active client with an interview but no draft/active plan
 *   plan_ending   active plan whose end date is within 7 days (or has passed)
 *   invite_pending interview invitation unused for more than 3 days, not expired
 * Reasons that need saved workouts (pain, missed sessions, records) are not
 * built yet — see docs/ROADMAP.md item 4.
 */

export const ATTENTION_KINDS = ["interview", "no_plan", "plan_ending", "invite_pending"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const MAX_ATTENTION_ITEMS = 5;
const DAY_MS = 86_400_000;

export interface AttentionClient {
  id: number;
  firstName: string;
  lastName: string;
  status: string;
}
export interface AttentionSurvey {
  clientId: number;
  createdAt: Date;
  /** computeSurveyStatus(...) === "completed" */
  completed: boolean;
}
export interface AttentionPlan {
  id: number;
  clientId: number;
  status: string; // draft | active | archived
  createdAt: Date;
  endDate: string | null; // YYYY-MM-DD
}
export interface AttentionInvite {
  id: number;
  clientId: number | null;
  intendedEmail: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface AttentionItem {
  kind: AttentionKind;
  clientId: number | null;
  name: string;
  reasonLabel: string;
  description: string;
  /** ISO timestamp the reason refers to (survey / plan end / invite creation). */
  at: string;
  actionLabel: string;
  actionHref: string;
}

export interface AttentionInput {
  clients: AttentionClient[];
  /** Latest survey per client only. */
  surveys: AttentionSurvey[];
  plans: AttentionPlan[];
  invites: AttentionInvite[];
  /** Today's calendar day in Europe/Warsaw, YYYY-MM-DD. */
  today: string;
  now: Date;
}

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

export function buildAttention(input: AttentionInput): {
  items: AttentionItem[];
  total: number;
  byKind: Record<AttentionKind, number>;
} {
  const { clients, surveys, plans, invites, today, now } = input;
  const surveyOf = new Map(surveys.map((s) => [s.clientId, s]));
  const plansOf = new Map<number, AttentionPlan[]>();
  for (const p of plans) plansOf.set(p.clientId, [...(plansOf.get(p.clientId) ?? []), p]);

  type Ranked = AttentionItem & { sort: number };
  const perClient = new Map<number, Ranked>();
  const consider = (clientId: number, item: Ranked) => {
    const current = perClient.get(clientId);
    const rank = (i: Ranked) => ATTENTION_KINDS.indexOf(i.kind);
    if (!current || rank(item) < rank(current)) perClient.set(clientId, item);
  };

  const todayNo = dayNumber(today);
  for (const c of clients) {
    if (c.status !== "active") continue;
    const name = `${c.firstName} ${c.lastName}`.trim();
    const survey = surveyOf.get(c.id);
    const clientPlans = (plansOf.get(c.id) ?? []).filter((p) => p.status !== "archived");

    if (
      survey?.completed &&
      now.getTime() - survey.createdAt.getTime() <= 7 * DAY_MS &&
      !clientPlans.some((p) => p.createdAt.getTime() >= survey.createdAt.getTime())
    ) {
      consider(c.id, {
        kind: "interview",
        clientId: c.id,
        name,
        reasonLabel: "Nowy wywiad",
        description: "Klient wypełnił wywiad treningowy. Przejrzyj odpowiedzi.",
        at: survey.createdAt.toISOString(),
        actionLabel: "Przejrzyj",
        actionHref: `/clients/${c.id}`,
        sort: survey.createdAt.getTime(),
      });
    }

    if (survey && clientPlans.length === 0) {
      consider(c.id, {
        kind: "no_plan",
        clientId: c.id,
        name,
        reasonLabel: "Brak planu",
        description: "Klient ma wywiad, ale nie ma jeszcze planu treningowego.",
        at: survey.createdAt.toISOString(),
        actionLabel: "Przygotuj plan",
        actionHref: `/clients/${c.id}/plans/generate`,
        sort: survey.createdAt.getTime(),
      });
    }

    const ending = clientPlans
      .filter((p) => p.status === "active" && p.endDate && dayNumber(p.endDate) - todayNo <= 7)
      .sort((a, b) => (a.endDate! < b.endDate! ? -1 : 1))[0];
    if (ending?.endDate) {
      const left = dayNumber(ending.endDate) - todayNo;
      const description =
        left < 0
          ? "Plan już się zakończył."
          : left === 0
            ? "Plan kończy się dziś."
            : left === 1
              ? "Plan kończy się jutro."
              : `Plan kończy się za ${left} dni.`;
      consider(c.id, {
        kind: "plan_ending",
        clientId: c.id,
        name,
        reasonLabel: left < 0 ? "Plan zakończony" : "Koniec planu",
        description,
        at: `${ending.endDate}T00:00:00.000Z`,
        actionLabel: "Przedłuż plan",
        actionHref: `/plans/${ending.id}`,
        sort: Date.parse(`${ending.endDate}T00:00:00Z`),
      });
    }
  }

  const clientName = new Map(clients.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
  const inviteItems: Ranked[] = invites
    .filter(
      (i) =>
        now.getTime() - i.createdAt.getTime() > 3 * DAY_MS && i.expiresAt.getTime() > now.getTime(),
    )
    .map((i) => ({
      kind: "invite_pending" as const,
      clientId: i.clientId,
      name: (i.clientId && clientName.get(i.clientId)) || i.intendedEmail || "Zaproszenie bez adresu",
      reasonLabel: "Zaproszenie bez odpowiedzi",
      description: `Wysłane ${Math.floor((now.getTime() - i.createdAt.getTime()) / DAY_MS)} dni temu, wywiad niewypełniony.`,
      at: i.createdAt.toISOString(),
      actionLabel: "Przypomnij",
      actionHref: "/survey-invite",
      sort: i.createdAt.getTime(),
    }));

  const all = [...perClient.values(), ...inviteItems].sort(
    (a, b) => ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind) || a.sort - b.sort,
  );
  const byKind = { interview: 0, no_plan: 0, plan_ending: 0, invite_pending: 0 } as Record<AttentionKind, number>;
  for (const i of all) byKind[i.kind]++;
  return {
    total: all.length,
    byKind,
    items: all.slice(0, MAX_ATTENTION_ITEMS).map(({ sort: _sort, ...item }) => item),
  };
}

// ─── "Pierwsze kroki" ────────────────────────────────────────────────────────

export const ONBOARDING_STEPS = [
  { key: "account", title: "Załóż konto trenera" },
  { key: "invite", title: "Zaproś pierwszego klienta" },
  { key: "interview", title: "Przejrzyj odpowiedzi z wywiadu" },
  { key: "plan", title: "Przygotuj plan" },
  { key: "share", title: "Udostępnij plan klientowi" },
] as const;

export interface OnboardingFacts {
  anyInvitation: boolean;
  anyInterview: boolean;
  anyPlan: boolean;
  anyActivePlan: boolean;
}

export function buildOnboarding(f: OnboardingFacts) {
  const done: Record<(typeof ONBOARDING_STEPS)[number]["key"], boolean> = {
    account: true,
    invite: f.anyInvitation,
    interview: f.anyInterview,
    plan: f.anyPlan,
    share: f.anyActivePlan,
  };
  const steps = ONBOARDING_STEPS.map((s) => ({ key: s.key, title: s.title, done: done[s.key] }));
  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.key ?? null;
  return { steps, completed, total: steps.length, next };
}
