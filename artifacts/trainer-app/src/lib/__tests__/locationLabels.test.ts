/**
 * Focused test: exercise location outdoor-gym option must appear exactly once
 * in the filter, with "Plener" as the canonical stored value and
 * "Siłownia plenerowa" as the display label.
 */

import { describe, it, expect } from "vitest";
import {
  TRAINING_LOCATION_OPTIONS,
  LOCATION_DISPLAY_LABELS,
  getLocationDisplayLabel,
} from "../exercise-constants";

describe("Location label — outdoor-gym uniqueness (task #10)", () => {
  it("TRAINING_LOCATION_OPTIONS has exactly 3 entries (Siłownia, Dom, Plener)", () => {
    expect([...TRAINING_LOCATION_OPTIONS]).toEqual(["Siłownia", "Dom", "Plener"]);
  });

  it("'Siłownia plenerowa' is NOT a stored value in TRAINING_LOCATION_OPTIONS", () => {
    expect([...TRAINING_LOCATION_OPTIONS]).not.toContain("Siłownia plenerowa");
  });

  it("'Plener' IS the canonical stored value in TRAINING_LOCATION_OPTIONS", () => {
    expect([...TRAINING_LOCATION_OPTIONS]).toContain("Plener");
  });

  it("LOCATION_DISPLAY_LABELS maps 'Plener' → 'Siłownia plenerowa'", () => {
    expect(LOCATION_DISPLAY_LABELS["Plener"]).toBe("Siłownia plenerowa");
  });

  it("exactly one stored option has display label 'Siłownia plenerowa'", () => {
    const outdoorCount = [...TRAINING_LOCATION_OPTIONS].filter(
      (v) => getLocationDisplayLabel(v) === "Siłownia plenerowa",
    ).length;
    expect(outdoorCount).toBe(1);
  });

  it("getLocationDisplayLabel falls back to the raw value for entries without a label map entry", () => {
    expect(getLocationDisplayLabel("Siłownia")).toBe("Siłownia");
    expect(getLocationDisplayLabel("Dom")).toBe("Dom");
  });

  it("the rendered filter contains exactly the required four items in order", () => {
    // Simulate what ExerciseList renders: 'all' sentinel + one item per option
    const rendered = [
      "Wszystkie miejsca",
      ...TRAINING_LOCATION_OPTIONS.map(getLocationDisplayLabel),
    ];
    expect(rendered).toEqual([
      "Wszystkie miejsca",
      "Siłownia",
      "Dom",
      "Siłownia plenerowa",
    ]);
  });
});
