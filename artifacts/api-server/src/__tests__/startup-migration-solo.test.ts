/**
 * Start API a osoby bez trenera (przegląd QA 27.10.2026): konto bez trenera (Solo albo prośba o dołączenie w toku) nie może ani zablokować startu API
 * ("niejednoznaczne" przy ≥ 2 trenerach), ani zostać po cichu przypisane jedynemu trenerowi. Baza testowa.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql, and, isNull } from "drizzle-orm";
import { db, clientsTable, trainersTable } from "@workspace/db";
import { runStartupMigration } from "../lib/migration";

const SOLO = "startup_migration_solo_person";

beforeAll(async () => {
  await db.delete(clientsTable).where(eq(clientsTable.clerkUserId, SOLO));
  // trzeba co najmniej dwóch trenerów, żeby dawna ścieżka przerywała start
  for (const id of ["startup_migration_t1", "startup_migration_t2"]) await db.insert(trainersTable).values({ clerkUserId: id }).onConflictDoNothing();
  await db.insert(clientsTable).values({ firstName: "Solo", lastName: "", trainerId: null, clerkUserId: SOLO });
});
afterAll(async () => { await db.delete(clientsTable).where(eq(clientsTable.clerkUserId, SOLO)); });

describe("migracja przy starcie API", () => {
  it("konto bez trenera jest pominięte: nie liczy się do „niejednoznacznych” i zostaje bez trenera", async () => {
    const [orph] = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM clients WHERE trainer_id IS NULL AND clerk_user_id IS NULL`)).rows as Array<{ n: number }>;
    let message = "";
    try { await runStartupMigration(); } catch (e) { message = (e as Error).message; }
    // jeśli w bazie testowej są stare sieroty bez konta, start może się przerwać — ale liczba w komunikacie nie zawiera konta Solo
    if (message) expect(message).toContain(`${orph!.n} clients`);
    else expect(orph!.n).toBe(0);
    const [solo] = await db.select({ trainerId: clientsTable.trainerId }).from(clientsTable).where(and(eq(clientsTable.clerkUserId, SOLO), isNull(clientsTable.trainerId)));
    expect(solo).toBeTruthy(); // nadal bez trenera — nikt go po cichu nie przypisał
  });
});
