/**
 * Zgoda na udostępnienie historii Solo (S4). Osoba z konta Solo łączy się z trenerem; domyślnie NIE udostępnia wcześniejszych danych:
 *  - wywiady i zgłoszenia bólu z okresu Solo przechodzą do ukrytego „archiwum” tej osoby (wiersz klienta bez trenera i bez konta),
 *    więc żadna trasa trenera ani generator ich nie widzą; po odłączeniu wracają do osoby;
 *  - plany i treningi z okresu Solo zostają u osoby, ale trasy trenera pokazują tylko to, co powstało po `clients.history_visible_from`.
 * Zgoda (shareHistory) = NULL w `history_visible_from`, nic się nie ukrywa.
 */
import { and, eq, gte, like } from "drizzle-orm";
import { db, clientsTable, surveysTable, painReportsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const marker = (clientId: number) => `solo-archiwum:${clientId}`;

export async function historyCutoff(clientId: number): Promise<Date | null> {
  const [c] = await db.select({ at: clientsTable.historyVisibleFrom }).from(clientsTable).where(eq(clientsTable.id, clientId));
  return c?.at ?? null;
}
/** Warunek SQL „po dacie widoczności” (undefined = bez ograniczenia). */
export const afterCutoff = (column: Parameters<typeof gte>[0], cutoff: Date | null) => (cutoff ? gte(column, cutoff) : undefined);

async function archiveRow(tx: Tx, clientId: number): Promise<number> {
  const [found] = await tx.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.notes, marker(clientId)));
  if (found) return found.id;
  const [a] = await tx.insert(clientsTable).values({ firstName: "Archiwum Solo", lastName: String(clientId), status: "archived", trainerId: null, clerkUserId: null, notes: marker(clientId) }).returning({ id: clientsTable.id });
  return a!.id;
}

/** Połączenie bez zgody: wywiady i bóle z okresu Solo → archiwum; trener widzi plany i treningi dopiero od teraz. */
export async function hideSoloHistory(tx: Tx, clientId: number, now: Date = new Date()): Promise<void> {
  const a = await archiveRow(tx, clientId);
  await tx.update(surveysTable).set({ clientId: a }).where(eq(surveysTable.clientId, clientId));
  await tx.update(painReportsTable).set({ clientId: a }).where(eq(painReportsTable.clientId, clientId));
  await tx.update(clientsTable).set({ historyVisibleFrom: now }).where(eq(clientsTable.id, clientId));
}

/** Odłączenie: wywiady i bóle wracają do osoby (obok tych, które powstały w czasie współpracy), widoczność historii się zeruje. */
export async function restoreSoloHistory(tx: Tx, clientId: number): Promise<void> {
  const [a] = await tx.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.notes, marker(clientId)), like(clientsTable.firstName, "Archiwum Solo")));
  if (a) {
    await tx.update(surveysTable).set({ clientId }).where(eq(surveysTable.clientId, a.id));
    await tx.update(painReportsTable).set({ clientId }).where(eq(painReportsTable.clientId, a.id));
  }
  await tx.update(clientsTable).set({ historyVisibleFrom: null }).where(eq(clientsTable.id, clientId));
}
