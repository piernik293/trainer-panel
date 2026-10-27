import { describe, it, expect } from "vitest";
import { buildAttention, buildOnboarding, type AttentionInput, type OnboardingTargets } from "../dashboardAttention";

const NOW = new Date("2026-10-22T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const client = (id: number, status = "active") => ({ id, firstName: `K${id}`, lastName: "Test", status });

function input(over: Partial<AttentionInput>): AttentionInput {
  return { clients: [], surveys: [], plans: [], invites: [], today: "2026-10-22", now: NOW, ...over };
}

describe("buildAttention — silence, 'za ciężko', packages, done (block 8)", () => {
  const activePlan = (clientId: number, activatedDaysAgo: number, id = clientId) => ({ id, clientId, status: "active", createdAt: daysAgo(activatedDaysAgo + 1), activatedAt: daysAgo(activatedDaysAgo), endDate: null });
  const sess = (clientId: number, id: number, daysBack: number, rating: string | null = null) => ({ clientId, id, date: daysAgo(daysBack).toISOString().slice(0, 10), rating });

  it("silent: threshold 7 / 10 / 14 days from the last finished session; a client who trained recently is not listed", () => {
    const base = { clients: [client(1), client(2)], plans: [activePlan(1, 30), activePlan(2, 30)], sessions: [sess(1, 1, 8), sess(2, 2, 2)] };
    expect(buildAttention(input({ ...base, silenceDays: 7 })).items.map((i) => [i.clientId, i.kind])).toEqual([[1, "silent"]]);
    expect(buildAttention(input({ ...base, silenceDays: 10 })).total).toBe(0);
    expect(buildAttention(input({ ...base, sessions: [sess(1, 1, 11), sess(2, 2, 2)], silenceDays: 10 })).items[0]).toMatchObject({ kind: "silent", description: "Brak treningu od 11 dni." });
    expect(buildAttention(input({ ...base, sessions: [sess(1, 1, 13), sess(2, 2, 2)], silenceDays: 14 })).total).toBe(0);
    expect(buildAttention(input({ ...base, sessions: [sess(1, 1, 15), sess(2, 2, 2)], silenceDays: 14 })).total).toBe(1);
  });
  it("silent: no finished session yet counts from the plan activation; an invalid threshold falls back to 7; no active plan → nothing", () => {
    expect(buildAttention(input({ clients: [client(1)], plans: [activePlan(1, 9)], silenceDays: 7 })).items[0]).toMatchObject({ kind: "silent" });
    expect(buildAttention(input({ clients: [client(1)], plans: [activePlan(1, 3)], silenceDays: 7 })).total).toBe(0);
    expect(buildAttention(input({ clients: [client(1)], plans: [activePlan(1, 9)], silenceDays: 99 })).total).toBe(1);
    expect(buildAttention(input({ clients: [client(1)], plans: [{ ...activePlan(1, 30), status: "draft" }] })).items.map((i) => i.kind)).not.toContain("silent");
  });
  it("hard_twice: only when the TWO latest finished sessions are both too_hard", () => {
    const mk = (r: Array<string | null>) => buildAttention(input({ clients: [client(1)], plans: [activePlan(1, 1)], sessions: r.map((x, i) => sess(1, i + 1, i + 1, x)) }));
    expect(mk(["too_hard", "too_hard", "just_right"]).items[0]).toMatchObject({ kind: "hard_twice", reasonLabel: "Za ciężko 2 razy z rzędu" });
    expect(mk(["too_hard", "just_right", "too_hard"]).total).toBe(0);
    expect(mk(["too_hard"]).total).toBe(0);
    expect(mk([null, "too_hard", "too_hard"]).total).toBe(0);
  });
  it("package: 2 or fewer left, used up, ending validity; plenty left → nothing", () => {
    const pk = (used: number, validUntil: string | null = null) => buildAttention(input({ clients: [client(1)], plans: [activePlan(1, 1)], packages: [{ clientId: 1, id: 5, totalSessions: 10, used, validUntil }] }));
    expect(pk(5).total).toBe(0);
    expect(pk(8).items[0]).toMatchObject({ kind: "package", description: "Zostały 2 sesje w pakiecie." });
    expect(pk(10).items[0].description).toContain("wykorzystany");
    expect(pk(0, "2026-10-25").items[0]).toMatchObject({ kind: "package", reasonLabel: "Kończy się ważność pakietu" });
    expect(pk(0, "2026-12-01").total).toBe(0);
  });
  it("marking as done hides exactly that event; a new event (other ref) brings the reason back; the client's next reason surfaces", () => {
    const base = { clients: [client(1)], plans: [activePlan(1, 30)], sessions: [sess(1, 1, 9)], packages: [{ clientId: 1, id: 5, totalSessions: 10, used: 9, validUntil: null }] };
    const first = buildAttention(input(base));
    expect(first.items[0].kind).toBe("silent"); // silent outranks package
    const dismissed = new Set([`silent|${first.items[0].ref}`]);
    const next = buildAttention(input({ ...base, dismissed }));
    expect(next.items.map((i) => i.kind)).toEqual(["package"]);
    // a new training and a new silence → another ref → shown again
    const later = buildAttention(input({ ...base, sessions: [sess(1, 2, 8), ...base.sessions], dismissed }));
    expect(later.items[0].kind).toBe("silent"); expect(later.items[0].ref).not.toBe(first.items[0].ref);
  });
  it("byKind counts every kind; allItems lists more than the 5 shown; extraItems plug in", () => {
    const cl = [1, 2, 3, 4, 5, 6, 7].map((i) => client(i));
    const r = buildAttention(input({ clients: cl, plans: cl.map((c) => activePlan(c.id, 20)), silenceDays: 7 }));
    expect(r.items).toHaveLength(5); expect(r.allItems).toHaveLength(7); expect(r.total).toBe(7); expect(r.byKind.silent).toBe(7);
    const ex = buildAttention(input({ extraItems: [{ kind: "interview", clientId: 9, name: "X", reasonLabel: "Prośba", description: "d", at: NOW.toISOString(), actionLabel: "a", actionHref: "/x", ref: "9:req" }] }));
    expect(ex.total).toBe(1);
  });
});

describe("buildAttention", () => {
  it("is empty without data", () => {
    expect(buildAttention(input({}))).toMatchObject({ items: [], total: 0 });
  });

  it("orders reasons: interview, no plan, plan ending, pending invite", () => {
    const r = buildAttention(
      input({
        clients: [client(1), client(2), client(3)],
        surveys: [
          { clientId: 1, createdAt: daysAgo(1), completed: true }, // new interview, no plan
          { clientId: 2, createdAt: daysAgo(30), completed: true }, // old interview, no plan
        ],
        plans: [{ id: 9, clientId: 3, status: "active", createdAt: daysAgo(40), activatedAt: daysAgo(1), endDate: "2026-10-25" }],
        invites: [{ id: 1, clientId: null, intendedEmail: "a@b.pl", createdAt: daysAgo(5), expiresAt: new Date(NOW.getTime() + 86_400_000) }],
      }),
    );
    expect(r.items.map((i) => i.kind)).toEqual(["interview", "no_plan", "plan_ending", "invite_pending"]);
    expect(r.items.map((i) => i.actionLabel)).toEqual(["Przejrzyj", "Przygotuj plan", "Przedłuż plan", "Przypomnij"]);
    expect(r.byKind).toEqual({ pain: 0, join_request: 0, hard_twice: 0, silent: 0, package: 0, interview: 1, no_plan: 1, plan_ending: 1, invite_pending: 1 });
  });

  it("shows one row per client, the most urgent reason", () => {
    const r = buildAttention(
      input({ clients: [client(1)], surveys: [{ clientId: 1, createdAt: daysAgo(1), completed: true }] }),
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].kind).toBe("interview");
  });

  it("no interview row once a plan was created after the survey", () => {
    const r = buildAttention(
      input({
        clients: [client(1)],
        surveys: [{ clientId: 1, createdAt: daysAgo(2), completed: true }],
        plans: [{ id: 1, clientId: 1, status: "draft", createdAt: daysAgo(1), endDate: null }],
      }),
    );
    expect(r.total).toBe(0);
  });

  it("ignores clients without a survey, archived plans do not count as a plan, inactive clients are skipped", () => {
    const r = buildAttention(
      input({
        clients: [client(1), client(2), client(3, "paused")],
        surveys: [
          { clientId: 2, createdAt: daysAgo(20), completed: false },
          { clientId: 3, createdAt: daysAgo(20), completed: true },
        ],
        plans: [{ id: 1, clientId: 2, status: "archived", createdAt: daysAgo(10), endDate: null }],
      }),
    );
    expect(r.items.map((i) => i.clientId)).toEqual([2]);
    expect(r.items[0].kind).toBe("no_plan");
  });

  it("plan ending: within 7 days or already over; not later", () => {
    const mk = (id: number, end: string) => ({ id, clientId: id, status: "active", createdAt: daysAgo(60), activatedAt: daysAgo(1), endDate: end });
    const r = buildAttention(
      input({
        clients: [client(1), client(2), client(3), client(4)],
        plans: [mk(1, "2026-10-29"), mk(2, "2026-10-30"), mk(3, "2026-10-20"), mk(4, "2026-10-22")],
      }),
    );
    expect(r.items.map((i) => i.clientId)).toEqual([3, 4, 1]); // soonest first
    expect(r.items[0].reasonLabel).toBe("Plan zakończony");
    expect(r.items[1].description).toBe("Data zakończenia planu: 22.10.");
  });

  it("invites: only older than 3 days and not expired", () => {
    const exp = new Date(NOW.getTime() + 86_400_000);
    const r = buildAttention(
      input({
        invites: [
          { id: 1, clientId: null, intendedEmail: null, createdAt: daysAgo(2), expiresAt: exp },
          { id: 2, clientId: null, intendedEmail: "x@y.pl", createdAt: daysAgo(4), expiresAt: exp },
          { id: 3, clientId: null, intendedEmail: "z@y.pl", createdAt: daysAgo(9), expiresAt: daysAgo(1) },
        ],
      }),
    );
    expect(r.items.map((i) => i.name)).toEqual(["x@y.pl"]);
  });

  it("returns at most 5 items but reports the real total", () => {
    const clients = Array.from({ length: 8 }, (_, i) => client(i + 1));
    const surveys = clients.map((c) => ({ clientId: c.id, createdAt: daysAgo(1), completed: true }));
    const r = buildAttention(input({ clients, surveys }));
    expect(r.items).toHaveLength(5);
    expect(r.total).toBe(8);
  });
});

