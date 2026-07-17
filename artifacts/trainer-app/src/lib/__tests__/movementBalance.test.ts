/**
 * movementPatternPenalty — Stage 4
 *
 * Pure unit tests. No Auto Fill knowledge. No ScoreTuple knowledge.
 */

import { describe, it, expect } from "vitest";
import { movementPatternPenalty } from "../movementBalance";

describe("movementPatternPenalty()", () => {
  it("empty session → 0 for any key", () => {
    const empty = new Map<string, number>();
    expect(movementPatternPenalty("push", empty)).toBe(0);
    expect(movementPatternPenalty("pull", empty)).toBe(0);
  });

  it("null movementCategoryKey → 0 (neutral)", () => {
    const day = new Map([["push", 2]]);
    expect(movementPatternPenalty(null, day)).toBe(0);
  });

  it("undefined movementCategoryKey → 0 (neutral)", () => {
    const day = new Map([["push", 2]]);
    expect(movementPatternPenalty(undefined, day)).toBe(0);
  });

  it("one existing exercise for the same category → penalty 1", () => {
    const day = new Map([["push", 1]]);
    expect(movementPatternPenalty("push", day)).toBe(1);
  });

  it("two existing exercises for the same category → penalty 2", () => {
    const day = new Map([["push", 2]]);
    expect(movementPatternPenalty("push", day)).toBe(2);
  });

  it("different movement categories do not affect each other", () => {
    const day = new Map([
      ["push", 3],
      ["squat", 1],
    ]);
    // pull not in map → 0; push → 3; squat → 1
    expect(movementPatternPenalty("pull", day)).toBe(0);
    expect(movementPatternPenalty("push", day)).toBe(3);
    expect(movementPatternPenalty("squat", day)).toBe(1);
  });
});
