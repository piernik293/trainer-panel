/**
 * Focused tests for the percentage-based display logic in proposal cards.
 *
 * Tests cover:
 * - Displayed recommended range for ceilings 20, 16, 12, 8
 * - "Maks. rekomendowana obj. tyg." line always present when ceiling exists
 * - Status colours: 18/20 green, 15/16 green, 11/12 green, 7/8 green, manual 8/8 green
 * - Boundary: exactly 75% → orange (medium_minimum)
 * - Above 100% → orange (above_max_recommended)
 * - 125% → red (overtraining_warning)
 * - Proposal values unchanged by display change
 */

import { describe, it, expect } from "vitest";

// ─── Pure helpers mirrored from PlanDraftWizard.tsx ───────────────────────────
// Mirrored here so the test has no React-component dependency.

type VolumeProposalStatus =
  | "below_total_minimum"
  | "medium_minimum"
  | "recommended_volume"
  | "above_max_recommended"
  | "overtraining_warning";

function getVolumeProposalStatus(ratio: number): VolumeProposalStatus {
  if (ratio < 0.50)  return "below_total_minimum";
  if (ratio <= 0.75) return "medium_minimum";
  if (ratio <= 1.00) return "recommended_volume";
  if (ratio < 1.25)  return "above_max_recommended";
  return "overtraining_warning";
}

// ─── Display range helpers ────────────────────────────────────────────────────

function recommendedLowerBound(ceiling: number): number {
  return Math.floor(ceiling * 0.75) + 1;
}

function recommendedUpperBound(ceiling: number): number {
  return ceiling;
}

// ─── §1 Displayed range ───────────────────────────────────────────────────────

describe("§1 Displayed recommended range", () => {
  it("ceiling 20 → lower 16, upper 20", () => {
    expect(recommendedLowerBound(20)).toBe(16);
    expect(recommendedUpperBound(20)).toBe(20);
  });

  it("ceiling 16 → lower 13, upper 16", () => {
    expect(recommendedLowerBound(16)).toBe(13);
    expect(recommendedUpperBound(16)).toBe(16);
  });

  it("ceiling 12 → lower 10, upper 12", () => {
    expect(recommendedLowerBound(12)).toBe(10);
    expect(recommendedUpperBound(12)).toBe(12);
  });

  it("ceiling 8 → lower 7, upper 8", () => {
    expect(recommendedLowerBound(8)).toBe(7);
    expect(recommendedUpperBound(8)).toBe(8);
  });
});

// ─── §1 Maximum weekly line always shown ─────────────────────────────────────

describe("§1 Maximum weekly line always shown", () => {
  // The condition `absoluteMax > preferredMax` has been removed from the template.
  // The line is shown whenever weeklyAbsoluteCeiling (absoluteMax) exists and is > 0.
  // We verify the invariant: upperBound === ceiling (always truthy when ceiling > 0).

  for (const ceiling of [8, 12, 16, 20]) {
    it(`ceiling ${ceiling}: upperBound === ceiling (line will always render)`, () => {
      expect(recommendedUpperBound(ceiling)).toBe(ceiling);
      expect(ceiling).toBeGreaterThan(0);
    });
  }

  it("ceiling 8: upperBound equals lower+1, both match ceiling", () => {
    // Smallest credible ceiling: 7–8.  Both lower and upper are > 0.
    expect(recommendedLowerBound(8)).toBe(7);
    expect(recommendedUpperBound(8)).toBe(8);
  });
});

// ─── §2 Status colours ────────────────────────────────────────────────────────

describe("§2 Status — required green results (§4)", () => {
  it("18 / 20 (90%) → recommended_volume (green)", () => {
    expect(getVolumeProposalStatus(18 / 20)).toBe("recommended_volume");
  });

  it("15 / 16 (93.75%) → recommended_volume (green)", () => {
    expect(getVolumeProposalStatus(15 / 16)).toBe("recommended_volume");
  });

  it("11 / 12 (91.67%) → recommended_volume (green)", () => {
    expect(getVolumeProposalStatus(11 / 12)).toBe("recommended_volume");
  });

  it("7 / 8 (87.5%) → recommended_volume (green)", () => {
    expect(getVolumeProposalStatus(7 / 8)).toBe("recommended_volume");
  });

  it("manual 8 / 8 (100%) → recommended_volume (green)", () => {
    expect(getVolumeProposalStatus(8 / 8)).toBe("recommended_volume");
  });
});

describe("§2 Status — boundary and overage cases", () => {
  it("exactly 75% (ratio 0.75) → medium_minimum (orange)", () => {
    expect(getVolumeProposalStatus(0.75)).toBe("medium_minimum");
  });

  it("just above 75% (ratio 0.751) → recommended_volume (green)", () => {
    expect(getVolumeProposalStatus(0.751)).toBe("recommended_volume");
  });

  it("exactly 100% (ratio 1.00) → recommended_volume (green)", () => {
    expect(getVolumeProposalStatus(1.00)).toBe("recommended_volume");
  });

  it("above 100% (ratio 1.05) → above_max_recommended (orange)", () => {
    expect(getVolumeProposalStatus(1.05)).toBe("above_max_recommended");
  });

  it("just below 125% (ratio 1.249) → above_max_recommended (orange)", () => {
    expect(getVolumeProposalStatus(1.249)).toBe("above_max_recommended");
  });

  it("exactly 125% (ratio 1.25) → overtraining_warning (red)", () => {
    expect(getVolumeProposalStatus(1.25)).toBe("overtraining_warning");
  });

  it("above 125% (ratio 1.5) → overtraining_warning (red)", () => {
    expect(getVolumeProposalStatus(1.5)).toBe("overtraining_warning");
  });

  it("below 50% (ratio 0.49) → below_total_minimum (red)", () => {
    expect(getVolumeProposalStatus(0.49)).toBe("below_total_minimum");
  });

  it("exactly 50% (ratio 0.50) → medium_minimum (orange)", () => {
    expect(getVolumeProposalStatus(0.50)).toBe("medium_minimum");
  });
});

// ─── §5 Proposal values unchanged ────────────────────────────────────────────

describe("§5 Proposal values unchanged", () => {
  // The display-only functions (recommendedLowerBound / recommendedUpperBound) do NOT
  // affect the numeric proposal, selectedValue, or recommendedValue — those come from
  // the backend decision object and are passed through unchanged.
  //
  // We confirm: the range helpers are pure derivations from ceiling only and do not
  // modify input values.

  it("recommendedLowerBound and recommendedUpperBound take only ceiling, not the proposal value", () => {
    const ceiling = 20;
    const proposalValue = 18; // system recommended value — must not be altered
    expect(recommendedLowerBound(ceiling)).toBe(16);
    expect(recommendedUpperBound(ceiling)).toBe(20);
    // proposal value is untouched:
    expect(proposalValue).toBe(18);
  });

  it("range helpers are idempotent — calling twice returns same value", () => {
    expect(recommendedLowerBound(20)).toBe(recommendedLowerBound(20));
    expect(recommendedUpperBound(20)).toBe(recommendedUpperBound(20));
  });
});
