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
 *   hard_twice    the last two finished sessions were both rated "za ciężko" (block 8)
 *   silent        active plan, no finished session for N days (N = 7 / 10 / 14, set by the trainer) (block 8)
 *   package       active session package: 2 or fewer sessions left, no sessions left, validity ending/over (block 7 + 8)
 * Every reason can be marked "załatwione" (dismissal tied to a concrete event, `ref`): a NEW event brings the reason back.
 *   join_request  a person asked to join the trainer (link / code); action: go to the request (Ustawienia → Dołączanie podopiecznych)
 * It plugs in through `extraItems` (built by `joinRequestItems`).
 * Reasons that need saved workouts (pain, missed sessions, records) are not
 * built yet — see docs/ROADMAP.md item 4.
 */

import { packageReminders } from "./packages";

export const ATTENTION_KINDS = ["pain", "join_request", "hard_twice", "silent", "package", "interview", "no_plan", "plan_ending", "invite_pending"] as const;
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
  /** when the plan was activated (start of the "silent" count when the client has no finished session yet) */
  activatedAt?: Date | null;
}
export interface AttentionSession { clientId: number; id: number; /** YYYY-MM-DD */ date: string; rating: string | null }
export interface AttentionPackage { clientId: number; id: number; totalSessions: number; used: number; validUntil: string | null }
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
  /** Submission refused by the trainer's package limit (survey_invites.limit_blocked_at). */
  limitBlockedAt?: Date | null;
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
  /** concrete event the reason refers to; used to mark it "załatwione" (POST /dashboard/attention/dismiss) */
  ref: string;
}

export interface AttentionInput {
  clients: AttentionClient[];
  /** Latest survey per client only. */
  surveys: AttentionSurvey[];
  plans: AttentionPlan[];
  invites: AttentionInvite[];
  /** Unread pain reports (optional: older callers/tests pass none). */
  pains?: AttentionPain[];
  /** FINISHED sessions (any age; the logic looks at the newest ones). */
  sessions?: AttentionSession[];
  /** Active packages with the number of sessions used. */
  packages?: AttentionPackage[];
  /** Days without a finished session before "silent" (7, 10 or 14; default 7). */
  silenceDays?: number;
  /** "kind|ref" of reasons marked as done by the trainer. */
  dismissed?: ReadonlySet<string>;
  /** Reasons supplied by other modules (e.g. a request to join); already scoped to the trainer. */
  extraItems?: Array<AttentionItem & { sort?: number }>;
  /** Today's calendar day in Europe/Warsaw, YYYY-MM-DD. */
  today: string;
  now: Date;
}

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS);
}

