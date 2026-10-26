/**
 * Session packages (block 7). Pure rules + small DB helpers. No online payments; the price is visible only to the trainer.
 *
 * remaining = total − sessions that were not voided. Reminders for the trainer: 2 or fewer sessions left, and validity ending
 * within 7 days (or already over). The client sees only "zostało X sesji" and only when the trainer allowed it.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, clientPackagesTable, packageSessionsTable, type ClientPackage } from "@workspace/db";

export const LOW_SESSIONS_THRESHOLD = 2;
export const EXPIRY_WARNING_DAYS = 7;

export type PackageReminder = { code: "LOW_SESSIONS" | "NO_SESSIONS" | "EXPIRING" | "EXPIRED"; text: string };

export function remainingSessions(total: number, used: number): number {
  return Math.max(0, total - used);
}

const DAY = 86_400_000;
const utcDay = (d: Date | string) => Math.floor((typeof d === "string" ? Date.parse(d + "T00:00:00Z") : d.getTime()) / DAY);

/** Reminders for an ACTIVE package. `today` is injectable for tests. */
export function packageReminders(p: { totalSessions: number; validUntil: string | null; status: string }, used: number, today: Date = new Date()): PackageReminder[] {
  if (p.status !== "active") return [];
  const out: PackageReminder[] = [];
  const left = remainingSessions(p.totalSessions, used);
  if (left === 0) out.push({ code: "NO_SESSIONS", text: "Pakiet wykorzystany — wszystkie sesje odbyte." });
  else if (left <= LOW_SESSIONS_THRESHOLD) out.push({ code: "LOW_SESSIONS", text: left === 1 ? "Została 1 sesja w pakiecie." : `Zostały ${left} sesje w pakiecie.` });
  if (p.validUntil) {
    const days = utcDay(p.validUntil) - utcDay(today);
    if (days < 0) out.push({ code: "EXPIRED", text: "Pakiet stracił ważność." });
    else if (days <= EXPIRY_WARNING_DAYS) out.push({ code: "EXPIRING", text: days === 0 ? "Pakiet traci ważność dziś." : `Pakiet traci ważność za ${days} ${days === 1 ? "dzień" : "dni"}.` });
  }
  return out;
}

export interface PackageView {
  id: number; clientId: number; title: string; totalSessions: number; usedSessions: number; remaining: number;
  pricePln: string | null; validUntil: string | null; showToClient: boolean; status: string; createdAt: Date;
  reminders: PackageReminder[];
}

export async function usedCounts(packageIds: number[]): Promise<Map<number, number>> {
  if (packageIds.length === 0) return new Map();
  const rows = await db
    .select({ packageId: packageSessionsTable.packageId, n: sql<number>`count(*)::int` })
    .from(packageSessionsTable)
    .where(and(sql`${packageSessionsTable.packageId} in (${sql.join(packageIds.map((i) => sql`${i}`), sql`, `)})`, isNull(packageSessionsTable.voidedAt)))
    .groupBy(packageSessionsTable.packageId);
  return new Map(rows.map((r) => [r.packageId, r.n]));
}

export function toView(p: ClientPackage, used: number, today: Date = new Date()): PackageView {
  return {
    id: p.id, clientId: p.clientId, title: p.title, totalSessions: p.totalSessions, usedSessions: used, remaining: remainingSessions(p.totalSessions, used),
    pricePln: p.pricePln, validUntil: p.validUntil, showToClient: p.showToClient, status: p.status, createdAt: p.createdAt,
    reminders: packageReminders(p, used, today),
  };
}

export async function activePackageOf(clientId: number): Promise<ClientPackage | undefined> {
  const [p] = await db.select().from(clientPackagesTable).where(and(eq(clientPackagesTable.clientId, clientId), eq(clientPackagesTable.status, "active")));
  return p;
}
