/**
 * „Mój trening” — trener jako własny podopieczny (bez osobnego trenera prowadzącego).
 * Wiersz klienta ma to samo konto Clerk co trener i trainer_id = ten trener, więc plan układa się w panelu jak każdemu klientowi,
 * a przełącznik [Mój trening] [Podopieczni] jest zawsze widoczny. Wiersz nie liczy się do limitu klientów, nie da się go odłączyć
 * ani usunąć. Powstaje przy akceptacji wniosku, przy pierwszym wejściu trenera do panelu i w migracji 0064 (dla obecnych trenerów).
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, clientsTable, trainersTable } from "@workspace/db";

export const SELF_TRAINING_NAME = "Mój trening";

export async function ensureSelfClient(trainer: { id: number; clerkUserId: string; email?: string | null }): Promise<void> {
  const [existing] = await db.select({ id: clientsTable.id, trainerId: clientsTable.trainerId }).from(clientsTable).where(eq(clientsTable.clerkUserId, trainer.clerkUserId));
  if (existing) {
    // Osoba już ma konto podopiecznego: prowadzącego (innego trenera) nie ruszamy; samodzielne konto (bez trenera) staje się „Moim treningiem”.
    if (existing.trainerId == null) await db.update(clientsTable).set({ trainerId: trainer.id, updatedAt: new Date() }).where(and(eq(clientsTable.id, existing.id), isNull(clientsTable.trainerId)));
    return;
  }
  await db.insert(clientsTable).values({ firstName: SELF_TRAINING_NAME, lastName: "", email: trainer.email ?? null, trainerId: trainer.id, clerkUserId: trainer.clerkUserId }).onConflictDoNothing();
}

/** Czy ten wiersz klienta to „Mój trening” jego prowadzącego trenera (to samo konto Clerk). */
export async function isSelfTraining(clientId: number): Promise<boolean> {
  const [row] = await db.select({ id: clientsTable.id }).from(clientsTable)
    .innerJoin(trainersTable, and(eq(trainersTable.id, clientsTable.trainerId), eq(trainersTable.clerkUserId, clientsTable.clerkUserId)))
    .where(eq(clientsTable.id, clientId));
  return !!row;
}

/** To samo co `isSelfTraining`, ale dla trenera już znanego z sesji (prosty odczyt jednego wiersza). */
export async function isOwnTrainingOf(clientId: number, trainer: { id: number; clerkUserId: string }): Promise<boolean> {
  const [row] = await db.select({ clerkUserId: clientsTable.clerkUserId }).from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.trainerId, trainer.id)));
  return !!row && row.clerkUserId === trainer.clerkUserId;
}
