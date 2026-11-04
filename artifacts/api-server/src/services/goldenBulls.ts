/**
 * „Złote Byczki” (docs/CENNIK.md) — za flagą GOLDEN_BULLS_ENABLED (domyślnie wyłączona).
 * Pule: GOLDEN_BULLS_TRAINER_POOL (domyślnie 10) i GOLDEN_BULLS_SOLO_POOL (100). Przyznanie automatyczne: trener — przy akceptacji wniosku, Solo — przy pierwszym
 * ukończonym treningu. Odporne na równoczesne zapisy (transakcja + blokada doradcza na rodzaj puli), bez duplikatów (unikalne: rodzaj+numer, konto+rodzaj).
 * Konta administratora, QA i testowe nie zabierają miejsc. Trener-Byczek: Pro gratis przez GOLDEN_BULLS_TRAINER_MONTHS (6; druga fala 3) przez istniejący mechanizm
 * okresu próbnego (trial_ends_at); Solo: przyszłe płatne funkcje gratis 3 mies. od startu (perks_until). Nic „na zawsze” poza samą odznaką.
 */
import { and, eq, isNull, sql, desc } from "drizzle-orm";
import { db, goldenBullsTable, trainersTable, clientsTable, type GoldenBull } from "@workspace/db";
import { logger } from "../lib/logger";
import { checkIsAppAdmin } from "../middlewares/requireAuth";
import { accountEmail, isPlaceholderAddress } from "./mailAddress";

export type BullKind = "trainer" | "solo";
export const goldenBullsEnabled = (env: NodeJS.ProcessEnv = process.env) => env["GOLDEN_BULLS_ENABLED"] === "1";
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : d; };
export const poolFor = (kind: BullKind, env: NodeJS.ProcessEnv = process.env) => (kind === "trainer" ? num(env["GOLDEN_BULLS_TRAINER_POOL"], 10) : num(env["GOLDEN_BULLS_SOLO_POOL"], 100));
export const monthsFor = (kind: BullKind, env: NodeJS.ProcessEnv = process.env) => (kind === "trainer" ? num(env["GOLDEN_BULLS_TRAINER_MONTHS"], 6) : num(env["GOLDEN_BULLS_SOLO_MONTHS"], 3));
const LOCK = { trainer: 730101, solo: 730102 } as const;

/** Konto testowe / QA / zastępcze: nie zabiera miejsca w puli. */
export function isTestEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase();
  return !e || /\+clerk_test@/.test(e) || isPlaceholderAddress(e);
}
export function isExcludedAccount(clerkUserId: string, email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const listed = (env["GOLDEN_BULLS_EXCLUDE_CLERK_IDS"] ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return listed.includes(clerkUserId) || checkIsAppAdmin(clerkUserId) || isTestEmail(email);
}

const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };

/** Zajęte miejsca (nieodebrane odznaki). */
async function activeCount(kind: BullKind, tx: Pick<typeof db, "select"> = db): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(goldenBullsTable).where(and(eq(goldenBullsTable.kind, kind), isNull(goldenBullsTable.revokedAt)));
  return r?.n ?? 0;
}

export async function bullStatus() {
  const enabled = goldenBullsEnabled();
  const left = async (kind: BullKind) => Math.max(0, poolFor(kind) - (await activeCount(kind)));
  return { enabled, trainer: { pool: poolFor("trainer"), left: enabled ? await left("trainer") : 0 }, solo: { pool: poolFor("solo"), left: enabled ? await left("solo") : 0 } };
}

export interface GrantTarget { clerkUserId: string; trainerId?: number | null; clientId?: number | null; email?: string | null }
export interface GrantOpts { by?: string; reason?: string | null; ignoreExclusion?: boolean; now?: Date }