const NO_TARGETS: OnboardingTargets = { interviewClientId: null, planClientId: null, draftPlanId: null, activePlanClientId: null };

describe("buildOnboarding", () => {
  it("only the account step is done for a brand new trainer; next is the invite", () => {
    const o = buildOnboarding({ anyInvitation: false, anyInterview: false, anyPlan: false, anyActivePlan: false }, NO_TARGETS);
    expect(o.completed).toBe(1);
    expect(o.total).toBe(5);
    expect(o.next).toBe("invite");
  });
  it("derives each step from facts", () => {
    const o = buildOnboarding({ anyInvitation: true, anyInterview: true, anyPlan: true, anyActivePlan: false }, NO_TARGETS);
    expect(o.steps.map((s) => s.done)).toEqual([true, true, true, true, false]);
    expect(o.next).toBe("share");
  });
  it("all done → no next step", () => {
    const o = buildOnboarding({ anyInvitation: true, anyInterview: true, anyPlan: true, anyActivePlan: true }, NO_TARGETS);
    expect(o).toMatchObject({ completed: 5, next: null });
  });
});

describe("onboarding links (each step points to where it is done)", () => {
  const facts = { anyInvitation: false, anyInterview: false, anyPlan: false, anyActivePlan: false };
  const hrefs = (t: OnboardingTargets) => buildOnboarding(facts, t).steps.map((s) => s.href);

  it("without clients: invite screen, then the client list", () => {
    expect(hrefs(NO_TARGETS)).toEqual([null, "/survey-invite?krok=2", "/clients?krok=3", "/clients?krok=4", "/clients?krok=5"]);
  });
  it("with data: client profile, generator for that client, plan to activate", () => {
    expect(hrefs({ interviewClientId: 7, planClientId: 8, draftPlanId: 31, activePlanClientId: null })).toEqual([
      null, "/survey-invite?krok=2", "/clients/7?krok=3", "/clients/8/plans/generate?krok=4", "/plans/31?krok=5",
    ]);
  });
  it("no draft but an active plan: client page (portal invitation)", () => {
    expect(hrefs({ ...NO_TARGETS, activePlanClientId: 9 })[4]).toBe("/clients/9?krok=5");
  });
});

