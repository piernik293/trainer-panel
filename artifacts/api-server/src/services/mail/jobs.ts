/**
 * Maile wysyłane automatycznie, bez zdarzenia w aplikacji: okres próbny trenera (3 dni przed końcem i w dniu końca) oraz pakiet sesji, który się kończy
 * (zostały 2 sesje lub mniej). Każdy mail wychodzi najwyżej raz (tabela mail_log). Uruchamiane co kilka godzin z `startMailJobs()` (wyłączenie: MAIL_JOBS_ENABLED=0).
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, trainersTable, clientsTable, clientPackagesTable, packageSessionsTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { accountEmail } from "../mailAddress";
import { trialInfo, TRIAL_WARNING_DAYS } from "../trial";
import { sendCatalogueMail } from "./send";
import { firstName } from "../applicationMail";

const DAY = 86_400_000;

export async function runMailJobs(now: Date = new Date()): Promise<{ trial: number; packages: number }> {
  let trial = 0, packages = 0;

  const trainers = await db.select({ id: trainersTable.id, name: trainersTable.displayName, email: trainersTable.email, clerkUserId: trainersTable.clerkUserId, endsAt: trainersTable.trialEndsAt }).from(trainersTable).where(isNotNull(trainersTable.trialEndsAt));
  for (const t of trainers) {
    const info = trialInfo(t.endsAt, now);
    const ref = `${t.id}:${t.endsAt!.toISOString()}`; // przedłużenie przez administratora zmienia datę końca, więc zapowiedź i koniec mogą wyjść ponownie
    const to = await accountEmail(t.clerkUserId, t.email);
    if (info.state === "active" && info.daysLeft <= TRIAL_WARNING_DAYS) {
      if (await sendCatalogueMail("trial_ending", { to, data: { name: firstName(t.name), daysLeft: info.daysLeft }, once: { kind: "trial_ending", ref } })) trial++;
    } else if (info.state === "ended" && now.getTime() - t.endsAt!.getTime() < 3 * DAY) { // nie wysyłamy „zaległych” starych końców
      if (await sendCatalogueMail("trial_ended", { to, data: { name: firstName(t.name) }, once: { kind: "trial_ended", ref } })) trial++;
    }
  }

  const rows = await db.select({
    id: clientPackagesTable.id, total: clientPackagesTable.totalSessions, trainerId: clientPackagesTable.trainerId, clientFirst: clientsTable.firstName,
    trainerName: trainersTable.displayName, trainerEmail: trainersTable.email, trainerClerk: trainersTable.clerkUserId,
    used: sql<number>`(select count(*)::int from ${packageSessionsTable} where ${packageSessionsTable.packageId} = ${clientPackagesTable.id} and ${packageSessionsTable.voidedAt} is null)`,
  }).from(clientPackagesTable)
    .innerJoin(clientsTable, eq(clientsTable.id, clientPackagesTable.clientId))
    .innerJoin(trainersTable, eq(trainersTable.id, clientPackagesTable.trainerId))
    .where(and(eq(clientPackagesTable.status, "active"), isNull(clientPackagesTable.closedAt)));
  for (const p of rows) {
    const left = Math.max(0, p.total - p.used);
    if (left > 2) continue;
    const to = await accountEmail(p.trainerClerk, p.trainerEmail);
    if (await sendCatalogueMail("package_ending", { to, data: { name: firstName(p.trainerName), personName: p.clientFirst, sessionsLeft: left }, once: { kind: "package_ending", ref: `${p.id}:${left}` } })) packages++;
  }
  if (trial || packages) logger.info({ trial, packages }, "Maile automatyczne wysłane");
  return { trial, packages };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startMailJobs(everyMs = 6 * 3_600_000): void {
  if (process.env["MAIL_JOBS_ENABLED"] === "0" || timer) return;
  const tick = () => { void runMailJobs().catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Maile automatyczne: błąd przebiegu")); };
  setTimeout(tick, 60_000).unref(); // pierwszy przebieg minutę po starcie
  timer = setInterval(tick, everyMs);
  timer.unref();
}