/** Przyznaje odznakę, jeśli flaga włączona, konto nie jest wykluczone, nie ma jej już i pula nie jest pusta. Zwraca nową/istniejącą odznakę albo null. Nie rzuca. */
export async function grantBull(kind: BullKind, t: GrantTarget, o: GrantOpts = {}): Promise<GoldenBull | null> {
  try {
    if (!goldenBullsEnabled()) return null;
    const email = t.email ?? (await accountEmail(t.clerkUserId, null));
    if (!o.ignoreExclusion && isExcludedAccount(t.clerkUserId, email)) return null;
    const now = o.now ?? new Date();
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${LOCK[kind]})`);
      const [existing] = await tx.select().from(goldenBullsTable).where(and(eq(goldenBullsTable.clerkUserId, t.clerkUserId), eq(goldenBullsTable.kind, kind)));
      if (existing) return existing.revokedAt ? null : existing; // odebranej nie przyznajemy drugi raz automatycznie
      if ((await activeCount(kind, tx)) >= poolFor(kind)) return null;
      const [mx] = await tx.select({ m: sql<number>`coalesce(max(${goldenBullsTable.number}), 0)::int` }).from(goldenBullsTable).where(eq(goldenBullsTable.kind, kind));
      const perks = addMonths(now, monthsFor(kind));
      const [row] = await tx.insert(goldenBullsTable).values({
        kind, number: (mx?.m ?? 0) + 1, clerkUserId: t.clerkUserId, trainerId: t.trainerId ?? null, clientId: t.clientId ?? null,
        grantedAt: now, grantedBy: o.by ?? "auto", reason: o.reason ?? null, perksUntil: perks,
      }).returning();
      if (kind === "trainer" && t.trainerId) {
        // Pro gratis przez istniejący mechanizm okresu próbnego: koniec = późniejsza z dat (nigdy nie skracamy tego, co trener już ma)
        const [tr] = await tx.select({ endsAt: trainersTable.trialEndsAt, startedAt: trainersTable.trialStartedAt }).from(trainersTable).where(eq(trainersTable.id, t.trainerId));
        const end = tr?.endsAt && tr.endsAt > perks ? tr.endsAt : perks;
        await tx.update(trainersTable).set({ trialEndsAt: end, trialStartedAt: tr?.startedAt ?? now }).where(eq(trainersTable.id, t.trainerId));
      }
      return row!;
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), kind }, "Złoty Byczek: nie przyznano (błąd)");
    return null;
  }
}

/** Odebranie z powodem (np. konto testowe): zwalnia miejsce w puli; trener traci Pro gratis (koniec okresu = teraz, jeśli wynikał z Byczka). */
export async function revokeBull(id: number, reason: string, by: string): Promise<GoldenBull | null> {
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(goldenBullsTable).where(eq(goldenBullsTable.id, id));
    if (!b || b.revokedAt) return null;
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK[b.kind as BullKind]})`);
    const [row] = await tx.update(goldenBullsTable).set({ revokedAt: new Date(), revokedReason: reason, revokedBy: by }).where(eq(goldenBullsTable.id, id)).returning();
    if (b.kind === "trainer" && b.trainerId && b.perksUntil) {
      const [tr] = await tx.select({ endsAt: trainersTable.trialEndsAt }).from(trainersTable).where(eq(trainersTable.id, b.trainerId));
      if (tr?.endsAt && tr.endsAt.getTime() === b.perksUntil.getTime()) await tx.update(trainersTable).set({ trialEndsAt: new Date() }).where(eq(trainersTable.id, b.trainerId));
    }
    return row!;
  });
}

/** Aktywna odznaka konta (do profilu, story, pulpitu) — rodzaj i numer; null, gdy brak lub flaga wyłączona. */
export async function bullOf(clerkUserId: string | null | undefined): Promise<{ kind: BullKind; number: number; perksUntil: Date | null } | null> {
  if (!clerkUserId || !goldenBullsEnabled()) return null;
  const rows = await db.select().from(goldenBullsTable).where(and(eq(goldenBullsTable.clerkUserId, clerkUserId), isNull(goldenBullsTable.revokedAt))).orderBy(desc(goldenBullsTable.id)).limit(1);
  const b = rows[0];
  return b ? { kind: b.kind as BullKind, number: b.number, perksUntil: b.perksUntil } : null;
}

export async function listBulls() {
  return db.select({
    id: goldenBullsTable.id, kind: goldenBullsTable.kind, number: goldenBullsTable.number, grantedAt: goldenBullsTable.grantedAt, grantedBy: goldenBullsTable.grantedBy, reason: goldenBullsTable.reason,
    perksUntil: goldenBullsTable.perksUntil, revokedAt: goldenBullsTable.revokedAt, revokedReason: goldenBullsTable.revokedReason,
    trainerName: trainersTable.displayName, trainerEmail: trainersTable.email, clientFirstName: clientsTable.firstName, clerkUserId: goldenBullsTable.clerkUserId,
  }).from(goldenBullsTable)
    .leftJoin(trainersTable, eq(trainersTable.id, goldenBullsTable.trainerId))
    .leftJoin(clientsTable, eq(clientsTable.id, goldenBullsTable.clientId))
    .orderBy(goldenBullsTable.kind, goldenBullsTable.number);
}
