/** Odpowiedź „Nie” na „Czy chcesz uwzględnić cardio w planie?”: brak cardio i elementów kondycyjnych także przy Redukcji; „Tak” jak dotąd. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, clientsTable, surveysTable, trainersTable } from "@workspace/db";
import { provisionTrainer } from "../middlewares/requireAuth";
import { loadPlanDraftInput } from "../services/planDraftInputService";

let trainerId = 0; const clientIds: number[] = [];
async function clientWith(cardio: { cardioPreference?: string | null; cardioFrequency?: string | null }, goal: string, level = "Średniozaawansowany") {
  const [c] = await db.insert(clientsTable).values({ trainerId, firstName: "Cardio", lastName: "Test" }).returning();
  clientIds.push(c!.id);
  await db.insert(surveysTable).values({
    clientId: c!.id, trainingGoal: goal, experienceLevel: level, activityLevel: "Siedzący", desiredWeeklyFrequency: 3, trainingLocation: "Siłownia", ...cardio,
  } as typeof surveysTable.$inferInsert);
  return (await loadPlanDraftInput(c!.id))!;
}
beforeAll(async () => { trainerId = (await provisionTrainer("cardio_nie_trainer"))!.id; });
afterAll(async () => {
  for (const id of clientIds) { await db.delete(surveysTable).where(eq(surveysTable.clientId, id)); await db.delete(clientsTable).where(eq(clientsTable.id, id)); }
  await db.delete(trainersTable).where(eq(trainersTable.id, trainerId));
});

describe("cardio w planie: Tak / Nie", () => {
  it("Nie → bez cardio i kondycji, także przy redukcji i kondycji", async () => {
    for (const goal of ["Redukcja tkanki tłuszczowej", "Poprawa kondycji"]) {
      const r = await clientWith({ cardioPreference: "Nie" }, goal);
      expect(r.cardioRecommendation).toBeNull();
      expect(r.conditioningRecommendation).toBeNull();
    }
  });
  it("starszy wywiad: „Nie wykonuję cardio” lub „minimum” → jak Nie", async () => {
    expect((await clientWith({ cardioFrequency: "Nie wykonuję cardio" }, "Redukcja tkanki tłuszczowej")).cardioRecommendation).toBeNull();
    expect((await clientWith({ cardioPreference: "Tylko niezbędne minimum" }, "Redukcja tkanki tłuszczowej")).cardioRecommendation).toBeNull();
  });
  it("Tak → jak dotąd (redukcja daje rekomendację), starsze „Tak, uwzględnij…” też", async () => {
    expect((await clientWith({ cardioPreference: "Tak" }, "Redukcja tkanki tłuszczowej")).cardioRecommendation).not.toBeNull();
    expect((await clientWith({ cardioPreference: "Tak, uwzględnij cardio w planie", cardioFrequency: "1 raz w tygodniu" }, "Redukcja tkanki tłuszczowej")).cardioRecommendation).not.toBeNull();
    expect((await clientWith({ cardioPreference: "Tak" }, "Poprawa kondycji")).conditioningRecommendation).not.toBeNull();
  });
});