describe("pain reports in attention", () => {
  const base = {
    clients: [{ id: 1, firstName: "Ala", lastName: "K", status: "active" }, { id: 2, firstName: "Ola", lastName: "M", status: "active" }],
    surveys: [], plans: [], invites: [], today: "2026-10-23", now: new Date("2026-10-23T12:00:00Z"),
  };
  it("unread pain comes first and replaces other reasons for that client", () => {
    const r = buildAttention({
      ...base,
      surveys: [{ clientId: 1, createdAt: new Date("2026-10-22T10:00:00Z"), completed: true }],
      pains: [{ clientId: 1, createdAt: new Date("2026-10-23T08:00:00Z"), area: "Bark", severity: 4 }],
    });
    expect(r.items[0]).toMatchObject({ kind: "pain", clientId: 1, reasonLabel: "Zgłoszony ból", actionLabel: "Odpowiedz", actionHref: "/clients/1?tab=treningi" });
    expect(r.items.filter((i) => i.clientId === 1)).toHaveLength(1);
    expect(r.byKind.pain).toBe(1);
  });
  it("several reports are summarised; no wording is diagnostic", () => {
    const r = buildAttention({
      ...base,
      pains: [
        { clientId: 2, createdAt: new Date("2026-10-22T08:00:00Z"), area: "Kolano", severity: 2 },
        { clientId: 2, createdAt: new Date("2026-10-23T08:00:00Z"), area: "Biodro", severity: 3 },
      ],
    });
    expect(r.items[0]!.description).toBe("2 nowe zgłoszenia, ostatnie: Biodro, siła 3/5.");
  });
  it("without the pains input nothing changes", () => {
    expect(buildAttention(base).total).toBe(0);
  });
});
