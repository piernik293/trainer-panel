/** „Wkrótce w Optimatren” (flaga ROADMAP_ENABLED): pozycje z głosowaniem „Chcę to”. Żadnego działającego kodu tych funkcji — tylko zainteresowanie. */
import { and, asc, eq, sql } from "drizzle-orm";
import { db, roadmapItemsTable, roadmapVotesTable, trainersTable, clientsTable } from "@workspace/db";
import { isSoloClient } from "./solo";

export const roadmapEnabled = (): boolean => process.env["ROADMAP_ENABLED"] === "1";
export type VoterRole = "trener" | "solo" | "podopieczny";

/** Rola głosującego: trener, osoba Solo albo podopieczny trenera. Konto bez roli nie głosuje. */
export async function voterRole(clerkUserId: string): Promise<VoterRole | null> {
  const [t] = await db.select({ id: trainersTable.id }).from(trainersTable).where(eq(trainersTable.clerkUserId, clerkUserId));
  if (t) return "trener";
  const [c] = await db.select().from(clientsTable).where(eq(clientsTable.clerkUserId, clerkUserId));
  if (!c) return null;
  return isSoloClient(c) ? "solo" : "podopieczny";
}

export const STATUS_LABEL: Record<string, string> = { soon: "Wkrótce", in_progress: "W trakcie", done: "Gotowe" };

/** Widok użytkownika: pozycje niewidoczne (ukryte) nie wychodzą; licznik razem, bez podziału. */
export async function listForUser(clerkUserId: string) {
  const items = await db.select().from(roadmapItemsTable).where(eq(roadmapItemsTable.hidden, false)).orderBy(asc(roadmapItemsTable.sortOrder), asc(roadmapItemsTable.id));
  const counts = await db.select({ itemId: roadmapVotesTable.itemId, n: sql<number>`count(*)::int` }).from(roadmapVotesTable).groupBy(roadmapVotesTable.itemId);
  const mine = await db.select({ itemId: roadmapVotesTable.itemId }).from(roadmapVotesTable).where(eq(roadmapVotesTable.clerkUserId, clerkUserId));
  const mineSet = new Set(mine.map((m) => m.itemId));
  const cnt = new Map(counts.map((c) => [c.itemId, c.n]));
  return items.map((i) => ({ id: i.id, title: i.title, blurb: i.blurb, icon: i.icon, status: i.status, statusLabel: STATUS_LABEL[i.status] ?? "Wkrótce", votes: cnt.get(i.id) ?? 0, voted: mineSet.has(i.id) }));
}

/** Jeden głos na konto na pozycję; ponowny głos nic nie zmienia (idempotentnie). */
export async function vote(itemId: number, clerkUserId: string, role: VoterRole): Promise<boolean> {
  const [item] = await db.select({ id: roadmapItemsTable.id }).from(roadmapItemsTable).where(and(eq(roadmapItemsTable.id, itemId), eq(roadmapItemsTable.hidden, false)));
  if (!item) return false;
  await db.insert(roadmapVotesTable).values({ itemId, clerkUserId, role }).onConflictDoNothing();
  return true;
}
export async function unvote(itemId: number, clerkUserId: string): Promise<void> {
  await db.delete(roadmapVotesTable).where(and(eq(roadmapVotesTable.itemId, itemId), eq(roadmapVotesTable.clerkUserId, clerkUserId)));
}

/** Widok administratora: wszystkie pozycje, głosy z podziałem trener / Solo / podopieczny. */
export async function listForAdmin() {
  const items = await db.select().from(roadmapItemsTable).orderBy(asc(roadmapItemsTable.sortOrder), asc(roadmapItemsTable.id));
  const rows = await db.select({ itemId: roadmapVotesTable.itemId, role: roadmapVotesTable.role, n: sql<number>`count(*)::int` }).from(roadmapVotesTable).groupBy(roadmapVotesTable.itemId, roadmapVotesTable.role);
  return items.map((i) => {
    const by = { trener: 0, solo: 0, podopieczny: 0 } as Record<string, number>;
    for (const r of rows) if (r.itemId === i.id) by[r.role] = r.n;
    return { id: i.id, slug: i.slug, title: i.title, blurb: i.blurb, icon: i.icon, status: i.status, hidden: i.hidden, sortOrder: i.sortOrder, votes: { total: by["trener"]! + by["solo"]! + by["podopieczny"]!, ...by } };
  });
}