export function buildAttention(input: AttentionInput): {
  items: AttentionItem[];
  allItems: AttentionItem[];
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
  const dismissed = input.dismissed ?? new Set<string>();
  const consider = (clientId: number, item: Ranked) => {
    if (dismissed.has(`${item.kind}|${item.ref}`)) return; // marked as done: the next reason of this client may surface
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
        ref: `${c.id}:${last.createdAt.toISOString()}`,
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
        ref: `${c.id}:${survey.createdAt.toISOString()}`,
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
        ref: `${c.id}:${survey.createdAt.toISOString()}`,
        sort: survey.createdAt.getTime(),
      });
    }

    // ── hard_twice: the last two finished sessions were both "za ciężko" ──
    const finished = (input.sessions ?? []).filter((x) => x.clientId === c.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
    if (finished.length >= 2 && finished[0]!.rating === "too_hard" && finished[1]!.rating === "too_hard") {
      consider(c.id, {
        kind: "hard_twice", clientId: c.id, name, reasonLabel: "Za ciężko 2 razy z rzędu",
        description: "Dwa ostatnie treningi oceniono jako „za ciężko”. Warto obniżyć obciążenie lub objętość.",
        at: `${finished[0]!.date}T00:00:00.000Z`, actionLabel: "Zobacz plan", actionHref: `/clients/${c.id}`,
        ref: `${c.id}:${finished[0]!.id}`, sort: -Date.parse(`${finished[0]!.date}T00:00:00Z`),
      });
    }

    // ── silent: active plan, no finished session for N days ──
    const silenceDays = [7, 10, 14].includes(input.silenceDays ?? 7) ? (input.silenceDays ?? 7) : 7;
    const activePlan = clientPlans.find((p) => p.status === "active");
    if (activePlan) {
      const started = (activePlan.activatedAt ?? activePlan.createdAt).toISOString().slice(0, 10);
      const lastDay = finished[0]?.date && finished[0].date > started ? finished[0].date : started;
      const days = todayNo - dayNumber(lastDay);
      if (days >= silenceDays) {
        consider(c.id, {
          kind: "silent", clientId: c.id, name, reasonLabel: "Cisza",
          description: finished.length > 0 ? `Brak treningu od ${days} dni.` : `Plan aktywny od ${days} dni, a klient nie zapisał jeszcze treningu.`,
          at: `${lastDay}T00:00:00.000Z`, actionLabel: "Zobacz profil", actionHref: `/clients/${c.id}`,
          ref: `${c.id}:${lastDay}`, sort: Date.parse(`${lastDay}T00:00:00Z`),
        });
      }
    }

    // ── package: few sessions left / used up / validity ──
    for (const pk of (input.packages ?? []).filter((x) => x.clientId === c.id)) {
      const reminders = packageReminders({ totalSessions: pk.totalSessions, validUntil: pk.validUntil, status: "active" }, pk.used, now);
      const worst = reminders[0];
      if (!worst) continue;
      consider(c.id, {
        kind: "package", clientId: c.id, name, reasonLabel: worst.code === "EXPIRING" || worst.code === "EXPIRED" ? "Kończy się ważność pakietu" : "Kończy się pakiet",
        description: reminders.map((r) => r.text).join(" "), at: now.toISOString(), actionLabel: "Zobacz pakiet", actionHref: `/clients/${c.id}`,
        ref: `${c.id}:${pk.id}:${worst.code}`, sort: 0,
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
        ref: `${c.id}:${ending.id}:${ending.endDate}`,
        sort: Date.parse(`${ending.endDate}T00:00:00Z`),
      });
    }
  }

  const clientName = new Map(clients.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
  const inviteItems: Ranked[] = invites
    .filter(
      (i) =>
        !i.limitBlockedAt && now.getTime() - i.createdAt.getTime() > 3 * DAY_MS && i.expiresAt.getTime() > now.getTime() &&
        !dismissed.has(`invite_pending|${i.clientId ?? 0}:${i.id}`),
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
      ref: `${i.clientId ?? 0}:${i.id}`,
      sort: i.createdAt.getTime(),
    }));

  const extra: Ranked[] = (input.extraItems ?? [])
    .filter((e) => !dismissed.has(`${e.kind}|${e.ref}`))
    .map((e) => ({ ...e, sort: e.sort ?? 0 }));
  const all = [...perClient.values(), ...inviteItems, ...extra].sort(
    (a, b) => ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind) || a.sort - b.sort,
  );
  const byKind = Object.fromEntries(ATTENTION_KINDS.map((k) => [k, 0])) as Record<AttentionKind, number>;
  for (const i of all) byKind[i.kind]++;
  return {
    total: all.length,
    byKind,
    items: all.slice(0, MAX_ATTENTION_ITEMS).map(({ sort: _sort, ...item }) => item),
    /** everything, for "Pokaż wszystkie" */
    allItems: all.map(({ sort: _sort, ...item }) => item),
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

// ─── Prośba o dołączenie (link / kod trenera) ────────────────────────────────

export interface PendingJoinRequest { id: number; firstName: string; createdAt: Date }

/** Prośby o dołączenie czekające na decyzję trenera → pozycje „Wymaga uwagi”. Akcja: przejście do próśb w Ustawieniach. */
export function joinRequestItems(requests: readonly PendingJoinRequest[]): Array<AttentionItem & { sort: number }> {
  return requests.map((r) => ({
    kind: "join_request" as const,
    clientId: null,
    name: r.firstName,
    reasonLabel: "Prośba o dołączenie",
    description: "Chce dołączyć do Twoich podopiecznych. Zaakceptuj albo odrzuć.",
    at: r.createdAt.toISOString(),
    actionLabel: "Przejdź do prośby",
    actionHref: "/settings#dolaczanie",
    ref: String(r.id),
    sort: r.createdAt.getTime(),
  }));
}

/** Wywiad nie wszedł przez limit pakietu trenera → pozycja „Wymaga uwagi” (zaproszenie zostaje ważne, osoba może spróbować ponownie). */
export function limitBlockedInviteItems(invites: ReadonlyArray<AttentionInvite & { clientName?: string | null }>): Array<AttentionItem & { sort: number }> {
  return invites
    .filter((i) => i.limitBlockedAt)
    .map((i) => ({
      kind: "invite_pending" as const,
      clientId: i.clientId,
      name: i.clientName || i.intendedEmail || "Zaproszenie bez adresu",
      reasonLabel: "Wywiad nie wszedł",
      description: "Osoba wypełniła wywiad, ale limit pakietu go zatrzymał. Zmień pakiet albo zwolnij miejsce.",
      at: i.limitBlockedAt!.toISOString(),
      actionLabel: "Zobacz pakiet",
      actionHref: "/settings",
      ref: `limit:${i.id}:${i.limitBlockedAt!.getTime()}`,
      sort: i.limitBlockedAt!.getTime(),
    }));
}
