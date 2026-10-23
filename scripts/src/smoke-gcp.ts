/**
 * Smoke test for a running trainer-panel (scripts/dev-gcp.sh).
 *
 * Signs in as real Clerk development-instance test users (created on demand
 * via the Clerk Backend API — free, dev instance only), then:
 *   1. walks the main loop: survey invite → public survey → client visible to
 *      trainer → plan (day + exercise, activated) → generator → portal invite
 *      → client account activation → plan visible in the client portal,
 *   2. checks isolation: trainer B and client B1 never see trainer A's or
 *      client A1's data, and no session → 401,
 *   3. checks that every trainer GET endpoint answers for its owner.
 *
 * Usage: scripts/smoke-gcp.sh   (reads CLERK_SECRET_KEY from .env, never prints it)
 * Exit code 0 = all checks OK.
 */

const API = process.env.SMOKE_API_URL ?? "http://localhost:8080/api";
const CLERK_API = "https://api.clerk.com/v1";
const SECRET = process.env.CLERK_SECRET_KEY ?? "";

if (!SECRET.startsWith("sk_test_")) {
  console.error("CLERK_SECRET_KEY must be a development key (sk_test_…) — smoke test refuses to run.");
  process.exit(2);
}

// ─── Reporting ────────────────────────────────────────────────────────────────

const results: { ok: boolean; name: string; detail: string }[] = [];

