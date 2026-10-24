/** Ladder rules (pure): step of the client's level preferred, never above, empty steps neutral, warm-up-role only for BA clients. */
import { describe, it, expect } from "vitest";
import { buildLadderRules, LADDER_STEP_BONUS, type LadderRow } from "../services/ladderSelection";

const BA = "Brak aktywności fizycznej", P = "Początkujący", S = "Średniozaawansowany", Z = "Zaawansowany";
const rows: LadderRow[] = [
  { pattern: "Przysiad", stepOrder: 1, level: BA, exerciseId: 90 }, { pattern: "Przysiad", stepOrder: 2, level: P, exerciseId: 88 },
  { pattern: "Przysiad", stepOrder: 3, level: S, exerciseId: 3 }, { pattern: "Przysiad", stepOrder: 4, level: Z, exerciseId: 191 },
  { pattern: "Pchanie poziome", stepOrder: 1, level: BA, exerciseId: 322 }, { pattern: "Pchanie poziome", stepOrder: 2, level: P, exerciseId: 116 },
  { pattern: "Pchanie poziome", stepOrder: 3, level: S, exerciseId: 1 },
  // an exercise on two steps (alternative on BA and P)
  { pattern: "Wykrok", stepOrder: 1, level: BA, exerciseId: 95 }, { pattern: "Wykrok", stepOrder: 2, level: P, exerciseId: 95 },
];
const NOT_ON_LADDER = 999;

describe("buildLadderRules", () => {
  it.each([
    [BA, [90, 322, 95], [88, 3, 191, 116, 1]],
    [P, [90, 88, 322, 116, 95], [3, 191, 1]],
    [S, [90, 88, 3, 322, 116, 1, 95], [191]],
    [Z, [90, 88, 3, 191, 322, 116, 1, 95], []],
  ])("%s: allowed steps up to the client's level, never above", (level, ok, notOk) => {
    const r = buildLadderRules(rows, level);
    for (const id of ok) expect(r.allowed(id), `id ${id}`).toBe(true);
    for (const id of notOk) expect(r.allowed(id), `id ${id}`).toBe(false);
    expect(r.allowed(NOT_ON_LADDER)).toBe(true); // not on a ladder → as before
  });
  it("only the step of the client's own level gets the bonus", () => {
    expect(buildLadderRules(rows, P).bonus(88)).toBe(LADDER_STEP_BONUS);
    expect(buildLadderRules(rows, P).bonus(90)).toBe(0); // lower step: allowed, not preferred
    expect(buildLadderRules(rows, P).bonus(3)).toBe(0);
    expect(buildLadderRules(rows, P).bonus(95)).toBe(LADDER_STEP_BONUS); // on two steps incl. the client's
    expect(buildLadderRules(rows, Z).bonus(191)).toBe(LADDER_STEP_BONUS);
    expect(buildLadderRules(rows, S).bonus(NOT_ON_LADDER)).toBe(0);
  });
  it("an empty step for the level leaves the pool as before (lower steps and non-ladder exercises stay; no higher one appears)", () => {
    const noP = rows.filter((r) => !(r.pattern === "Przysiad" && r.level === P));
    const r = buildLadderRules(noP, P);
    expect(r.allowed(90)).toBe(true); expect(r.allowed(3)).toBe(false); expect(r.allowed(NOT_ON_LADDER)).toBe(true);
    expect([90, 3, 191, NOT_ON_LADDER].filter((id) => r.bonus(id) > 0)).toEqual([]);
  });
  it("unknown / missing level → ladders are not applied", () => {
    for (const lv of [null, undefined, "Ekspert"]) {
      const r = buildLadderRules(rows, lv as string | null);
      expect(rows.every((x) => r.allowed(x.exerciseId))).toBe(true);
      expect(r.warmupRoleAllowed.size).toBe(0);
    }
  });
  it("warm-up-role exercises on BA steps are allowed only for a BA client", () => {
    expect([...buildLadderRules(rows, BA).warmupRoleAllowed].sort()).toEqual([90, 95, 322].sort());
    for (const lv of [P, S, Z]) expect(buildLadderRules(rows, lv).warmupRoleAllowed.size).toBe(0);
  });
});
