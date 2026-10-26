/**
 * Small in-memory rate limiter (fixed window, per key) — no new dependency. Good enough for one API process on one machine;
 * moving to several instances would need a shared store.
 *
 *   rateLimit({ name: "public-survey", windowMs: 60_000, max: 30 })            → key = client IP
 *   rateLimit({ name: "generator", windowMs: 60_000, max: 120, by: "user" })   → key = Clerk user id (falls back to the IP)
 *
 * Over the limit → 429 with Retry-After and a short Polish message. Counters of different limiters never mix.
 * Behind a reverse proxy set TRUST_PROXY (e.g. "loopback") so that req.ip is the real client address.
 */
import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

export interface RateLimitOptions {
  name: string;
  windowMs: number;
  max: number;
  by?: "ip" | "user";
  message?: string;
  /** injectable clock for tests */
  now?: () => number;
}

export function rateLimit(opts: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const now = opts.now ?? Date.now;
  let lastSweep = 0;
  return (req: Request, res: Response, next: NextFunction): void => {
    const t = now();
    if (t - lastSweep > opts.windowMs) { // drop expired counters so the map cannot grow without bound
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      lastSweep = t;
    }
    let who = req.ip ?? "unknown";
    if (opts.by === "user") {
      try { who = getAuth(req)?.userId ?? who; } catch { /* no Clerk context → IP */ }
    }
    const entry = hits.get(who);
    if (!entry || entry.resetAt <= t) {
      hits.set(who, { count: 1, resetAt: t + opts.windowMs });
      next();
      return;
    }
    entry.count++;
    if (entry.count > opts.max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - t) / 1000))));
      res.status(429).json({ error: opts.message ?? "Zbyt wiele prób. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" });
      return;
    }
    next();
  };
}

/** Limits used by the API (per minute). Named so that the tests and docs refer to the same numbers. */
export const LIMITS = {
  /** survey/invitation links: guessing a token */
  publicToken: { name: "public-token", windowMs: 60_000, max: 30 },
  /** right after sign-in */
  trainerProfile: { name: "trainer-profile", windowMs: 60_000, max: 20 },
  /** plan generator and day recommendations */
  generator: { name: "generator", windowMs: 60_000, max: 120, by: "user" as const },
  /** trainer join codes (block 2 of the accounts work uses this): few attempts, long window */
  trainerCode: { name: "trainer-code", windowMs: 15 * 60_000, max: 10 },
} satisfies Record<string, RateLimitOptions>;
