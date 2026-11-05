/** Własność ćwiczeń w generatorze: katalog wspólny zawsze; ćwiczenia WŁASNE trenera tylko za jego zgodą (opcja „Używaj moich ćwiczeń w generatorze”) i tylko kompletne (stawy + poziom obciążenia). Ćwiczenia osób Solo — nigdy. */
import { eq } from "drizzle-orm";
import { db, trainersTable } from "@workspace/db";

type Owned = { createdByTrainerId: number | null; createdByClientId?: number | null; jointStress?: string | null; jointStressAreas?: string[] | null };

/** Dodatkowe wymagania biblioteki trenera ponad zwykłą kompletność: poziom obciążenia stawów i jawna lista stawów (pusta = „bez obciążenia stawów”). */
export function libraryExtrasOk(ex: Pick<Owned, "jointStress" | "jointStressAreas">): boolean {
  return !!ex.jointStress && ex.jointStressAreas != null;
}

export async function generatorOwnerFilter(trainerId: number | undefined): Promise<(ex: Owned) => boolean> {
  let useOwn = false;
  if (trainerId != null) {
    const [t] = await db.select({ u: trainersTable.useOwnExercisesInGenerator }).from(trainersTable).where(eq(trainersTable.id, trainerId));
    useOwn = t?.u === true;
  }
  return (ex) => {
    if (ex.createdByClientId != null) return false;
    if (ex.createdByTrainerId == null) return true;
    return useOwn && ex.createdByTrainerId === trainerId && libraryExtrasOk(ex);
  };
}
