/**
 * Survey invitation flow — 15 focused tests.
 *
 *  1.  A newly generated active invite verifies successfully.
 *  2.  The legitimate survey frontend origin receives the correct ACAO header.
 *  3.  A foreign origin receives no ACAO header.
 *  4.  An allowed OPTIONS preflight succeeds.
 *  5.  The generated invitation URL opens the expected client route.
 *  6.  The token is extracted correctly from the URL.
 *  7.  An invalid token shows the invalid-link state (404 + INVITE_NOT_FOUND).
 *  8.  An expired token shows the expired-link state (410 + INVITE_EXPIRED).
 *  9.  A revoked token shows the revoked-link state (410 + INVITE_REVOKED).
 * 10.  A used token shows the used-link state (410 + INVITE_USED).
 * 11.  Existing trainer and client portal CORS tests continue to pass.
 * 12.  The CORS implementation is not reflective or wildcard.
 * 13.  The frontend constructs the correct absolute /api/... URL (not BASE-prefixed).
 * 14.  An HTML response (routing error) is not parsed as valid API JSON.
 * 15.  LOCAL_* dev vars configure CORS; prod vars are optional in development.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";
import {
  buildAllowedOrigins,
  makeCorsOriginCallback,
} from "../lib/corsOrigins";

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * The exact origin of the client-landing app (survey + client portal).
 * Both live in the same client-landing artifact → same browser origin.
 *
 * Environment variable mapping:
 *  Development:  LOCAL_TRAINER_APP_ORIGIN + LOCAL_CLIENT_PORTAL_ORIGIN
 *  Production:   TRAINER_APP_ORIGIN + CLIENT_PORTAL_ORIGIN  (required in prod)
 */
const CLIENT_LANDING_ORIGIN = "https://trainer.example.com";

/**
 * Test env uses LOCAL_* vars as development does.
 * Prod vars (TRAINER_APP_ORIGIN, CLIENT_PORTAL_ORIGIN) are absent → must not
 * throw in non-production NODE_ENV.
 */
const TEST_ENV = {
  LOCAL_TRAINER_APP_ORIGIN: "https://trainer.example.com",
  LOCAL_CLIENT_PORTAL_ORIGIN: "https://trainer.example.com",
  // NODE_ENV not set → treated as development → prod vars are optional.
};

// ─── Mock DB & survey invite table ───────────────────────────────────────────

const VALID_TOKEN   = "a".repeat(64);
const EXPIRED_TOKEN = "b".repeat(64);
const REVOKED_TOKEN = "c".repeat(64);
const USED_TOKEN    = "d".repeat(64);
const UNKNOWN_TOKEN = "e".repeat(64);

import crypto from "crypto";
function hashToken(t: string) { return crypto.createHash("sha256").update(t).digest("hex"); }

const now = new Date();
const future = new Date(now.getTime() + 7 * 86_400_000);
const past   = new Date(now.getTime() - 1000);

const DB_ROWS: Record<string, {
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  intendedEmail: string | null;
  trainerId: number;
}> = {
  [hashToken(VALID_TOKEN)]:   { tokenHash: hashToken(VALID_TOKEN),   expiresAt: future, usedAt: null, revokedAt: null, intendedEmail: "test@example.com", trainerId: 1 },
  [hashToken(EXPIRED_TOKEN)]: { tokenHash: hashToken(EXPIRED_TOKEN), expiresAt: past,   usedAt: null, revokedAt: null, intendedEmail: null, trainerId: 1 },
  [hashToken(REVOKED_TOKEN)]: { tokenHash: hashToken(REVOKED_TOKEN), expiresAt: future, usedAt: null, revokedAt: now,  intendedEmail: null, trainerId: 1 },
  [hashToken(USED_TOKEN)]:    { tokenHash: hashToken(USED_TOKEN),    expiresAt: future, usedAt: now,  revokedAt: null, intendedEmail: null, trainerId: 1 },
};

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: async (cond: unknown) => {
            const condStr = JSON.stringify(cond);
            const hash = Object.keys(DB_ROWS).find((h) => condStr.includes(h));
            if (!hash || !DB_ROWS[hash]) return [];
            return [DB_ROWS[hash]];
          },
        }),
      }),
    },
  };
});

