/**
 * Phase A — Exercise Adaptation Seed
 *
 * Sets `suitable_for_no_activity` and `movement_complexity` on exercises.
 * All operations are idempotent — safe to run on every startup.
 *
 * Selection criteria for suitableForNoActivity = true (23 exercises):
 *   1. Explicitly listed with "Brak aktywności fizycznej" in source data suitableExperienceLevels
 *   2. learningDifficulty ≤ 2 (technically simple)
 *   3. Equipment: machine-guided, bodyweight, or light scalable free weights
 *   4. Independently confirmed: technically simple + can be scaled to minimal load
 *
 * movementComplexity mapping (for the full library):
 *   learningDifficulty 1   → "Prosta"
 *   learningDifficulty 2–3 → "Umiarkowana"  (overridden to "Prosta" for suitableForNoActivity)
 *   learningDifficulty ≥ 4 → "Złożona"
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";

/**
 * IDs of exercises confirmed suitable for "Brak aktywności fizycznej" clients.
 * Each entry verified: technically simple, scalable to low load, safe for inactive clients.
 *
 * ID  | Name                                                          | movementPattern        | LD
 * ----+---------------------------------------------------------------+------------------------+---
 *   5 | Plank                                                         | Anti-ekstensja         |  1
 *  90 | Przysiad do skrzyni z masą własnego ciała                     | Przysiad               |  1
 *  95 | Przysiad wykroczny z podparciem                               | Wykrok                 |  2
 * 103 | Martwy ciąg z kettlebell                                      | Zawias biodrowy        |  2
 * 105 | Glute bridge                                                  | Zawias biodrowy        |  1
 * 115 | Wyciskanie na maszynie siedząc                                | Pchanie poziome        |  1
 * 116 | Pompki na podwyższeniu                                        | Pchanie poziome        |  1
 * 118 | Pompki na kolanach                                            | Pchanie poziome        |  1
 * 123 | Ściąganie drążka wyciągu górnego chwytem neutralnym           | Przyciąganie pionowe   |  2
 * 124 | Ściąganie drążka wyciągu górnego szerokim nachwytem           | Przyciąganie pionowe   |  2
 * 128 | Wiosłowanie siedząc na wyciągu chwytem neutralnym             | Przyciąganie poziome   |  2
 * 130 | Wiosłowanie na maszynie                                       | Przyciąganie poziome   |  1
 * 133 | Wiosłowanie na TRX                                            | Przyciąganie poziome   |  2
 * 134 | Wiosłowanie gumą oporową                                      | Przyciąganie poziome   |  1
 * 136 | Face pull                                                     | Przyciąganie poziome   |  2
 * 137 | Wyciskanie na maszynie nad głowę                              | Pchanie pionowe        |  1
 * 142 | Unoszenie ramion bokiem na maszynie                           | Odwodzenie             |  1
 * 159 | Dead bug                                                      | Anti-ekstensja         |  1
 * 160 | Bird dog                                                      | Stabilizacja tułowia   |  1
 * 161 | Plank boczny                                                  | Stabilizacja tułowia   |  1
 * 162 | Pallof press                                                  | Anti-rotacja           |  2
 * 167 | Spacer farmera                                                | Lokomocja              |  1
 * 168 | Spacer walizkowy                                              | Lokomocja              |  2
 */
const SUITABLE_IDS = [
  5, 90, 95, 103, 105, 115, 116, 118, 123, 124,
  128, 130, 133, 134, 136, 137, 142, 159, 160, 161, 162, 167, 168,
];

export async function seedExerciseAdaptationFields(): Promise<void> {
  // Step 1: Mark the 23 confirmed exercises as suitable for no-activity clients.
  const markedResult = await db.execute(sql`
    UPDATE exercises
    SET suitable_for_no_activity = true
    WHERE id = ANY(ARRAY[${sql.raw(SUITABLE_IDS.join(","))}]::int[])
      AND suitable_for_no_activity IS DISTINCT FROM true
  `);
  const markedCount = (markedResult as { rowCount?: number }).rowCount ?? 0;

  // Step 2: Assign movementComplexity to all exercises that don't have one yet,
  //         based on their learningDifficulty.
  const complexityResult = await db.execute(sql`
    UPDATE exercises
    SET movement_complexity = CASE
      WHEN learning_difficulty = 1 THEN 'Prosta'
      WHEN learning_difficulty IN (2, 3) THEN 'Umiarkowana'
      WHEN learning_difficulty >= 4 THEN 'Złożona'
      ELSE NULL
    END
    WHERE movement_complexity IS NULL
      AND learning_difficulty IS NOT NULL
  `);
  const complexityCount = (complexityResult as { rowCount?: number }).rowCount ?? 0;

  // Step 3: Override — suitableForNoActivity exercises are always "Prosta"
  //         (they are confirmed technically simple for absolute beginners).
  await db.execute(sql`
    UPDATE exercises
    SET movement_complexity = 'Prosta'
    WHERE suitable_for_no_activity = true
      AND movement_complexity IS DISTINCT FROM 'Prosta'
  `);

  if (markedCount > 0 || complexityCount > 0) {
    logger.info(
      { markedCount, complexityCount },
      "seedExerciseAdaptationFields: marked suitable exercises and assigned movement complexity",
    );
  }
}
