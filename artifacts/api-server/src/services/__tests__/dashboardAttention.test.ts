import { describe, it, expect } from "vitest";
import { buildAttention, buildOnboarding, type AttentionInput } from "../dashboardAttention";

const NOW = new Date("2026-10-22T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const client = (id: number, status = "active") => ({ id, firstName: `K${id}`, lastName: "Test", status });

function input(over: Partial<AttentionInput>): AttentionInput {
  return { clients: [], surveys: [], plans: [], invites: [], today: "2026-10-22", now: NOW, ...over };
}

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
        plans: [{ id: 9, clientId: 3, status: "active", createdAt: daysAgo(40), endDate: "2026-10-25" }],
        invites: [{ id: 1, clientId: null, intendedEmail: "a@b.pl", createdAt: daysAgo(5), expiresAt: new Date(NOW.getTime() + 86_400_000) }],
      }),
    );
    expect(r.items.map((i) => i.kind)).toEqual(["interview", "no_plan", "plan_ending", "invite_pending"]);
    expect(r.items.map((i) => i.actionLabel)).toEqual(["Przejrzyj", "Przygotuj plan", "Przedłuż plan", "Przypomnij"]);
    expect(r.byKind).toEqual({ interview: 1, no_plan: 1, plan_ending: 1, invite_pending: 1 });
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
    const mk = (id: number, end: string) => ({ id, clientId: id, status: "active", createdAt: daysAgo(60), endDate: end });
    const r = buildAttention(
      input({
        clients: [client(1), client(2), client(3), client(4)],
        plans: [mk(1, "2026-10-29"), mk(2, "2026-10-30"), mk(3, "2026-10-20"), mk(4, "2026-10-22")],
      }),
    );
    expect(r.items.map((i) => i.clientId)).toEqual([3, 4, 1]); // soonest first
    expect(r.items[0].reasonLabel).toBe("Plan zakończony");
    expect(r.items[1].description).toBe("Plan kończy się dziś.");
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

describe("buildOnboarding", () => {
  it("only the account step is done for a brand new trainer; next is the invite", () => {
    const o = buildOnboarding({ anyInvitation: false, anyInterview: false, anyPlan: false, anyActivePlan: false });
    expect(o.completed).toBe(1);
    expect(o.total).toBe(5);
    expect(o.next).toBe("invite");
  });
  it("derives each step from facts", () => {
    const o = buildOnboarding({ anyInvitation: true, anyInterview: true, anyPlan: true, anyActivePlan: false });
    expect(o.steps.map((s) => s.done)).toEqual([true, true, true, true, false]);
    expect(o.next).toBe("share");
  });
  it("all done → no next step", () => {
    const o = buildOnboarding({ anyInvitation: true, anyInterview: true, anyPlan: true, anyActivePlan: true });
    expect(o).toMatchObject({ completed: 5, next: null });
  });
});