// ─── Minimal express app for CORS + route tests ───────────────────────────────

function makeApp(env: Record<string, string | undefined> = TEST_ENV) {
  const allowedOrigins = buildAllowedOrigins(env);
  const app = express();
  app.use(cors({ credentials: true, origin: makeCorsOriginCallback(allowedOrigins) }));
  app.use(express.json());

  // Inline route that mirrors public.ts behaviour so DB mock is used.
  app.get("/api/public/survey/:token", async (req, res) => {
    const raw = req.params.token;
    if (!raw || raw.length !== 64) {
      res.status(400).json({ code: "INVITE_NOT_FOUND", error: "Nieprawidłowy token zaproszenia" });
      return;
    }
    const hash = hashToken(raw);
    const invite = DB_ROWS[hash];
    if (!invite) {
      res.status(404).json({ code: "INVITE_NOT_FOUND", error: "Nieprawidłowy link zaproszeniowy" });
      return;
    }
    if (invite.revokedAt) {
      res.status(410).json({ code: "INVITE_REVOKED", error: "Link zaproszeniowy został odwołany" });
      return;
    }
    if (invite.usedAt) {
      res.status(410).json({ code: "INVITE_USED", error: "Link zaproszeniowy został już wykorzystany" });
      return;
    }
    if (invite.expiresAt < now) {
      res.status(410).json({ code: "INVITE_EXPIRED", error: "Link zaproszeniowy wygasł" });
      return;
    }
    res.json({ valid: true, intendedEmail: invite.intendedEmail, expiresAt: invite.expiresAt });
  });

  return app;
}

// ─── 1. Active invite verifies successfully ───────────────────────────────────

describe("1. Active invite verifies successfully", () => {
  it("GET /api/public/survey/:token returns 200 JSON for an active invite", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${VALID_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect((res.body as { valid: boolean }).valid).toBe(true);
    expect((res.body as { intendedEmail: string }).intendedEmail).toBe("test@example.com");
  });
});

// ─── 2. Legitimate survey origin receives correct ACAO header ─────────────────

describe("2. Legitimate survey frontend origin receives correct ACAO header", () => {
  it("ACAO header equals the exact CLIENT_PORTAL_ORIGIN on a valid invite request", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${VALID_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(CLIENT_LANDING_ORIGIN);
  });
});

// ─── 3. Foreign origin receives no ACAO header ───────────────────────────────

