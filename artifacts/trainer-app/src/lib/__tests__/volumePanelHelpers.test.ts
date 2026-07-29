/**
 * Focused tests for VolumePanel beginner-presentation helpers.
 *
 * Tests spec §PART8:
 *   1.  Brak aktywności triggers beginner view.
 *   2.  Początkujący triggers beginner view.
 *   3.  Main muscle groups are NOT classified as smaller.
 *   4.  Smaller muscle groups (calves, adductors, biceps, triceps) are classified
 *       as smaller.
 *   5.  All 12 canonical targets split correctly — none lost.
 *   6.  Intermediate and Advanced do NOT trigger the simplified view.
 */

import { describe, it, expect } from "vitest";
import {
  BEGINNER_VOLUME_LEVELS,
  isSmallerTarget,
} from "../volumePanelHelpers";

// ─── 1–2: Level detection ─────────────────────────────────────────────────────

describe("BEGINNER_VOLUME_LEVELS", () => {
  it("1. Brak aktywności fizycznej is a beginner level", () => {
    expect(BEGINNER_VOLUME_LEVELS.has("Brak aktywności fizycznej")).toBe(true);
  });

  it("2. Początkujący is a beginner level", () => {
    expect(BEGINNER_VOLUME_LEVELS.has("Początkujący")).toBe(true);
  });

  it("6. Średniozaawansowany is NOT a beginner level", () => {
    expect(BEGINNER_VOLUME_LEVELS.has("Średniozaawansowany")).toBe(false);
  });

  it("6. Zaawansowany is NOT a beginner level", () => {
    expect(BEGINNER_VOLUME_LEVELS.has("Zaawansowany")).toBe(false);
  });

  it("null / empty string are not beginner levels", () => {
    expect(BEGINNER_VOLUME_LEVELS.has("")).toBe(false);
    expect(BEGINNER_VOLUME_LEVELS.has(null as unknown as string)).toBe(false);
  });
});

// ─── 3–4: isSmallerTarget ────────────────────────────────────────────────────

describe("isSmallerTarget", () => {
  // Spec §PART2 main groups — must NOT be classified as smaller
  const mainTargets = [
    "Mięsień czworogłowy uda",
    "Mięśnie pośladkowe",
    "Grupa kulszowo-goleniowa",
    "Mięśnie naramienne",
    "Mięsień piersiowy większy",
    "Mięsień najszerszy grzbietu",
    "Mięsień czworoboczny grzbietu",
    "Brzuch",
  ];

  for (const name of mainTargets) {
    it(`3. "${name}" is a main target (not smaller)`, () => {
      expect(isSmallerTarget(name)).toBe(false);
    });
  }

  // Spec §PART2 smaller groups — must be classified as smaller
  const smallerTargets = [
    "Mięsień trójgłowy łydki",   // calves
    "Przywodziciele",             // adductors
    "Mięsień trójgłowy ramienia", // triceps
    "Mięsień dwugłowy ramienia",  // biceps
  ];

  for (const name of smallerTargets) {
    it(`4. "${name}" is a smaller target`, () => {
      expect(isSmallerTarget(name)).toBe(true);
    });
  }

  // ─── 5: Exhaustive split: no muscle is lost ─────────────────────────────────

  it("5. all 12 canonical targets are classified without loss", () => {
    const allTargets = [...mainTargets, ...smallerTargets];
    const classified = allTargets.map((n) => ({ name: n, smaller: isSmallerTarget(n) }));
    const smallerCount = classified.filter((c) => c.smaller).length;
    const mainCount    = classified.filter((c) => !c.smaller).length;
    // Exactly the 4 smaller + 8 main — nothing lost or double-counted
    expect(smallerCount).toBe(4);
    expect(mainCount).toBe(8);
    expect(smallerCount + mainCount).toBe(allTargets.length);
  });

  // Edge cases
  it("name containing 'łydki' is smaller", () => {
    expect(isSmallerTarget("Łydki (ogólnie)")).toBe(true);
  });

  it("name containing 'przywodziciel' is smaller", () => {
    expect(isSmallerTarget("Mięśnie przywodziciele")).toBe(true);
  });

  it("unknown target name is not smaller (safe default)", () => {
    expect(isSmallerTarget("Mięsień nieznany")).toBe(false);
  });
});