function check(name: string, ok: boolean, detail = ""): boolean {
  results.push({ ok, name, detail });
  console.log(`${ok ? "OK   " : "BŁĄD "} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

// ─── Clerk dev-instance helpers ───────────────────────────────────────────────

async function clerk<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(CLERK_API + path, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
      // Clerk's edge rejects some default client user agents (Cloudflare 1010).
      "User-Agent": "trainer-panel-smoke/1.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Clerk ${method} ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function ensureUser(name: string): Promise<string> {
  const email = `${name}+clerk_test@example.com`;
  const found = await clerk<{ id: string }[]>("GET", `/users?email_address=${encodeURIComponent(email)}`);
  if (found.length > 0) return found[0].id;
  const created = await clerk<{ id: string }>("POST", "/users", {
    email_address: [email],
    first_name: name,
    skip_password_requirement: true,
  });
  return created.id;
}

async function sessionToken(userId: string): Promise<string> {
  const session = await clerk<{ id: string }>("POST", "/sessions", { user_id: userId });
  const { jwt } = await clerk<{ jwt: string }>("POST", `/sessions/${session.id}/tokens`, {
    expires_in_seconds: 600,
  });
  return jwt;
}

// ─── API helper ───────────────────────────────────────────────────────────────

type Res = { status: number; body: any; ms: number };

async function call(token: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const started = Date.now();
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: parsed, ms: Date.now() - started };
}

const leaks = (r: Res, needle: string) => JSON.stringify(r.body ?? "").includes(needle);

/** Short failure detail: HTTP status plus the API's error code/message. */
function why(r: Res): string {
  const b = (r.body ?? {}) as { code?: string; error?: string; message?: string };
  const msg = b.code ?? b.message ?? b.error;
  return `HTTP ${r.status}${r.status >= 400 && msg ? ` ${String(msg).slice(0, 120)}` : ""}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const t0 = Date.now();
  const health = await call(null, "GET", "/healthz");
  if (!check("API healthz", health.status === 200, `HTTP ${health.status}`)) return;

  const [idA, idB, idK, idKB] = await Promise.all(
    ["trener-a", "trener-b", "klient-a1", "klient-b1"].map(ensureUser),
  );
  const [A, B, K, KB] = await Promise.all([idA, idB, idK, idKB].map(sessionToken));
  // The trainer app creates trainer profiles right after sign-in.
  for (const [name, tok] of [["A", A], ["B", B]] as const) {
    const profile = await call(tok, "POST", "/trainer/profile");
    check(`trener ${name}: profil trenera (POST /trainer/profile)`, profile.status === 200, why(profile));
  }
  const run = `smoke-${Date.now()}`;
  const email = `${run}@example.invalid`;

  // The FREE plan allows 3 clients: remove clients left by earlier smoke runs
  // (only test-account clients with a smoke-…@example.invalid address).
  const before = await call(A, "GET", "/clients");
  for (const c of (Array.isArray(before.body) ? before.body : []) as { id: number; email: string | null }[]) {
    if (c.email && /^smoke-\d+@example\.invalid$/.test(c.email)) await call(A, "DELETE", `/clients/${c.id}`);
  }

  // ── 1. Invite → public survey → client visible to trainer A ────────────────
  const invite = await call(A, "POST", "/survey-invites", { intendedEmail: null });
  check("A: utworzenie zaproszenia do ankiety", invite.status === 201 && !!invite.body?.token, `HTTP ${invite.status}`);
  const token: string = invite.body?.token;

  const surveyGet = await call(null, "GET", `/public/survey/${token}`);
  check("klient: otwarcie linku ankiety", surveyGet.status === 200, `HTTP ${surveyGet.status}`);

  const submit = await call(null, "POST", `/public/survey/${token}`, {
    firstName: "Smoke",
    lastName: run,
    email,
    dateOfBirth: "1992-05-10",
    gender: "Kobieta",
    trainingGoal: "Poprawa sylwetki",
    experienceLevel: "Początkujący",
    trainingDuration: "Mniej niż 6 miesięcy",
    weeklyFrequency: 2,
    desiredWeeklyFrequency: 3,
    sessionDuration: "60 minut",
    trainingLocation: "Siłownia",
    equipment: "Hantle, Sztanga i talerze, Ławeczka treningowa",
    injuryStatus: "Brak",
    heightCm: 168,
    weightKg: 62,
    activityLevel: "Lekko aktywny",
  });
  check("klient: wysłanie ankiety", submit.status === 201 && !!submit.body?.clientId, `HTTP ${submit.status}`);
  const clientId: number = submit.body?.clientId;

  const reuse = await call(null, "POST", `/public/survey/${token}`, { firstName: "X", lastName: "Y", email, dateOfBirth: "1990-01-01", gender: "Kobieta" });
  check("ponowne użycie zaproszenia zablokowane", reuse.status === 410 || reuse.status === 409, `HTTP ${reuse.status}`);

  const clientsA = await call(A, "GET", "/clients");
  check("A: nowy klient widoczny na liście", clientsA.status === 200 && leaks(clientsA, email), `HTTP ${clientsA.status}`);

  const surveyA = await call(A, "GET", `/clients/${clientId}/survey`);
  check("A: ankieta klienta widoczna", surveyA.status === 200 && surveyA.body?.experienceLevel === "Początkujący", `HTTP ${surveyA.status}`);
  const surveyId: number = surveyA.body?.id;

  // ── 2. Plan: create → day → exercise → activate; generator answers ─────────
  const plan = await call(A, "POST", `/clients/${clientId}/plans`, { title: `Plan ${run}`, surveyId, splitType: "full_body" });
  check("A: utworzenie planu", plan.status === 201, why(plan));
  const planId: number = plan.body?.id;

  const day = await call(A, "POST", `/plans/${planId}/days`, { dayName: "Dzień A" });
  check("A: dodanie dnia planu", day.status === 201, why(day));
  // The endpoint returns the whole plan; the new day is the last one.
  const days = (day.body?.days ?? []) as { id: number }[];
  const dayId: number = days[days.length - 1]?.id;

  const ex = await call(A, "POST", `/plans/${planId}/days/${dayId}/exercises`, {
    exerciseId: 1,
    workingSets: 3,
    repType: "range",
    repRangeMin: 8,
    repRangeMax: 12,
  });
  check("A: dodanie ćwiczenia do dnia", ex.status === 201, why(ex));

  const edit = await call(A, "PATCH", `/plans/${planId}`, { trainerNotes: "smoke edit" });
  check("A: edycja planu", edit.status === 200, `HTTP ${edit.status}`);

  const activate = await call(A, "POST", `/plans/${planId}/activate`);
  check("A: aktywacja planu (przypisanie klientowi)", activate.status === 200, why(activate));

  const draftInput = await call(A, "GET", `/clients/${clientId}/plan-draft-input`);
  check("A: generator — dane wejściowe szkicu", draftInput.status === 200, `HTTP ${draftInput.status} ${draftInput.ms} ms`);
  const recs = await call(A, "GET", `/clients/${clientId}/plan-draft/day-recommendations?sessionType=full_body`);
  check("A: generator — rekomendacje dnia", recs.status === 200, `HTTP ${recs.status} ${recs.ms} ms`);

  // ── 3. Client portal: invite → activate → plan visible ─────────────────────
  const portalInvite = await call(A, "POST", `/clients/${clientId}/invite`);
  check("A: zaproszenie klienta do portalu", portalInvite.status === 201 && !!portalInvite.body?.token, `HTTP ${portalInvite.status}`);
  // klient-a1 is reused between runs; a previous run's link blocks a new one.
  const activateK = await call(K, "POST", `/client-invitations/${portalInvite.body?.token}/activate`);
  const kLinked = activateK.status === 200;
  check(
    "klient A1: aktywacja konta w portalu",
    kLinked || activateK.status === 409,
    `HTTP ${activateK.status}${activateK.status === 409 ? " (konto powiązane z klientem z poprzedniego przebiegu)" : ""}`,
  );
  const portalPlan = await call(K, "GET", "/client-portal/plan");
  if (kLinked) {
    check("klient A1: widzi przypisany plan", portalPlan.status === 200 && leaks(portalPlan, `Plan ${run}`), `HTTP ${portalPlan.status}`);
  } else {
    check("klient A1: portal odpowiada", portalPlan.status === 200, `HTTP ${portalPlan.status}`);
  }

  // A client portal account never becomes a trainer.
  if (kLinked) {
    const kClients = await call(K, "GET", "/clients");
    check("klient A1: endpoint trenera → 403 CLIENT_ACCOUNT", kClients.status === 403 && kClients.body?.code === "CLIENT_ACCOUNT", why(kClients));
    const kProfile = await call(K, "POST", "/trainer/profile");
    check("klient A1: nie może założyć profilu trenera", kProfile.status === 403, why(kProfile));
  }

  // ── 4. Isolation ────────────────────────────────────────────────────────────
  const trainerScoped: [string, string][] = [
    ["GET", `/clients/${clientId}`],
    ["GET", `/clients/${clientId}/survey`],
    ["GET", `/clients/${clientId}/surveys`],
    ["GET", `/clients/${clientId}/surveys/${surveyId}`],
    ["GET", `/clients/${clientId}/notes`],
    ["GET", `/clients/${clientId}/plans`],
    ["GET", `/clients/${clientId}/avoided-exercises`],
    ["GET", `/clients/${clientId}/exercise-recommendations`],
    ["GET", `/clients/${clientId}/invite/status`],
    ["GET", `/clients/${clientId}/plan-draft-input`],
    ["GET", `/clients/${clientId}/plan-draft/day-recommendations?sessionType=full_body`],
    ["GET", `/clients/${clientId}/portal-preview`],
    ["GET", `/clients/${clientId}/workout-sessions`],
    ["GET", `/plans/${planId}`],
    ["PATCH", `/plans/${planId}`],
    ["PATCH", `/clients/${clientId}`],
    ["POST", `/clients/${clientId}/notes`],
    ["POST", `/clients/${clientId}/plans`],
    ["POST", `/plans/${planId}/days`],
    ["DELETE", `/plans/${planId}/days/${dayId}`],
  ];
  const bodyFor = (m: string) => (m === "GET" || m === "DELETE" ? undefined : { title: "intruz", content: "intruz", trainerNotes: "intruz", dayName: "intruz" });

  for (const [method, path] of trainerScoped) {
    const asB = await call(B, method, path, bodyFor(method));
    check(`izolacja trener B: ${method} ${path}`, (asB.status === 404 || asB.status === 403) && !leaks(asB, email), `HTTP ${asB.status}`);
    const asK = await call(K, method, path, bodyFor(method));
    check(`izolacja klient A1 (endpoint trenera): ${method} ${path}`, asK.status >= 400 && !leaks(asK, email), `HTTP ${asK.status}`);
    const anon = await call(null, method, path, bodyFor(method));
    check(`brak sesji: ${method} ${path}`, anon.status === 401, `HTTP ${anon.status}`);
  }

  for (const path of ["/clients", "/stats", "/survey-invites", "/dashboard/summary"]) {
    const asB = await call(B, "GET", path);
    check(`izolacja trener B: lista ${path} bez danych A`, asB.status === 200 && !leaks(asB, email) && !leaks(asB, run), `HTTP ${asB.status}`);
  }

  const noSession = await call(null, "GET", "/dashboard/summary");
  check("brak sesji: GET /dashboard/summary", noSession.status === 401, `HTTP ${noSession.status}`);

  // A's plan must still be intact after the intrusion attempts.
  const after = await call(A, "GET", `/plans/${planId}`);
  check("dane A nienaruszone po próbach B", after.status === 200 && JSON.stringify(after.body).includes("smoke edit") && !JSON.stringify(after.body).includes("intruz"), `HTTP ${after.status}`);

  // Client B1 (not linked to any client of A) must not see A1's portal data.
  for (const path of ["/client-portal/plan", "/client-portal/sessions", "/client-portal/history"]) {
    const asKB = await call(KB, "GET", path);
    check(`izolacja klient B1: ${path}`, !leaks(asKB, `Plan ${run}`) && !leaks(asKB, email), `HTTP ${asKB.status}`);
  }
  for (const path of ["/client-portal/plan", "/client-portal/sessions"]) {
    const anon = await call(null, "GET", path);
    check(`brak sesji: ${path}`, anon.status === 401, `HTTP ${anon.status}`);
  }

  // ── 5. Every trainer GET endpoint answers for its owner ─────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const ownerGets = [
    "/stats",
    "/dashboard/summary",
    "/training-goals-distribution",
    "/subscription/summary",
    "/survey-invites",
    "/clients",
    "/availability",
    `/availability/exceptions?from=${today}&to=${in30}`,
    `/availability/calendar?from=${today}&to=${in30}`,
    "/bookings/upcoming",
    "/exercises",
    "/muscles",
    ...trainerScoped.filter(([m]) => m === "GET").map(([, p]) => p),
  ];
  for (const path of ownerGets) {
    const r = await call(A, "GET", path);
    check(`A: GET ${path}`, r.status === 200, `HTTP ${r.status} ${r.ms} ms`);
  }

  const cleanup = await call(A, "DELETE", `/clients/${clientId}`);
  check("A: usunięcie klienta testowego (sprzątanie)", cleanup.status === 204 || cleanup.status === 200, `HTTP ${cleanup.status}`);

  console.log(`\nCzas: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main()
  .catch((err) => check("przebieg testu dymnego", false, err instanceof Error ? err.message : String(err)))
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\nPodsumowanie: ${results.length - failed.length} OK, ${failed.length} BŁĄD`);
    for (const f of failed) console.log(`  BŁĄD ${f.name} — ${f.detail}`);
    process.exit(failed.length === 0 ? 0 : 1);
  });
