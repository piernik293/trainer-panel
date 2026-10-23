/**
 * Invitation list — focused unit tests for archive and filtering behaviour.
 *
 * Strategy: mock drizzle-orm's condition builders (eq, and, isNull) to return
 * row-predicate functions instead of SQL AST objects.  The mock DB evaluates
 * those predicates directly against an in-memory ROWS store.
 * No real database rows are created; no side effects after each test.
 *
 * Covers:
 *   1.  GET excludes archived invites
 *   2.  GET includes active invites
 *   3.  GET includes used, revoked, and expired non-archived invites
 *   4.  PATCH archive → 409 for an active (unused, unrevoked, unexpired) invite
 *   5.  PATCH archive → 204 for a used invite
 *   6.  PATCH archive → 204 for a revoked invite
 *   7.  PATCH archive → 204 for an expired invite
 *   8.  PATCH archive → 404 for another trainer's invite
 *   9.  PATCH archive → 404 for an already-archived invite
 *   10. PATCH archive → 400 for an invalid ID
 *   11. DELETE (revoke) still works after archive column was added
 *   12. GET returns empty array when all trainer invites are archived
 *   13. GET response items never expose archivedAt
 *   14. Archived record stays in DB store but disappears from the trainer list
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ─── In-memory store ──────────────────────────────────────────────────────────

const now = new Date();
const future = new Date(now.getTime() + 7 * 86_400_000);
const past   = new Date(now.getTime() - 1_000);

type Pred = (row: Record<string, unknown>) => boolean;

interface MockRow {
  id: number;
  trainerId: number;
  intendedEmail: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  tokenHash: string;
}

let ROWS: MockRow[];

function resetRows() {
  ROWS = [
    // 1 — active (unused, unrevoked, not expired) → cannot be archived
    { id: 1, trainerId: 1, intendedEmail: "a@test.com", expiresAt: future, usedAt: null, revokedAt: null, archivedAt: null, createdAt: now, tokenHash: "h1" },
    // 2 — used
    { id: 2, trainerId: 1, intendedEmail: null,          expiresAt: future, usedAt: now,  revokedAt: null, archivedAt: null, createdAt: now, tokenHash: "h2" },
    // 3 — expired (past expiresAt)
    { id: 3, trainerId: 1, intendedEmail: "b@test.com", expiresAt: past,   usedAt: null, revokedAt: null, archivedAt: null, createdAt: now, tokenHash: "h3" },
    // 4 — revoked
    { id: 4, trainerId: 1, intendedEmail: null,          expiresAt: future, usedAt: null, revokedAt: now,  archivedAt: null, createdAt: now, tokenHash: "h4" },
    // 5 — already archived (trainer 1)
    { id: 5, trainerId: 1, intendedEmail: null,          expiresAt: future, usedAt: null, revokedAt: null, archivedAt: now,  createdAt: now, tokenHash: "h5" },
    // 6 — active, belongs to trainer 2
    { id: 6, trainerId: 2, intendedEmail: null,          expiresAt: future, usedAt: null, revokedAt: null, archivedAt: null, createdAt: now, tokenHash: "h6" },
  ];
}

// ─── Mock drizzle-orm: builders return row predicates ────────────────────────
//
// eq(col, val)   → (row) => row[col] === val
// isNull(col)    → (row) => row[col] == null
// and(...preds)  → (row) => every pred is true
// desc(col)      → identity (orderBy is a no-op in mock)

vi.mock("drizzle-orm", () => ({
  eq:     (col: string, val: unknown): Pred => (row) => row[col] === val,
  isNull: (col: string): Pred             => (row) => row[col] == null,
  and:    (...preds: Pred[]): Pred        => (row) => preds.every((p) => p(row)),
  desc:   (col: string) => col,
  sql:    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

// ─── Mock @workspace/db ───────────────────────────────────────────────────────
//
// Column descriptors are camelCase property names of MockRow, so that
//   eq(surveyInvitesTable.trainerId, 1) → eq("trainerId", 1) → predicate.
//
// The select chain's where() is made thenable so the route can either:
//   await db.select().from().where(pred)            — used by PATCH archive
//   await db.select().from().where(pred).orderBy()  — used by GET list

vi.mock("@workspace/db", () => {
  const cols = {
    id:            "id",
    trainerId:     "trainerId",
    intendedEmail: "intendedEmail",
    expiresAt:     "expiresAt",
    usedAt:        "usedAt",
    revokedAt:     "revokedAt",
    archivedAt:    "archivedAt",
    createdAt:     "createdAt",
    tokenHash:     "tokenHash",
  };

  const db = {
    select: (_cols?: Record<string, unknown>) => ({
      from: () => ({
        where: (pred: Pred) => {
          // Filter rows; expose results both via direct await AND via .orderBy().
          // The SELECT list intentionally omits archivedAt to mirror the route.
          const filtered = ROWS
            .filter((r) => pred(r as unknown as Record<string, unknown>))
            .map((r): Record<string, unknown> => ({
              id:            r.id,
              intendedEmail: r.intendedEmail,
              expiresAt:     r.expiresAt,
              usedAt:        r.usedAt,
              revokedAt:     r.revokedAt,
              createdAt:     r.createdAt,
            }));

          return {
            // Thenable: lets `await db.select().from().where(pred)` work directly.
            then(
              resolve: (v: Record<string, unknown>[]) => unknown,
              reject: (e: unknown) => unknown,
            ) {
              Promise.resolve(filtered).then(resolve, reject);
            },
            // .orderBy(): lets the GET list chain work.
            orderBy: () => Promise.resolve(filtered),
          };
        },
      }),
    }),

    update: (_table: unknown) => ({
      set: (vals: Partial<MockRow>) => ({
        where: (pred: Pred) => ({
          returning: (): Promise<MockRow[]> => {
            const matches = ROWS.filter(
              (r) => pred(r as unknown as Record<string, unknown>),
            );
            matches.forEach((r) => Object.assign(r, vals));
            return Promise.resolve(matches);
          },
        }),
      }),
    }),
  };

  return {
    db,
    surveyInvitesTable: cols,
    trainersTable: {},
  };
});

// ─── Mock requireAuth: always sets trainer id=1 ───────────────────────────────

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    (req as unknown as { trainer: { id: number } }).trainer = { id: 1 };
    next();
  },
}));

// ─── App factory ──────────────────────────────────────────────────────────────

let app: Express;

beforeEach(async () => {
  resetRows();
  const { default: router } = await import("../routes/surveyInvites");
  app = express();
  app.use(express.json());
  app.use(router);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Invitation list — archive and filtering", () => {
  // ── GET list ───────────────────────────────────────────────────────────────

  it("1. GET excludes archived invites (row 5)", async () => {
    const res = await request(app).get("/survey-invites");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    expect(ids).not.toContain(5);
  });

  it("2. GET includes the active invite (row 1)", async () => {
    const res = await request(app).get("/survey-invites");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    expect(ids).toContain(1);
  });

  it("3. GET includes used (2), expired (3), revoked (4) non-archived invites", async () => {
    const res = await request(app).get("/survey-invites");
    expect(res.status).toBe(200);
    const ids = (res.body as Array<{ id: number }>).map((r) => r.id);
    expect(ids).toContain(2);
    expect(ids).toContain(3);
    expect(ids).toContain(4);
  });

  // ── Archive guard: active → 409 ────────────────────────────────────────────

  it("4. PATCH archive → 409 for active invite (row 1: unused + unrevoked + unexpired)", async () => {
    const res = await request(app).patch("/survey-invites/1/archive");
    expect(res.status).toBe(409);
    // Row must remain unarchived
    expect(ROWS.find((r) => r.id === 1)!.archivedAt).toBeNull();
  });

  // ── Archive allowed: completed invites ─────────────────────────────────────

  it("5. PATCH archive → 204 for used invite (row 2)", async () => {
    const res = await request(app).patch("/survey-invites/2/archive");
    expect(res.status).toBe(204);
    expect(ROWS.find((r) => r.id === 2)!.archivedAt).not.toBeNull();
  });

  it("6. PATCH archive → 204 for revoked invite (row 4)", async () => {
    const res = await request(app).patch("/survey-invites/4/archive");
    expect(res.status).toBe(204);
    expect(ROWS.find((r) => r.id === 4)!.archivedAt).not.toBeNull();
  });

  it("7. PATCH archive → 204 for expired invite (row 3)", async () => {
    const res = await request(app).patch("/survey-invites/3/archive");
    expect(res.status).toBe(204);
    expect(ROWS.find((r) => r.id === 3)!.archivedAt).not.toBeNull();
  });

  // ── Archive guard: ownership and state ─────────────────────────────────────

  it("8. PATCH archive → 404 for another trainer's invite (row 6, trainer 2)", async () => {
    const res = await request(app).patch("/survey-invites/6/archive");
    expect(res.status).toBe(404);
    expect(ROWS.find((r) => r.id === 6)!.archivedAt).toBeNull();
  });

  it("9. PATCH archive → 404 for already-archived invite (row 5)", async () => {
    const res = await request(app).patch("/survey-invites/5/archive");
    expect(res.status).toBe(404);
  });

  it("10. PATCH archive → 400 for invalid (non-integer) ID", async () => {
    const res = await request(app).patch("/survey-invites/abc/archive");
    expect(res.status).toBe(400);
  });

  // ── Unrelated endpoints still work ─────────────────────────────────────────

  it("11. DELETE (revoke) still returns 204", async () => {
    const res = await request(app).delete("/survey-invites/1");
    expect(res.status).toBe(204);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  it("12. GET returns empty array when all trainer-1 invites are archived", async () => {
    ROWS.filter((r) => r.trainerId === 1).forEach((r) => { r.archivedAt = now; });
    const res = await request(app).get("/survey-invites");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("13. GET response items never expose archivedAt", async () => {
    const res = await request(app).get("/survey-invites");
    expect(res.status).toBe(200);
    const items = res.body as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("expiresAt");
      expect(item).toHaveProperty("createdAt");
      expect(item.archivedAt).toBeUndefined();
    }
  });

  it("14. Archived record stays in DB store but disappears from the GET list", async () => {
    // Archive the used invite (row 2)
    const archiveRes = await request(app).patch("/survey-invites/2/archive");
    expect(archiveRes.status).toBe(204);

    // Row is still in the raw ROWS store
    const stored = ROWS.find((r) => r.id === 2)!;
    expect(stored).toBeDefined();
    expect(stored.archivedAt).not.toBeNull();

    // But it no longer appears in the GET response
    const listRes = await request(app).get("/survey-invites");
    expect(listRes.status).toBe(200);
    const ids = (listRes.body as Array<{ id: number }>).map((r) => r.id);
    expect(ids).not.toContain(2);
  });
});
