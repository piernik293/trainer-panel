import { describe, it, expect, vi } from "vitest";

process.env.RATE_LIMIT_FORCE = "1"; // the app-level test below needs the real limiter
import type { Request, Response } from "express";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: (req: { __uid?: string }) => ({ userId: req.__uid ?? null }),
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import request from "supertest";
import app from "../app";
import { securityHeaders } from "../middlewares/securityHeaders";
import { rateLimit, LIMITS } from "../middlewares/rateLimit";

function fakeRes() {
  const h: Record<string, string> = {}; let status = 200; let body: unknown;
  const res = { setHeader: (k: string, v: string) => { h[k] = v; }, status: (s: number) => { status = s; return res; }, json: (b: unknown) => { body = b; return res; } };
  return { res: res as unknown as Response, h, get status() { return status; }, get body() { return body; } };
}
const req = (ip: string, uid?: string) => ({ ip, __uid: uid } as unknown as Request);

describe("security headers", () => {
  it("API responses carry the headers; HSTS only when enabled", async () => {
    const r = await request(app).get("/api/healthz");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBe("DENY");
    expect(r.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(r.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(r.headers["strict-transport-security"]).toBeUndefined();
    const on = fakeRes(); securityHeaders({ HSTS_ENABLED: "1" } as NodeJS.ProcessEnv)(req("1"), on.res, () => {});
    expect(on.h["Strict-Transport-Security"]).toContain("max-age=31536000");
    const off = fakeRes(); securityHeaders({} as NodeJS.ProcessEnv)(req("1"), off.res, () => {});
    expect(off.h["Strict-Transport-Security"]).toBeUndefined();
  });
  it("front-end headers: CSP report-only by default, enforced with CSP_ENFORCE=1, HSTS only with HSTS_ENABLED=1", async () => {
    // @ts-expect-error plain .mjs without types
    const { frontendSecurityHeaders } = await import("../../../../scripts/security-headers.mjs");
    const d = frontendSecurityHeaders({}); expect(d["Content-Security-Policy-Report-Only"]).toContain("frame-ancestors 'none'"); expect(d["Content-Security-Policy"]).toBeUndefined();
    expect(d["X-Frame-Options"]).toBe("DENY"); expect(d["Strict-Transport-Security"]).toBeUndefined();
    const e = frontendSecurityHeaders({ CSP_ENFORCE: "1", HSTS_ENABLED: "1" }); expect(e["Content-Security-Policy"]).toBeDefined(); expect(e["Strict-Transport-Security"]).toBeDefined();
  });
});

describe("rateLimit", () => {
  it("allows `max` requests per window, then 429 with Retry-After; resets after the window", () => {
    let t = 1_000; const lim = rateLimit({ name: "x", windowMs: 60_000, max: 3, now: () => t });
    const run = () => { const r = fakeRes(); let passed = false; lim(req("1.1.1.1"), r.res, () => { passed = true; }); return { passed, r }; };
    expect([run().passed, run().passed, run().passed]).toEqual([true, true, true]);
    const blocked = run(); expect(blocked.passed).toBe(false); expect(blocked.r.status).toBe(429);
    expect(blocked.r.h["Retry-After"]).toBe("60"); expect((blocked.r.body as { code: string }).code).toBe("RATE_LIMITED");
    t += 60_001; expect(run().passed).toBe(true);
  });
  it("keys are separate: another IP / another user is not affected; limiters do not share counters", () => {
    const now = () => 5; const a = rateLimit({ name: "a", windowMs: 1000, max: 1, now }); const b = rateLimit({ name: "b", windowMs: 1000, max: 1, now });
    const go = (l: ReturnType<typeof rateLimit>, r: Request) => { let ok = false; l(r, fakeRes().res, () => { ok = true; }); return ok; };
    expect(go(a, req("1"))).toBe(true); expect(go(a, req("1"))).toBe(false);
    expect(go(a, req("2"))).toBe(true); expect(go(b, req("1"))).toBe(true);
    const u = rateLimit({ name: "u", windowMs: 1000, max: 1, by: "user", now });
    expect(go(u, req("9", "user_A"))).toBe(true); expect(go(u, req("9", "user_B"))).toBe(true); expect(go(u, req("10", "user_A"))).toBe(false);
  });
  it("documented limits", () => {
    expect(LIMITS.publicToken.max).toBe(30); expect(LIMITS.trainerCode).toMatchObject({ max: 10, windowMs: 900_000 });
    expect(LIMITS.generator.by).toBe("user");
  });
  it("the public survey endpoint answers 429 after 30 requests a minute from one address", async () => {
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await request(app).get("/api/public/survey/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).status;
    expect(last).toBe(429);
  });
});
