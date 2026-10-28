/**
 * Migration 0057 (owner's catalogue review, 28.10.2026): the decision lists are consistent, nothing is destructive, only the approved ids get
 * suitable_for_no_activity = true, and the 11 new calisthenics exercises have the availability the owner set (nothing on the bar or parallel bars for BA;
 * negatives, archer, toes to bar etc. from Ś, "Zaawansowany" ones only for Z).
 */
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool, exercisesTable, exerciseLadderStepsTable } from "@workspace/db";
import { isGeneratorSafe } from "../lib/exerciseRoles";
import { buildLadderRules } from "../services/ladderSelection";

const SQL = readFileSync(join(__dirname, "../../../../lib/db/migrations/0057_katalog_decyzje.sql"), "utf8");
const listAfter = (marker: RegExp) => (SQL.split(marker)[1]?.match(/WHERE id IN \(([\d, ]+)\)/)?.[1] ?? "").split(",").map((x) => Number(x.trim())).filter(Boolean);
const OK = listAfter(/-- zatwierdź \(\d+\)[^\n]*\n/);
const FROM_P = listAfter(/-- tylko od P \(\d+\)[^\n]*\n/);
const FROM_S = listAfter(/-- tylko od Ś \(\d+\)[^\n]*\n/);

const LEVELS = ["Brak aktywności fizycznej", "Początkujący", "Średniozaawansowany", "Zaawansowany"];
const NEW: Array<[string, string, "P" | "Ś" | "Z"]> = [
  ["Zwis na drążku", "Początkujący", "P"], ["Negatywy podciągnięcia", "Średniozaawansowany", "Ś"], ["Podciąganie łucznik (archer)", "Zaawansowany", "Z"],
  ["Negatywy dipów", "Średniozaawansowany", "Ś"], ["Dipy z gumą", "Średniozaawansowany", "Ś"], ["Dipy z obciążeniem", "Zaawansowany", "Z"],
  ["Pompki łucznik (archer)", "Zaawansowany", "Z"], ["Wiosłowanie australijskie — nogi proste", "Średniozaawansowany", "Ś"],
  ["Wiosłowanie australijskie — nogi wyżej lub na kółkach", "Zaawansowany", "Z"], ["Toes to bar", "Zaawansowany", "Z"], ["Pistol z podparciem", "Zaawansowany", "Z"],
];

afterAll(async () => { await pool.end(); });

describe("migration 0057: the decision lists", () => {
  it("150 distinct ids in three disjoint lists (81 + 21 + 48); id 89 is the documented exception: from P, not from BA", () => {
    expect(OK).toHaveLength(81); expect(FROM_P).toHaveLength(21); expect(FROM_S).toHaveLength(48);
    const all = [...OK, ...FROM_P, ...FROM_S];
    expect(new Set(all).size).toBe(150);
    expect(OK).not.toContain(89); expect(FROM_P).toContain(89);
  });
  it("additive and reversible: no destructive statements, a backup of the old values, the rollback script exists", () => {
    expect(SQL).not.toMatch(/^\s*(DELETE|TRUNCATE)\b|\b(DROP|RENAME)\b|SET DATA TYPE/im);
    expect(SQL).toContain("catalogue_decision_backup");
    expect(readFileSync(join(__dirname, "../../../../scripts/katalog-decyzje-cofnij.sql"), "utf8")).toContain("catalogue_decision_backup");
  });
  it("suitable_for_no_activity = true is set only for the approved list; the other lists set it to false", () => {
    const trues = [...SQL.matchAll(/suitable_for_no_activity = true[^;]*?WHERE id IN \(([\d, ]+)\)/g)].map((m) => m[1]!.split(",").map((x) => Number(x.trim())));
    expect(trues).toHaveLength(1);
    expect(trues[0]!.sort((a, b) => a - b)).toEqual([...OK].sort((a, b) => a - b));
  });
  it("one-shot: decisions apply only to ids without a backup row yet (a later change by the owner is never overwritten)", () => {
    expect(SQL.match(/catalogue_decision_todo\)/g)!.length).toBeGreaterThanOrEqual(4);
  });
});

describe("migration 0057: the 11 new calisthenics exercises (database)", () => {
  it("exist once, approved by the trainer, complete and not for BA", async () => {
    const rows = await db.select().from(exercisesTable).where(eq(exercisesTable.reviewBatch, "katalog-decyzje-0057"));
    expect(rows.map((r) => r.name).sort()).toEqual(NEW.map((n) => n[0]).sort());
    for (const r of rows) {
      const [, diff] = NEW.find((n) => n[0] === r.name)!;
      expect(r.difficultyLevel, r.name).toBe(diff);
      expect(r.reviewedByTrainer && r.verificationStatus === "zweryfikowane" && !r.hidden && r.isActive, r.name).toBe(true);
      expect(r.suitableForNoActivity, r.name).toBe(false);
      for (const f of ["movementPattern", "description", "executionInstructions", "commonMistakes", "coachingTips", "safetyNotes", "movementCategory", "planeOfMotion", "jointStress", "role"] as const) expect(r[f], `${r.name}: ${f}`).toBeTruthy();
      expect(r.learningDifficulty && r.neurologicalFatigue && r.domsPotential, r.name).toBeTruthy();
      expect(r.jointStressAreas?.length, r.name).toBeGreaterThan(0);
      expect(r.parentExerciseId, `${r.name}: own exercise, not a variant`).toBeNull();
      // the generator never offers it above the client's level (decision 50b); BA additionally needs suitable_for_no_activity = true, which none has
      const rank = (l: string) => LEVELS.indexOf(l);
      const ownRank = Math.max(1, rank(diff)); // BA and P both count as "Początkujący"
      LEVELS.forEach((lvl) => expect(isGeneratorSafe(r, lvl), `${r.name} for ${lvl}`).toBe(Math.max(1, rank(lvl)) >= ownRank));
    }
  });
  it("attached to the calisthenics ladders at the owner's levels; the ladder keeps lower levels out", async () => {
    const steps = await db.select().from(exerciseLadderStepsTable);
    const rows = await db.select({ id: exercisesTable.id, name: exercisesTable.name }).from(exercisesTable).where(eq(exercisesTable.reviewBatch, "katalog-decyzje-0057"));
    const levelFull = { P: "Początkujący", Ś: "Średniozaawansowany", Z: "Zaawansowany" } as const;
    for (const [name, , step] of NEW) {
      const id = rows.find((r) => r.name === name)!.id;
      const mine = steps.filter((s) => s.exerciseId === id);
      expect(mine, name).toHaveLength(1);
      expect(mine[0]!.pattern).toMatch(/^Kalistenika: /);
      expect(mine[0]!.level, name).toBe(levelFull[step]);
      const rules = (lvl: string) => buildLadderRules(steps.map((s) => ({ pattern: s.pattern, stepOrder: s.stepOrder, level: s.level, exerciseId: s.exerciseId })), lvl);
      expect(rules("Brak aktywności fizycznej").allowed(id), `${name} BA`).toBe(false);
      expect(rules(levelFull[step]).allowed(id), `${name} own level`).toBe(true);
      if (step !== "P") expect(rules("Początkujący").allowed(id), `${name} P`).toBe(false);
      if (step === "Z") expect(rules("Średniozaawansowany").allowed(id), `${name} Ś`).toBe(false);
    }
  });
});
