/**
 * Dashboard "Wymaga Twojej uwagi" and "Pierwsze kroki" — pure logic.
 * No database access here: the route loads rows, this module decides.
 *
 * Reasons available today (priority order = array order of ATTENTION_KINDS):
 *   pain          unread "Coś boli?" report from the client (trainer marks it read)
 *   interview     latest completed interview from the last 7 days and no plan
 *                 created since (there is no "reviewed" flag in the schema)
 *   no_plan       active client with an interview but no draft/active plan
 *   plan_ending   active plan whose end date is within 7 days (or has passed)
 *   invite_pending interview invitation unused for more than 3 days, not expired
 * Reasons that need saved workouts (pain, missed sessions, records) are not
 * built yet — see docs/ROADMAP.md item 4.
 */

export const ATTENTION_KINDS = ["pain", "interview", "no_plan", "plan_ending", "invite_pending"] as const;
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
export interface AttentionPain {
  clientId: number;
  createdAt: Date;
  area: string;
  severity: number;
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
  /** Unread pain reports (optional: older callers/tests pass none). */
  pains?: AttentionPain[];
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
  const pains = input.pains ?? [];
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

    const clientPains = pains.filter((p) => p.clientId === c.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (clientPains.length > 0) {
      const last = clientPains[0]!;
      consider(c.id, {
        kind: "pain",
        clientId: c.id,
        name,
        reasonLabel: "Zgłoszony ból",
        description:
          clientPains.length > 1
            ? `${clientPains.length} nowe zgłoszenia, ostatnie: ${last.area}, siła ${last.severity}/5.`
            : `${last.area}, siła ${last.severity}/5. Klient pominął to ćwiczenie.`,
        at: last.createdAt.toISOString(),
        actionLabel: "Odpowiedz",
        actionHref: `/clients/${c.id}?tab=treningi`,
        sort: -last.createdAt.getTime(),
      });
    }

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
      const [, mm, dd] = ending.endDate.split("-");
      const description = `Data zakończenia planu: ${dd}.${mm}.`;
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
  const byKind = { pain: 0, interview: 0, no_plan: 0, plan_ending: 0, invite_pending: 0 } as Record<AttentionKind, number>;
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

/** Where each step is done. Ids come from the trainer's own rows (caller-scoped). */
export interface OnboardingTargets {
  /** Client with the newest interview. */
  interviewClientId: number | null;
  /** Client to build a plan for: interview but no plan yet, else any client with an interview. */
  planClientId: number | null;
  /** A draft plan waiting for activation. */
  draftPlanId: number | null;
  /** Client with an active plan (portal invitation card). */
  activePlanClientId: number | null;
}

/** ?krok=N makes the target screen show a short, dismissible tip. */
export function onboardingHref(key: (typeof ONBOARDING_STEPS)[number]["key"], t: OnboardingTargets): string | null {
  switch (key) {
    case "account":
      return null;
    case "invite":
      return "/survey-invite?krok=2";
    case "interview":
      return t.interviewClientId ? `/clients/${t.interviewClientId}?krok=3` : "/clients?krok=3";
    case "plan":
      return t.planClientId ? `/clients/${t.planClientId}/plans/generate?krok=4` : "/clients?krok=4";
    case "share":
      if (t.draftPlanId) return `/plans/${t.draftPlanId}?krok=5`;
      return t.activePlanClientId ? `/clients/${t.activePlanClientId}?krok=5` : "/clients?krok=5";
  }
}

export function buildOnboarding(f: OnboardingFacts, targets: OnboardingTargets) {
  const done: Record<(typeof ONBOARDING_STEPS)[number]["key"], boolean> = {
    account: true,
    invite: f.anyInvitation,
    interview: f.anyInterview,
    plan: f.anyPlan,
    share: f.anyActivePlan,
  };
  const steps = ONBOARDING_STEPS.map((s) => ({
    key: s.key,
    title: s.title,
    done: done[s.key],
    href: onboardingHref(s.key, targets),
  }));
  const completed = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done)?.key ?? null;
  return { steps, completed, total: steps.length, next };
}
