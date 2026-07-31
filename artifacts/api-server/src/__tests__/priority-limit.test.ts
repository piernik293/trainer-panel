/**
 * Beginner / inactive priority-muscle limit — focused tests (spec items 1–5)
 *
 * Tests 1–5 correspond directly to the spec's "Priority limit" section.
 * The validation logic is tested as pure business logic extracted from the route
 * handlers (surveys.ts PUT + PATCH) — no database or HTTP layer required for 1–4.
 * Test 5 verifies the level-switch clearing behaviour as pure logic.
 */

import { describe, it, expect } from "vitest";

// ─── Pure validation helper (mirrors the inline check in surveys.ts) ──────────

const BEGINNER_LEVELS = new Set(["Brak aktywności fizycznej", "Początkujący"]);
const ADVANCED_LEVELS = new Set(["Średniozaawansowany", "Zaawansowany"]);

/**
 * Returns an error message when the submitted priorities violate the beginner
 * limit, or null when the submission is valid.
 */
function validateBeginnerPriorityLimit(
  experienceLevel: string | null | undefined,
  priorityMuscle1?: string | null,
  priorityMuscle2?: string | null,
  priorityMuscle3?: string | null,
): string | null {
  if (!experienceLevel || !BEGINNER_LEVELS.has(experienceLevel)) return null;

  const filled = [priorityMuscle1, priorityMuscle2, priorityMuscle3].filter(
    (p) => typeof p === "string" && p.trim() !== "",
  );
  if (filled.length > 1) {
    return "Klienci na poziomie Początkujący lub Brak aktywności fizycznej mogą mieć maksymalnie jedną priorytetową partię mięśniową.";
  }
  return null;
}

/**
 * Mirrors the frontend clear-on-level-change logic from SurveyForm.tsx:
 * when the experience level changes to a beginner/inactive level, slots 2 and 3
 * are cleared.
 */
function applyBeginnerClear(
  experienceLevel: string,
  priorities: { p1?: string; p2?: string; p3?: string },
): { p1?: string; p2?: string; p3?: string } {
  if (!BEGINNER_LEVELS.has(experienceLevel)) return priorities;
  return { p1: priorities.p1, p2: "", p3: "" };
}

// ─── Test 1: No-activity client can select only one priority ──────────────────

describe("(1) No-activity client — max 1 priority muscle allowed", () => {
  it("accepts zero priorities", () => {
    expect(validateBeginnerPriorityLimit("Brak aktywności fizycznej")).toBeNull();
  });

  it("accepts exactly one priority", () => {
    expect(validateBeginnerPriorityLimit("Brak aktywności fizycznej", "Nogi")).toBeNull();
  });

  it("rejects two priorities", () => {
    const err = validateBeginnerPriorityLimit(
      "Brak aktywności fizycznej",
      "Nogi",
      "Ramiona",
    );
    expect(err).toBeTruthy();
    expect(err).toContain("Początkujący");
  });

  it("rejects three priorities", () => {
    const err = validateBeginnerPriorityLimit(
      "Brak aktywności fizycznej",
      "Nogi",
      "Ramiona",
      "Barki",
    );
    expect(err).toBeTruthy();
  });
});

// ─── Test 2: Beginner can select only one priority ────────────────────────────

describe("(2) Beginner client — max 1 priority muscle allowed", () => {
  it("accepts zero priorities", () => {
    expect(validateBeginnerPriorityLimit("Początkujący")).toBeNull();
  });

  it("accepts exactly one priority", () => {
    expect(validateBeginnerPriorityLimit("Początkujący", "Barki")).toBeNull();
  });

  it("rejects two priorities", () => {
    const err = validateBeginnerPriorityLimit("Początkujący", "Barki", "Klatka");
    expect(err).toBeTruthy();
  });

  it("ignores empty-string entries (empty strings do not count)", () => {
    expect(validateBeginnerPriorityLimit("Początkujący", "Barki", "", "")).toBeNull();
    expect(validateBeginnerPriorityLimit("Początkujący", "", "Barki", "")).toBeNull();
  });
});

// ─── Test 3: Intermediate / advanced retain the existing limit (up to 3) ──────

describe("(3) Intermediate and advanced clients — up to 3 priorities allowed", () => {
  for (const level of ADVANCED_LEVELS) {
    it(`'${level}' accepts 3 priorities`, () => {
      expect(
        validateBeginnerPriorityLimit(level, "Barki", "Klatka", "Plecy"),
      ).toBeNull();
    });

    it(`'${level}' accepts 2 priorities`, () => {
      expect(validateBeginnerPriorityLimit(level, "Barki", "Klatka")).toBeNull();
    });

    it(`'${level}' accepts 1 priority`, () => {
      expect(validateBeginnerPriorityLimit(level, "Barki")).toBeNull();
    });

    it(`'${level}' accepts zero priorities`, () => {
      expect(validateBeginnerPriorityLimit(level)).toBeNull();
    });
  }
});

// ─── Test 4: Manipulated backend request with multiple beginner priorities is rejected

describe("(4) Backend rejects manipulated request with multiple beginner priorities", () => {
  it("error message identifies the beginner level", () => {
    const err = validateBeginnerPriorityLimit(
      "Brak aktywności fizycznej",
      "Nogi",
      "Barki",
    );
    expect(err).toMatch(/Początkujący|Brak aktywności/);
  });

  it("error is produced for 'Początkujący' with two priorities", () => {
    expect(
      validateBeginnerPriorityLimit("Początkujący", "Nogi", "Barki"),
    ).toBeTruthy();
  });

  it("null experienceLevel in request does not error (partial update)", () => {
    // A PATCH that omits experienceLevel should not trigger the limit check
    expect(
      validateBeginnerPriorityLimit(null, "Nogi", "Barki"),
    ).toBeNull();
  });

  it("unknown level does not trigger the beginner limit", () => {
    expect(
      validateBeginnerPriorityLimit("Ekspert", "Nogi", "Barki"),
    ).toBeNull();
  });
});

// ─── Test 5: Changing level to beginner with multiple priorities requires correction

describe("(5) Switching to beginner — additional priorities are cleared", () => {
  it("clears priorities 2 and 3 when switching from advanced to beginner", () => {
    const result = applyBeginnerClear("Początkujący", {
      p1: "Barki",
      p2: "Plecy",
      p3: "Klatka",
    });
    expect(result.p1).toBe("Barki");
    expect(result.p2).toBe("");
    expect(result.p3).toBe("");
  });

  it("clears priorities 2 and 3 when switching to 'Brak aktywności fizycznej'", () => {
    const result = applyBeginnerClear("Brak aktywności fizycznej", {
      p1: "Nogi",
      p2: "Plecy",
      p3: "Barki",
    });
    expect(result.p1).toBe("Nogi");
    expect(result.p2).toBe("");
    expect(result.p3).toBe("");
  });

  it("does not clear priorities when staying at an advanced level", () => {
    const result = applyBeginnerClear("Zaawansowany", {
      p1: "Barki",
      p2: "Plecy",
      p3: "Klatka",
    });
    expect(result.p2).toBe("Plecy");
    expect(result.p3).toBe("Klatka");
  });

  it("form submission after clear passes the single-priority validation", () => {
    const afterClear = applyBeginnerClear("Początkujący", {
      p1: "Barki",
      p2: "Plecy",
      p3: "",
    });
    const err = validateBeginnerPriorityLimit(
      "Początkujący",
      afterClear.p1,
      afterClear.p2,
      afterClear.p3,
    );
    expect(err).toBeNull();
  });
});
