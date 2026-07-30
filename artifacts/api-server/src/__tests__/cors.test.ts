/**
 * CORS allowlist — focused tests (14 cases).
 *
 * Covers:
 *  1.  Exact trainer origin is allowed.
 *  2.  Exact client portal origin is allowed.
 *  3.  Foreign origin is rejected (no ACAO header returned).
 *  4.  Lookalike origin (suffix-matching attack) is rejected.
 *  5.  Unexpected port is rejected.
 *  6.  Request without Origin header reaches the normal endpoint.
 *  7.  Allowed response contains the exact requesting origin (not wildcard).
 *  8.  Wildcard origin is never returned.
 *  9.  Credentials header is present for allowed origins.
 * 10.  Allowed OPTIONS preflight succeeds (ACAO header present).
 * 11.  Foreign OPTIONS preflight is rejected (no ACAO header).
 * 12.  Production startup fails when TRAINER_APP_ORIGIN is missing.
 * 13.  Production startup fails when CLIENT_PORTAL_ORIGIN is missing.
 * 14.  Malformed configured origin fails closed (startup throws).
 */

import { describe, it, expect } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import {
  buildAllowedOrigins,
  makeCorsOriginCallback,
} from "../lib/corsOrigins";

// ─── Test constants ───────────────────────────────────────────────────────────

const TRAINER_ORIGIN = "https://trainer.example.com";
const PORTAL_ORIGIN = "https://portal.example.com";

const TEST_ENV: Record<string, string> = {
  TRAINER_APP_ORIGIN: TRAINER_ORIGIN,
  CLIENT_PORTAL_ORIGIN: PORTAL_ORIGIN,
};

// ─── Minimal express app for HTTP tests ──────────────────────────────────────

function makeTestApp(env: Record<string, string> = TEST_ENV) {
  const allowedOrigins = buildAllowedOrigins(env);
  const app = express();
  app.use(cors({ credentials: true, origin: makeCorsOriginCallback(allowedOrigins) }));
  app.get("/test", (_req, res) => { res.json({ ok: true }); });
  return app;
}

// ─── 1. Exact trainer origin is allowed ──────────────────────────────────────

describe("1. Exact trainer origin is allowed", () => {
  it("returns Access-Control-Allow-Origin matching the trainer origin", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", TRAINER_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(TRAINER_ORIGIN);
  });
});

// ─── 2. Exact client portal origin is allowed ────────────────────────────────

describe("2. Exact client portal origin is allowed", () => {
  it("returns Access-Control-Allow-Origin matching the client portal origin", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", PORTAL_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(PORTAL_ORIGIN);
  });
});

// ─── 3. Foreign origin is rejected ───────────────────────────────────────────

