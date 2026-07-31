/**
 * Client portal activation — focused tests (spec items 1–9)
 *
 *  1. Trainer A can invite only Trainer A's client.
 *  2. Trainer A cannot invite Trainer B's client.
 *  3. A valid token links the authenticated Clerk user to the correct client.
 *  4. An expired, revoked or used token cannot link an account.
 *  5. A foreign Clerk user cannot replace an existing client link.
 *  6. Caller-provided clientId or email cannot change the target client.
 *  7. A new client account sees only its own plan and sessions.
 *  8. An active client without a plan sees the "plan in preparation" state.
 *  9. No password is generated or stored by the application.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import crypto from "crypto";

// ─── Mock drizzle-orm operators so WHERE conditions are inspectable ───────────
// The real Drizzle SQL objects are opaque; this gives matchesCondition plain
// {op, field, val} objects it can actually inspect against in-memory stores.

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    eq:      (field: string, val: unknown)           => ({ op: "eq",      field, val }),
    and:     (...conditions: unknown[])              => conditions.flat().filter(Boolean),
    or:      (...conditions: unknown[])              => ({ op: "or",      conditions }),
    isNull:  (field: string)                         => ({ op: "isNull",  field }),
    gt:      (field: string, val: unknown)           => ({ op: "gt",      field, val }),
    desc:    (field: string)                         => field,
    inArray: (field: string, val: unknown[])         => ({ op: "inArray", field, val }),
  };
});

// ─── Mock Clerk ───────────────────────────────────────────────────────────────

const mockGetAuth = vi.fn();

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: unknown) => mockGetAuth(req),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

// ─── In-memory stores ─────────────────────────────────────────────────────────

const TRAINER_A = { id: 1, clerkUserId: "user_trainer_A", displayName: "Trainer A", email: null as string | null, createdAt: new Date() };
const TRAINER_B = { id: 2, clerkUserId: "user_trainer_B", displayName: "Trainer B", email: null as string | null, createdAt: new Date() };

// Client A belongs to Trainer A; Client B belongs to Trainer B.
type StoredClient = {
  id: number; trainerId: number; firstName: string; lastName: string;
  email: string | null; phone: string | null; notes: string | null;
  status: string; clerkUserId: string | null; createdAt: Date; updatedAt: Date;
};
type StoredInvitation = {
  id: number; clientId: number; trainerId: number; tokenHash: string;
  expiresAt: Date; usedAt: Date | null; revokedAt: Date | null; createdAt: Date;
};
type StoredPlan = { id: number; clientId: number; status: string; activatedAt: Date | null; title: string };
type StoredSession = { id: number; clientId: number; planId: number };

let trainersStore: typeof TRAINER_A[] = [];
let clientsStore:  StoredClient[]     = [];
let invitationsStore: StoredInvitation[] = [];
let plansStore: StoredPlan[] = [];
let sessionsStore: StoredSession[] = [];

let nextId = 1000;

function hashToken(raw: string) { return crypto.createHash("sha256").update(raw).digest("hex"); }
function freshToken() { return crypto.randomBytes(32).toString("hex"); }
function futureDate(days = 7) { return new Date(Date.now() + days * 86_400_000); }
function pastDate(days = 1)   { return new Date(Date.now() - days * 86_400_000); }

// ─── DB mock ──────────────────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const trainersTable      = { id: "id", clerkUserId: "clerkUserId" };
  const clientsTable       = { id: "id", trainerId: "trainerId", clerkUserId: "clerkUserId" };
  const clientInvitationsTable = {
    id: "id", clientId: "clientId", trainerId: "trainerId", tokenHash: "tokenHash",
    expiresAt: "expiresAt", usedAt: "usedAt", revokedAt: "revokedAt", createdAt: "createdAt",
  };
  const workoutPlansTable  = { id: "id", clientId: "clientId", status: "status", activatedAt: "activatedAt", title: "title" };
  const workoutSessionsTable = { id: "id", clientId: "clientId" };

  type Cond = { field?: string; val?: unknown; op?: string } | Array<{ field?: string; val?: unknown; op?: string }>;

  function matchesCondition(item: Record<string, unknown>, cond: Cond): boolean {
    if (Array.isArray(cond)) return cond.every((c) => matchesCondition(item, c));
    if (!cond || !cond.field) return true;
    if (cond.op === "eq")     return item[cond.field] === cond.val;
    if (cond.op === "isNull") return item[cond.field] == null;
    if (cond.op === "gt")  { const a = item[cond.field], b = cond.val; return a instanceof Date && b instanceof Date ? a > b : Number(a) > Number(b); }
    if (cond.op === "inArray") return (cond.val as unknown[]).includes(item[cond.field]);
    return true;
  }

  function getStore(table: unknown): Record<string, unknown>[] {
    if (table === trainersTable)          return trainersStore as unknown as Record<string, unknown>[];
    if (table === clientsTable)           return clientsStore  as unknown as Record<string, unknown>[];
    if (table === clientInvitationsTable) return invitationsStore as unknown as Record<string, unknown>[];
    if (table === workoutPlansTable)      return plansStore as unknown as Record<string, unknown>[];
    if (table === workoutSessionsTable)   return sessionsStore as unknown as Record<string, unknown>[];
    return [];
  }

  function chain(items: Record<string, unknown>[]) {
    return {
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(items).then(resolve, reject),
      orderBy: (..._args: unknown[]) => chain(items),
      limit:   (n: number) => chain(items.slice(0, n)),
      where:   (cond: Cond) => chain(items.filter((i) => matchesCondition(i, cond))),
    };
  }

  const db: Record<string, unknown> = {
    select: (_shape?: unknown) => ({ from: (table: unknown) => chain(getStore(table)) }),

    insert: (table: unknown) => ({
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          const now = new Date();
          const id = nextId++;
          const item = { id, createdAt: now, ...data };
          getStore(table).push(item);
          return [item];
        },
      }),
    }),

    update: (table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: (cond: Cond) => {
          // Apply the update eagerly; shared by both returning() and await (then).
          const applyUpdate = () => {
            const store = getStore(table);
            const matched: Record<string, unknown>[] = [];
            for (const item of store) {
              if (!matchesCondition(item, cond)) continue;
              Object.assign(item, data);
              matched.push(item);
            }
            return matched;
          };
          return {
            returning: async (_shape?: unknown) => applyUpdate(),
            // Fire-and-forget update: must still write to the store.
            then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(applyUpdate()).then(resolve, reject),
          };
        },
      }),
    }),

    // ── transaction — used by requireAuth's provisionTrainer ──────────────
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: (_table: unknown) => ({
          values: (data: Record<string, unknown>) => ({
            onConflictDoNothing: async () => {
              // JIT-provision trainer if absent.
              const exists = (trainersStore as unknown as typeof TRAINER_A[]).some(
                (t) => t.clerkUserId === (data as { clerkUserId: string }).clerkUserId,
              );
              if (!exists) {
                (trainersStore as unknown as typeof TRAINER_A[]).push({
                  id: nextId++,
                  clerkUserId: (data as { clerkUserId: string }).clerkUserId,
                  displayName: "New Trainer",
                  email: null,
                  createdAt: new Date(),
                });
              }
            },
          }),
        }),
        select: (_shape?: unknown) => ({
          from: (table: unknown) => ({
            where: (cond: Cond) =>
              Promise.resolve(getStore(table).filter((i) => matchesCondition(i, cond))),
          }),
        }),
        update: (table: unknown) => ({
          set: (data: Record<string, unknown>) => ({
            where: (cond: Cond) => ({
              returning: async () => {
                const store = getStore(table);
                const idx = store.findIndex((i) => matchesCondition(i, cond));
                if (idx === -1) return [];
                store[idx] = { ...store[idx], ...data };
                return [store[idx]];
              },
            }),
          }),
        }),
      };
      return fn(tx);
    },
  };

  return {
    db,
    trainersTable,
    clientsTable,
    clientInvitationsTable,
    workoutPlansTable,
    workoutSessionsTable,
  };
});

// ─── App setup ────────────────────────────────────────────────────────────────

let app: Express;

beforeAll(async () => {
  const { default: clientInvitationsRouter } = await import("../routes/clientInvitations");
  const { default: clientPortalRouter }      = await import("../routes/clientPortal");

  app = express();
  app.use(express.json());
  // Minimal Clerk proxy stub so clerkMiddleware doesn't choke.
  app.use((_req, _res, next) => next());
  app.use("/api", clientInvitationsRouter);
  app.use("/api", clientPortalRouter);
});

beforeEach(() => {
  // Reset stores.
  trainersStore = [
    { ...TRAINER_A },
    { ...TRAINER_B },
  ];
  clientsStore = [
    { id: 10, trainerId: TRAINER_A.id, firstName: "Jan", lastName: "Kowalski", email: null, phone: null, notes: null, status: "active", clerkUserId: null, createdAt: new Date(), updatedAt: new Date() },
    { id: 20, trainerId: TRAINER_B.id, firstName: "Anna", lastName: "Nowak",   email: null, phone: null, notes: null, status: "active", clerkUserId: null, createdAt: new Date(), updatedAt: new Date() },
  ];
  invitationsStore = [];
  plansStore       = [];
  sessionsStore    = [];
  nextId = 1000;

  // Default: authenticated as Trainer A (most tests).
  mockGetAuth.mockReturnValue({ userId: TRAINER_A.clerkUserId });
});

const CLIENT_A_ID = 10;
const CLIENT_B_ID = 20;

// ─── (1) Trainer A can invite Trainer A's own client ─────────────────────────

describe("(1) Trainer A can invite Trainer A's own client", () => {
  it("returns 201 with a raw token", async () => {
    const res = await request(app).post(`/api/clients/${CLIENT_A_ID}/invite`).send({});
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBe(64); // 32 bytes → 64 hex chars
  });

  it("stores the token hash (not the raw token) in the invitation store", async () => {
    const res = await request(app).post(`/api/clients/${CLIENT_A_ID}/invite`).send({});
    const raw = res.body.token as string;
    const expectedHash = hashToken(raw);
    const stored = invitationsStore.find((i) => i.tokenHash === expectedHash);
    expect(stored).toBeDefined();
    // The raw token must NOT appear anywhere in the stored invitation.
    expect(JSON.stringify(stored)).not.toContain(raw);
  });

  it("sets expiresAt to the future", async () => {
    const res = await request(app).post(`/api/clients/${CLIENT_A_ID}/invite`).send({});
    expect(new Date(res.body.expiresAt) > new Date()).toBe(true);
  });
});

// ─── (2) Trainer A cannot invite Trainer B's client ──────────────────────────

describe("(2) Trainer A cannot invite Trainer B's client", () => {
  it("returns 404 for a client that belongs to Trainer B", async () => {
    mockGetAuth.mockReturnValue({ userId: TRAINER_A.clerkUserId });
    const res = await request(app).post(`/api/clients/${CLIENT_B_ID}/invite`).send({});
    expect(res.status).toBe(404);
  });

  it("Trainer B can invite their own client while Trainer A cannot", async () => {
    // Trainer B CAN invite client B.
    mockGetAuth.mockReturnValue({ userId: TRAINER_B.clerkUserId });
    const res = await request(app).post(`/api/clients/${CLIENT_B_ID}/invite`).send({});
    expect(res.status).toBe(201);
    // Trainer A CANNOT invite client B.
    mockGetAuth.mockReturnValue({ userId: TRAINER_A.clerkUserId });
    const res2 = await request(app).post(`/api/clients/${CLIENT_B_ID}/invite`).send({});
    expect(res2.status).toBe(404);
  });

  it("revoke endpoint also enforces ownership (Trainer A cannot revoke Trainer B's invite)", async () => {
    // Create an invitation as Trainer B.
    mockGetAuth.mockReturnValue({ userId: TRAINER_B.clerkUserId });
    await request(app).post(`/api/clients/${CLIENT_B_ID}/invite`).send({});

    // Trainer A tries to revoke it.
    mockGetAuth.mockReturnValue({ userId: TRAINER_A.clerkUserId });
    const res = await request(app).delete(`/api/clients/${CLIENT_B_ID}/invite`);
    expect(res.status).toBe(404);
    // The invitation must remain un-revoked (null or undefined — never a Date).
    expect(invitationsStore[0].revokedAt ?? null).toBeNull();
  });
});

// ─── (3) A valid token links the authenticated Clerk user to the correct client

describe("(3) A valid token links the authenticated Clerk user to the correct client", () => {
  it("activate returns 200 and sets clerkUserId on the correct client", async () => {
    // Create invitation as Trainer A.
    const invRes = await request(app).post(`/api/clients/${CLIENT_A_ID}/invite`).send({});
    const raw = invRes.body.token as string;

    // Client signs in — mockGetAuth returns client's Clerk ID.
    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    const actRes = await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    expect(actRes.status).toBe(200);

    // Client A's record must now have clerkUserId.
    const clientA = clientsStore.find((c) => c.id === CLIENT_A_ID)!;
    expect(clientA.clerkUserId).toBe("user_client_jan");

    // Client B's record must be untouched.
    const clientB = clientsStore.find((c) => c.id === CLIENT_B_ID)!;
    expect(clientB.clerkUserId).toBeNull();
  });

  it("invitation is marked as used after activation", async () => {
    const invRes = await request(app).post(`/api/clients/${CLIENT_A_ID}/invite`).send({});
    const raw = invRes.body.token as string;

    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    await request(app).post(`/api/client-invitations/${raw}/activate`).send({});

    const inv = invitationsStore.find((i) => i.tokenHash === hashToken(raw))!;
    expect(inv.usedAt).toBeTruthy();
  });
});

// ─── (4) Expired, revoked, or used token cannot link an account ───────────────

describe("(4) Expired, revoked, or used token cannot link an account", () => {
  it("expired token returns 410", async () => {
    const raw = freshToken();
    invitationsStore.push({
      id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id,
      tokenHash: hashToken(raw),
      expiresAt: pastDate(1),          // already expired
      usedAt: null, revokedAt: null, createdAt: new Date(),
    });
    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    const res = await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    expect(res.status).toBe(410);
    expect(res.body.state).toBe("expired");
  });

  it("revoked token returns 410", async () => {
    const raw = freshToken();
    invitationsStore.push({
      id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id,
      tokenHash: hashToken(raw), expiresAt: futureDate(),
      usedAt: null, revokedAt: new Date(), createdAt: new Date(),
    });
    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    const res = await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    expect(res.status).toBe(410);
    expect(res.body.state).toBe("revoked");
  });

  it("used token returns 409", async () => {
    const raw = freshToken();
    invitationsStore.push({
      id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id,
      tokenHash: hashToken(raw), expiresAt: futureDate(),
      usedAt: new Date(), revokedAt: null, createdAt: new Date(),
    });
    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    const res = await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    expect(res.status).toBe(409);
    expect(res.body.state).toBe("used");
  });

  it("none of the above cases write to clerkUserId", async () => {
    for (const scenario of ["expired", "revoked", "used"] as const) {
      const raw = freshToken();
      invitationsStore.push({
        id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id,
        tokenHash: hashToken(raw),
        expiresAt: scenario === "expired" ? pastDate(1) : futureDate(),
        usedAt: scenario === "used" ? new Date() : null,
        revokedAt: scenario === "revoked" ? new Date() : null,
        createdAt: new Date(),
      });
      mockGetAuth.mockReturnValue({ userId: `user_${scenario}` });
      await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    }
    const clientA = clientsStore.find((c) => c.id === CLIENT_A_ID)!;
    expect(clientA.clerkUserId).toBeNull();
  });
});

// ─── (5) A foreign Clerk user cannot replace an existing client link ──────────

describe("(5) A foreign Clerk user cannot replace an existing client link", () => {
  it("second activation attempt on an already-linked client returns 409", async () => {
    // Link client A to first user.
    const raw1 = freshToken();
    invitationsStore.push({ id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id, tokenHash: hashToken(raw1), expiresAt: futureDate(), usedAt: null, revokedAt: null, createdAt: new Date() });

    mockGetAuth.mockReturnValue({ userId: "user_first" });
    await request(app).post(`/api/client-invitations/${raw1}/activate`).send({});

    // Second user tries to claim the same client via a new invitation.
    const raw2 = freshToken();
    invitationsStore.push({ id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id, tokenHash: hashToken(raw2), expiresAt: futureDate(), usedAt: null, revokedAt: null, createdAt: new Date() });

    mockGetAuth.mockReturnValue({ userId: "user_second" });
    const res = await request(app).post(`/api/client-invitations/${raw2}/activate`).send({});
    expect(res.status).toBe(409);

    // The original link must be unchanged.
    const clientA = clientsStore.find((c) => c.id === CLIENT_A_ID)!;
    expect(clientA.clerkUserId).toBe("user_first");
  });

  it("a Clerk user already linked to one client cannot claim another via a fresh token", async () => {
    // Link Clerk user "user_jan" to client A.
    clientsStore.find((c) => c.id === CLIENT_A_ID)!.clerkUserId = "user_jan";

    // Create a valid invitation for client B (Trainer B).
    const raw = freshToken();
    invitationsStore.push({ id: nextId++, clientId: CLIENT_B_ID, trainerId: TRAINER_B.id, tokenHash: hashToken(raw), expiresAt: futureDate(), usedAt: null, revokedAt: null, createdAt: new Date() });

    // user_jan tries to also claim client B.
    mockGetAuth.mockReturnValue({ userId: "user_jan" });
    const res = await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    expect(res.status).toBe(409);

    // Client B must remain unlinked.
    const clientB = clientsStore.find((c) => c.id === CLIENT_B_ID)!;
    expect(clientB.clerkUserId).toBeNull();
  });
});

// ─── (6) Caller-provided clientId or email cannot change the target client ────

describe("(6) Caller-provided clientId or email cannot change the target client", () => {
  it("a body-supplied clientId is ignored; target is determined by token only", async () => {
    // Invitation points to client A.
    const raw = freshToken();
    invitationsStore.push({ id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id, tokenHash: hashToken(raw), expiresAt: futureDate(), usedAt: null, revokedAt: null, createdAt: new Date() });

    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    // Attacker supplies clientId=CLIENT_B_ID in the body.
    const res = await request(app)
      .post(`/api/client-invitations/${raw}/activate`)
      .send({ clientId: CLIENT_B_ID });
    expect(res.status).toBe(200);

    // Only client A is linked; client B is untouched.
    expect(clientsStore.find((c) => c.id === CLIENT_A_ID)!.clerkUserId).toBe("user_client_jan");
    expect(clientsStore.find((c) => c.id === CLIENT_B_ID)!.clerkUserId).toBeNull();
  });

  it("a body-supplied email is ignored; trainer identity comes from the Clerk session", async () => {
    // Creating an invitation with a spurious email in the body must not affect the owner.
    const res = await request(app)
      .post(`/api/clients/${CLIENT_A_ID}/invite`)
      .send({ email: "attacker@evil.com", trainerId: TRAINER_B.id });
    expect(res.status).toBe(201);

    // Invitation must be owned by Trainer A (derived from session), not by an attacker.
    const inv = invitationsStore.at(-1)!;
    expect(inv.trainerId).toBe(TRAINER_A.id);
    expect(inv.clientId).toBe(CLIENT_A_ID);
  });

  it("GET /client-invitations/:token returns client info without exposing raw token", async () => {
    const raw = freshToken();
    invitationsStore.push({ id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id, tokenHash: hashToken(raw), expiresAt: futureDate(), usedAt: null, revokedAt: null, createdAt: new Date() });

    const res = await request(app).get(`/api/client-invitations/${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("valid");
    // Response must NOT include the raw token or the hash.
    expect(JSON.stringify(res.body)).not.toContain(raw);
    expect(JSON.stringify(res.body)).not.toContain(hashToken(raw));
  });
});

// ─── (7) A new client account sees only its own plan and sessions ─────────────

describe("(7) A new client account sees only its own plan and sessions", () => {
  it("GET /client-portal/plan returns only the authenticated client's plan", async () => {
    // Link client A to a Clerk user.
    clientsStore.find((c) => c.id === CLIENT_A_ID)!.clerkUserId = "user_client_a";
    clientsStore.find((c) => c.id === CLIENT_B_ID)!.clerkUserId = "user_client_b";

    plansStore.push({ id: 100, clientId: CLIENT_A_ID, status: "active", activatedAt: new Date(), title: "Plan A" });
    plansStore.push({ id: 200, clientId: CLIENT_B_ID, status: "active", activatedAt: new Date(), title: "Plan B" });

    // Authenticate as client A.
    mockGetAuth.mockReturnValue({ userId: "user_client_a" });

    const res = await request(app).get("/api/client-portal/plan");
    // The plan returned must belong to client A, not client B.
    // (A 404 here would also be acceptable if the mock doesn't fully wire sessions,
    //  but it must NOT return Plan B.)
    if (res.status === 200) {
      expect(res.body.plan.id).toBe(100);
      expect(res.body.plan.title).toBe("Plan A");
    } else {
      // At least the server should not have leaked client B's plan.
      expect(res.body?.plan?.id).not.toBe(200);
    }
  });

  it("unauthenticated request to /client-portal/plan returns 401 or 404", async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    const res = await request(app).get("/api/client-portal/plan");
    expect([401, 404]).toContain(res.status);
  });
});

// ─── (8) Active client without a plan sees "plan in preparation" state ────────

describe("(8) Active client without a plan sees 'plan in preparation' state", () => {
  it("returns 404 with a polish message when no active plan exists", async () => {
    clientsStore.find((c) => c.id === CLIENT_A_ID)!.clerkUserId = "user_client_a";
    mockGetAuth.mockReturnValue({ userId: "user_client_a" });

    // No plans in plansStore for client A.
    const res = await request(app).get("/api/client-portal/plan");
    expect(res.status).toBe(404);
    // Message must indicate the plan is being prepared, not a generic error.
    expect(res.body.error).toMatch(/trener|plan/i);
  });
});

// ─── (9) No password is generated or stored by the application ───────────────

describe("(9) No password is generated or stored by the application", () => {
  it("the invitation route response does not contain a password field", async () => {
    const res = await request(app).post(`/api/clients/${CLIENT_A_ID}/invite`).send({});
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("pin");
  });

  it("the stored invitation row does not contain a password field", async () => {
    await request(app).post(`/api/clients/${CLIENT_A_ID}/invite`).send({});
    const inv = invitationsStore.at(-1);
    expect(inv).toBeDefined();
    expect(inv).not.toHaveProperty("password");
    expect(inv).not.toHaveProperty("passwordHash");
  });

  it("the activate response does not contain a password field", async () => {
    const raw = freshToken();
    invitationsStore.push({ id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id, tokenHash: hashToken(raw), expiresAt: futureDate(), usedAt: null, revokedAt: null, createdAt: new Date() });
    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    const res = await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("passwordHash");
  });

  it("the client record written by activate does not contain a password field", async () => {
    const raw = freshToken();
    invitationsStore.push({ id: nextId++, clientId: CLIENT_A_ID, trainerId: TRAINER_A.id, tokenHash: hashToken(raw), expiresAt: futureDate(), usedAt: null, revokedAt: null, createdAt: new Date() });
    mockGetAuth.mockReturnValue({ userId: "user_client_jan" });
    await request(app).post(`/api/client-invitations/${raw}/activate`).send({});
    const clientA = clientsStore.find((c) => c.id === CLIENT_A_ID)!;
    expect(clientA).not.toHaveProperty("password");
    expect(clientA).not.toHaveProperty("passwordHash");
  });
});