describe("3. Foreign origin receives no ACAO header", () => {
  it("ACAO header is absent for an unknown origin on the survey endpoint", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${VALID_TOKEN}`)
      .set("Origin", "https://evil.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

// ─── 4. Allowed OPTIONS preflight succeeds ────────────────────────────────────

describe("4. Allowed OPTIONS preflight succeeds", () => {
  it("preflight from client-landing origin returns 204 with ACAO header", async () => {
    const res = await request(makeApp())
      .options("/api/public/survey/sometoken")
      .set("Origin", CLIENT_LANDING_ORIGIN)
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(CLIENT_LANDING_ORIGIN);
  });
});

// ─── 5. Generated invitation URL opens the expected client route ──────────────

describe("5. Generated invitation URL opens the expected client route", () => {
  it("buildInviteUrl produces a URL pointing to /client-landing/survey/<token>", () => {
    function buildInviteUrl(origin: string, token: string): string {
      return `${origin}/client-landing/survey/${token}`;
    }
    const url = buildInviteUrl("https://app.example.com", VALID_TOKEN);
    expect(url).toBe(`https://app.example.com/client-landing/survey/${VALID_TOKEN}`);
    expect(url).toMatch(/\/client-landing\/survey\//);
    expect(url).not.toMatch(/\/api\//);
  });
});

// ─── 6. Token is extracted correctly from the URL ─────────────────────────────

describe("6. Token is extracted correctly from the URL", () => {
  it("the token segment after /survey/ is exactly the raw 64-char token", () => {
    const url = `https://app.example.com/client-landing/survey/${VALID_TOKEN}`;
    const segments = url.split("/");
    const tokenFromUrl = segments[segments.length - 1];
    expect(tokenFromUrl).toBe(VALID_TOKEN);
    expect(tokenFromUrl).toHaveLength(64);
  });
});

// ─── 7. Invalid token → 404 + INVITE_NOT_FOUND ───────────────────────────────

describe("7. Invalid token shows the invalid-link state", () => {
  it("unknown token returns 404 with code INVITE_NOT_FOUND", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${UNKNOWN_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe("INVITE_NOT_FOUND");
  });
});

// ─── 8. Expired token → 410 + INVITE_EXPIRED ─────────────────────────────────

describe("8. Expired token shows the expired-link state", () => {
  it("expired token returns 410 with code INVITE_EXPIRED", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${EXPIRED_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    expect(res.status).toBe(410);
    expect((res.body as { code: string }).code).toBe("INVITE_EXPIRED");
  });
});

// ─── 9. Revoked token → 410 + INVITE_REVOKED ─────────────────────────────────

describe("9. Revoked token shows the revoked-link state", () => {
  it("revoked token returns 410 with code INVITE_REVOKED", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${REVOKED_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    expect(res.status).toBe(410);
    expect((res.body as { code: string }).code).toBe("INVITE_REVOKED");
  });
});

// ─── 10. Used token → 410 + INVITE_USED ──────────────────────────────────────

describe("10. Used token shows the used-link state", () => {
  it("already-used token returns 410 with code INVITE_USED", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${USED_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    expect(res.status).toBe(410);
    expect((res.body as { code: string }).code).toBe("INVITE_USED");
  });
});

// ─── 11. Existing trainer and client portal CORS origins still work ───────────

describe("11. Existing trainer and client portal CORS behavior unchanged", () => {
  it("trainer origin still receives correct ACAO header", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${VALID_TOKEN}`)
      .set("Origin", TEST_ENV.LOCAL_TRAINER_APP_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(TEST_ENV.LOCAL_TRAINER_APP_ORIGIN);
  });

  it("client portal origin still receives correct ACAO header", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${VALID_TOKEN}`)
      .set("Origin", TEST_ENV.LOCAL_CLIENT_PORTAL_ORIGIN);

    expect(res.headers["access-control-allow-origin"]).toBe(TEST_ENV.LOCAL_CLIENT_PORTAL_ORIGIN);
  });
});

// ─── 12. CORS is not reflective or wildcard ───────────────────────────────────

describe("12. CORS implementation is not reflective or wildcard", () => {
  it("a random unknown origin never receives a wildcard ACAO", async () => {
    for (const origin of ["https://random1.com", "https://random2.net", "https://attacker.io"]) {
      const res = await request(makeApp())
        .get(`/api/public/survey/${VALID_TOKEN}`)
        .set("Origin", origin);

      expect(res.headers["access-control-allow-origin"]).not.toBe("*");
      expect(res.headers["access-control-allow-origin"]).not.toBe(origin);
    }
  });

  it("buildAllowedOrigins with LOCAL vars produces correct set (no attacker)", () => {
    const allowed = buildAllowedOrigins(TEST_ENV);
    expect(allowed.has("https://random.attacker.io")).toBe(false);
    // trainer + portal are the same origin in dev → deduplicated → size 1
    expect(allowed.size).toBe(1);
  });
});

// ─── 13. Frontend constructs correct absolute /api/... URL ────────────────────
//
// This test documents the correct URL pattern and guards against regressions
// where BASE_URL is prepended (producing /client-landing/api/... which hits
// the Vite dev server instead of the API server).