describe("3. Foreign origin is rejected", () => {
  it("does not return Access-Control-Allow-Origin for an unknown origin", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

// ─── 4. Lookalike origin is rejected ─────────────────────────────────────────

describe("4. Lookalike (suffix-matching attack) origin is rejected", () => {
  it("does not allow trainer.example.com.attacker.com", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", "https://trainer.example.com.attacker.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

// ─── 5. Unexpected port is rejected ──────────────────────────────────────────

describe("5. Unexpected port is rejected", () => {
  it("does not allow the trainer origin on a different port", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", "https://trainer.example.com:9999");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

// ─── 6. No Origin header reaches normal middleware ───────────────────────────

describe("6. Request without Origin header reaches route", () => {
  it("responds normally when no Origin header is present", async () => {
    const res = await request(makeTestApp()).get("/test");

    // Route handler ran successfully — no CORS block
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });
});

// ─── 7. Allowed response contains exact requesting origin ────────────────────

describe("7. Allowed response reflects exact requesting origin", () => {
  it("ACAO equals the exact origin sent, not a wildcard or different value", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", TRAINER_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(TRAINER_ORIGIN);
  });
});

// ─── 8. Wildcard origin is never returned ────────────────────────────────────

describe("8. Wildcard origin is never returned", () => {
  it("ACAO is never *", async () => {
    for (const origin of [TRAINER_ORIGIN, PORTAL_ORIGIN, "https://unknown.com"]) {
      const res = await request(makeTestApp())
        .get("/test")
        .set("Origin", origin);

      expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    }
  });
});

// ─── 9. Credentials header for allowed origins ───────────────────────────────

describe("9. Credentials header", () => {
  it("Access-Control-Allow-Credentials is true for an allowed origin", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", TRAINER_ORIGIN);

    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("Access-Control-Allow-Credentials is absent for a rejected origin", async () => {
    const res = await request(makeTestApp())
      .get("/test")
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

// ─── 10. Allowed OPTIONS preflight succeeds ──────────────────────────────────

describe("10. Allowed OPTIONS preflight succeeds", () => {
  it("preflight from trainer origin returns ACAO header", async () => {
    const res = await request(makeTestApp())
      .options("/test")
      .set("Origin", TRAINER_ORIGIN)
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBe(TRAINER_ORIGIN);
    // cors returns 204 for preflights by default
    expect(res.status).toBe(204);
  });
});

// ─── 11. Foreign OPTIONS preflight is rejected ───────────────────────────────

describe("11. Foreign OPTIONS preflight is rejected", () => {
  it("preflight from unknown origin does not return ACAO header", async () => {
    const res = await request(makeTestApp())
      .options("/test")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

// ─── 12. Production startup fails when TRAINER_APP_ORIGIN is missing ─────────

describe("12. Production startup fails when TRAINER_APP_ORIGIN is missing", () => {
  it("buildAllowedOrigins throws when NODE_ENV=production and TRAINER_APP_ORIGIN is unset", () => {
    expect(() =>
      buildAllowedOrigins({
        NODE_ENV: "production",
        CLIENT_PORTAL_ORIGIN: PORTAL_ORIGIN,
      }),
    ).toThrow(/TRAINER_APP_ORIGIN.*required in production/i);
  });
});

// ─── 13. Production startup fails when CLIENT_PORTAL_ORIGIN is missing ───────

describe("13. Production startup fails when CLIENT_PORTAL_ORIGIN is missing", () => {
  it("buildAllowedOrigins throws when NODE_ENV=production and CLIENT_PORTAL_ORIGIN is unset", () => {
    expect(() =>
      buildAllowedOrigins({
        NODE_ENV: "production",
        TRAINER_APP_ORIGIN: TRAINER_ORIGIN,
      }),
    ).toThrow(/CLIENT_PORTAL_ORIGIN.*required in production/i);
  });
});

// ─── 14. Malformed configured origin fails closed ────────────────────────────

describe("14. Malformed configured origin fails closed", () => {
  it("rejects a value that is not a valid URL", () => {
    expect(() =>
      buildAllowedOrigins({ TRAINER_APP_ORIGIN: "not-a-url", CLIENT_PORTAL_ORIGIN: PORTAL_ORIGIN }),
    ).toThrow(/TRAINER_APP_ORIGIN.*is not a valid URL/i);
  });

  it("rejects an origin with a path component", () => {
    expect(() =>
      buildAllowedOrigins({
        TRAINER_APP_ORIGIN: "https://trainer.example.com/app",
        CLIENT_PORTAL_ORIGIN: PORTAL_ORIGIN,
      }),
    ).toThrow(/must not contain a path/i);
  });

  it("rejects an origin with a query string", () => {
    expect(() =>
      buildAllowedOrigins({
        TRAINER_APP_ORIGIN: "https://trainer.example.com?foo=bar",
        CLIENT_PORTAL_ORIGIN: PORTAL_ORIGIN,
      }),
    ).toThrow(/must not contain a query string/i);
  });

  it("rejects an origin with userinfo (username:password)", () => {
    expect(() =>
      buildAllowedOrigins({
        TRAINER_APP_ORIGIN: "https://user:pass@trainer.example.com",
        CLIENT_PORTAL_ORIGIN: PORTAL_ORIGIN,
      }),
    ).toThrow(/must not contain userinfo/i);
  });
});
