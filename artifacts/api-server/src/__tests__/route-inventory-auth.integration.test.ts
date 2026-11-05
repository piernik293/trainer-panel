/**
 * Inwentarz tras: KAŻDA trasa API, wywołana bez sesji, nie może zwrócić danych.
 * Lista tras jest czytana z samego routera (nie ręczna), więc nowa trasa bez zabezpieczenia wywali ten test.
 * Wyjątki (trasy publiczne) są w PUBLIC z uzasadnieniem — dopisanie trasy do listy wymaga świadomej decyzji.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";

const auth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: auth.userId }),
  clerkClient: { users: { getUser: async () => ({ firstName: "X", lastName: "Y", primaryEmailAddress: { emailAddress: "inw@poczta-testowa.pl" } }) } },
}));
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import app from "../app";
import router from "../routes";
import { pool, db, trainerApplicationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type Layer = { route?: { path: string | string[]; methods: Record<string, boolean> }; handle?: { stack?: Layer[] } };
function collect(stack: Layer[], out: { method: string; path: string }[] = []) {
  for (const l of stack) {
    if (l.route) {
      const paths = Array.isArray(l.route.path) ? l.route.path : [l.route.path];
      for (const p of paths) for (const m of Object.keys(l.route.methods)) if (l.route.methods[m]) out.push({ method: m, path: p });
    } else if (l.handle?.stack) collect(l.handle.stack, out);
  }
  return out;
}

/** Trasy dostępne bez sesji — każda z uzasadnieniem (zob. docs/BEZPIECZENSTWO-BETA.md, sekcja 3). */
const PUBLIC: Record<string, string> = {
  "GET /healthz": "status bez danych",
  "GET /ui-v2/status": "tylko flaga", "GET /brand-v1/status": "tylko flaga", "GET /own-plan/status": "tylko flaga", "GET /roadmap/status": "tylko flaga", "GET /solo/status": "tylko flaga",
  "GET /achievements/status": "tylko flaga", "GET /feedback/status": "tylko flaga", "GET /golden-bulls/status": "licznik wolnych miejsc, bez danych osób",
  "GET /contact": "publiczny adres kontaktowy firmy", "GET /guest-demo/status": "tylko flaga", "GET /methods/status": "tylko flaga", "GET /calisthenics/status": "tylko flaga",
  "GET /own-plan/template.csv": "statyczny szablon CSV bez danych (link do pobrania, za flagą)",
  "POST /client-errors": "błąd przed logowaniem; limit, treść oczyszczana",
  "GET /client-invitations/:token": "token 256-bit", "GET /public/survey/:token": "token 256-bit", "POST /public/survey/:token": "token 256-bit",
  "GET /join/:code": "kod; tylko imię trenera", "GET /muscles": "słownik publiczny", "GET /volume-guidelines": "tabela publiczna",
  "GET /exercises": "katalog publiczny", "GET /exercises/search": "katalog publiczny", "GET /exercises/:id": "publiczne ćwiczenia; prywatne 404",
  "GET /exercises/:id/muscles": "jak wyżej", "GET /exercises/:id/progressions": "jak wyżej", "GET /exercises/:id/substitutions": "jak wyżej",
};

const routes = collect((router as unknown as { stack: Layer[] }).stack);
const fill = (p: string) => "/api" + p.replace(/:[A-Za-z]+/g, "1");

describe("inwentarz tras bez sesji", () => {
  beforeAll(() => { vi.stubEnv("SOLO_ENABLED", "1"); vi.stubEnv("OWN_PLAN_ENABLED", "1"); vi.stubEnv("UI_V2_ENABLED", "1"); vi.stubEnv("ACHIEVEMENTS_ENABLED", "1"); vi.stubEnv("FEEDBACK_ENABLED", "1"); vi.stubEnv("GOLDEN_BULLS_ENABLED", "1"); vi.stubEnv("ROADMAP_ENABLED", "1"); });
  afterAll(async () => { await db.delete(trainerApplicationsTable).where(eq(trainerApplicationsTable.clerkUserId, "inw_zwykle_konto")).catch(() => {}); vi.unstubAllEnvs(); await pool.end(); });

  it("router ma sensowną liczbę tras (test nie jest pusty)", () => { expect(routes.length).toBeGreaterThan(150); });

  it("żadna trasa spoza listy publicznej nie odpowiada 2xx bez sesji", async () => {
    const bad: string[] = [];
    for (const r of routes) {
      const key = `${r.method.toUpperCase()} ${r.path}`;
      if (PUBLIC[key]) continue;
      const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[r.method](fill(r.path)).send({});
      if (res.status < 400) bad.push(`${key} → ${res.status}`);
    }
    expect(bad).toEqual([]);
  }, 120_000);

  it("zalogowane konto BEZ roli administratora nie dotyka żadnej trasy /admin ani katalogu (2xx = błąd)", async () => {
    auth.userId = "inw_zwykle_konto";
    const bad: string[] = [];
    for (const r of routes.filter((x) => x.path.startsWith("/admin"))) {
      const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[r.method](fill(r.path)).send({});
      if (res.status < 400) bad.push(`${r.method.toUpperCase()} ${r.path} → ${res.status}`);
    }
    auth.userId = null;
    expect(bad).toEqual([]);
  }, 120_000);

  it("zalogowane konto bez rekordu trenera/podopiecznego nie dostaje danych z tras trenera i podopiecznego", async () => {
    auth.userId = "inw_zwykle_konto";
    const bad: string[] = [];
    for (const r of routes) {
      const key = `${r.method.toUpperCase()} ${r.path}`;
      if (PUBLIC[key] || !(r.path.startsWith("/clients") || r.path.startsWith("/client-portal") || r.path.startsWith("/plans") || r.path.startsWith("/trainer") || r.path.startsWith("/dashboard") || r.path.startsWith("/stats"))) continue;
      if (r.path === "/trainer-applications" || r.path === "/trainer/profile" || r.path.startsWith("/client-portal/disconnect")) continue; // zakładanie profilu to osobna ścieżka (lista dopuszczonych)
      const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[r.method](fill(r.path)).send({});
      if (res.status < 400) bad.push(`${key} → ${res.status}`);
    }
    auth.userId = null;
    expect(bad).toEqual([]);
  }, 120_000);

  it("trasy publiczne z listy nadal istnieją (lista nie gnije)", () => {
    const have = new Set(routes.map((r) => `${r.method.toUpperCase()} ${r.path}`));
    const missing = Object.keys(PUBLIC).filter((k) => !have.has(k));
    expect(missing).toEqual([]);
  });
});