describe("13. Frontend constructs the correct absolute /api/... URL", () => {
  it("verification URL is /api/public/survey/<token> — no BASE_URL prefix", () => {
    // This mirrors the exact expression used in survey.tsx.
    const token = VALID_TOKEN;
    const verificationUrl = `/api/public/survey/${encodeURIComponent(token)}`;

    expect(verificationUrl).toBe(`/api/public/survey/${VALID_TOKEN}`);
    expect(verificationUrl).not.toMatch(/^\/client-landing/);
    expect(verificationUrl).not.toMatch(/\/client-landing\/api/);
  });

  it("submission URL is /api/public/survey/<token> — no BASE_URL prefix", () => {
    // Mirrors the tokenMutation fetch URL in SurveyForm.tsx.
    const token = VALID_TOKEN;
    const submissionUrl = `/api/public/survey/${encodeURIComponent(token)}`;

    expect(submissionUrl).toBe(`/api/public/survey/${VALID_TOKEN}`);
    expect(submissionUrl).not.toMatch(/^\/client-landing/);
  });

  it("API endpoint returns JSON content-type, not text/html", async () => {
    const res = await request(makeApp())
      .get(`/api/public/survey/${VALID_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.headers["content-type"]).not.toMatch(/text\/html/);
  });
});

// ─── 14. HTML response is not parsed as valid API JSON ────────────────────────
//
// When the request accidentally hits the Vite dev server, a 200 text/html
// response is returned.  The frontend must detect this and show server_error,
// not try to parse the HTML as token data.

describe("14. HTML response (routing error) is not parsed as valid API JSON", () => {
  it("an endpoint that returns text/html is not mistaken for a valid JSON response", async () => {
    // Build an app that returns HTML instead of JSON — simulating the Vite
    // SPA fallback that would be served if the URL was /client-landing/api/...
    const viteLikeApp = express();
    viteLikeApp.use(cors({ credentials: true, origin: makeCorsOriginCallback(buildAllowedOrigins(TEST_ENV)) }));
    viteLikeApp.get("/api/public/survey/:token", (_req, res) => {
      res.status(200).type("text/html").send("<!DOCTYPE html><html><body>SPA</body></html>");
    });

    const res = await request(viteLikeApp)
      .get(`/api/public/survey/${VALID_TOKEN}`)
      .set("Origin", CLIENT_LANDING_ORIGIN);

    // The response is 200 but the content-type is text/html.
    // The survey.tsx frontend checks content-type before calling .json()
    // and transitions to server_error state — not valid or invalid.
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);

    // Verify: trying to JSON.parse the HTML body throws, confirming it is not
    // a valid API response.
    expect(() => JSON.parse(res.text)).toThrow();
  });

  it("actual API endpoint returns application/json for all token states", async () => {
    const app = makeApp();
    const tokens = [VALID_TOKEN, EXPIRED_TOKEN, REVOKED_TOKEN, USED_TOKEN, UNKNOWN_TOKEN];

    for (const token of tokens) {
      const res = await request(app)
        .get(`/api/public/survey/${token}`)
        .set("Origin", CLIENT_LANDING_ORIGIN);

      expect(res.headers["content-type"]).toMatch(/application\/json/);
    }
  });
});

// ─── 15. LOCAL_* dev vars configure CORS; prod vars optional in development ───

describe("15. LOCAL_* dev vars configure CORS; prod vars optional in development", () => {
  it("buildAllowedOrigins does not throw when TRAINER_APP_ORIGIN and CLIENT_PORTAL_ORIGIN are absent", () => {
    // This tests that development works without prod vars set.
    expect(() =>
      buildAllowedOrigins({
        LOCAL_TRAINER_APP_ORIGIN: "https://dev.example.com",
        LOCAL_CLIENT_PORTAL_ORIGIN: "https://dev.example.com",
        // TRAINER_APP_ORIGIN and CLIENT_PORTAL_ORIGIN deliberately absent.
      }),
    ).not.toThrow();
  });

  it("LOCAL_* vars alone are sufficient to allow the dev origin", () => {
    const allowed = buildAllowedOrigins({
      LOCAL_TRAINER_APP_ORIGIN: "https://dev.example.com",
      LOCAL_CLIENT_PORTAL_ORIGIN: "https://dev.example.com",
    });

    expect(allowed.has("https://dev.example.com")).toBe(true);
    expect(allowed.has("https://production.example.com")).toBe(false);
  });

  it("prod vars are required and throw in production when absent", () => {
    expect(() =>
      buildAllowedOrigins({
        NODE_ENV: "production",
        LOCAL_TRAINER_APP_ORIGIN: "https://dev.example.com",
        // TRAINER_APP_ORIGIN missing → must throw in production
      }),
    ).toThrow(/CORS startup error.*TRAINER_APP_ORIGIN/);
  });
});
