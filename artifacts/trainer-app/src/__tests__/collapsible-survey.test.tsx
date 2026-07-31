/**
 * @vitest-environment happy-dom
 *
 * CollapsibleSurveySection — focused tests (spec items 1–7)
 *
 * 1. "Jakość regeneracji: Słaba" is visible while the section is collapsed.
 * 2. Activity, physical work, sleep and stress are hidden initially.
 * 3. Clicking "Pokaż szczegóły" reveals all source values.
 * 4. Clicking "Ukryj szczegóły" collapses the section.
 * 5. Pain and medical warnings are never hidden by this accordion.
 * 6. The section exposes the correct accessible expanded state.
 * 7. No interview data is removed or changed.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { CollapsibleSurveySection, DetailRow } from "@/components/CollapsibleSurveySection";
import { Moon } from "lucide-react";

afterEach(cleanup);

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Renders the "Regeneracja i styl życia" section for a poor-recovery client. */
function renderRegeneracjaSection({
  activityLevel = "Siedzący",
  physicalWork = false,
  sleepHours = "5",
  stressLevel = "2/10",
  recoveryLabel = "Słaba",
  badgeClass = "bg-red-50 text-red-700 border-red-200",
} = {}) {
  return render(
    <CollapsibleSurveySection
      icon={<Moon size={14} />}
      title="Regeneracja i styl życia"
      summaryLabel="Jakość regeneracji"
      summaryValue={recoveryLabel}
      badgeClass={badgeClass}
      data-testid="regeneracja-section"
    >
      <DetailRow label="Aktywność codzienna" value={activityLevel} />
      <DetailRow label="Praca fizyczna" value={physicalWork ? "Tak" : "Nie"} />
      <DetailRow label="Sen" value={`${sleepHours} h`} />
      <DetailRow label="Poziom stresu" value={stressLevel} />
      <DetailRow label="Jakość regeneracji" value={recoveryLabel} />
    </CollapsibleSurveySection>,
  );
}

// ─── Test 1: summary badge visible when collapsed ─────────────────────────────

describe("(1) 'Jakość regeneracji: Słaba' is visible while the section is collapsed", () => {
  it("renders the badge text in the header without expanding", () => {
    renderRegeneracjaSection();
    const badge = screen.getByTestId("summary-badge");
    expect(badge.textContent).toContain("Jakość regeneracji");
    expect(badge.textContent).toContain("Słaba");
  });

  it("badge is visible before any interaction", () => {
    renderRegeneracjaSection();
    // The section starts collapsed; the toggle label says "Pokaż szczegóły"
    expect(screen.getByTestId("toggle-label").textContent).toBe("Pokaż szczegóły");
    // Badge still visible
    expect(screen.getByTestId("summary-badge")).toBeDefined();
  });

  it("shows the section title 'Regeneracja i styl życia' collapsed", () => {
    renderRegeneracjaSection();
    expect(screen.getByText("Regeneracja i styl życia")).toBeDefined();
  });
});

// ─── Test 2: source values hidden initially ───────────────────────────────────

describe("(2) Activity, physical work, sleep and stress are hidden initially", () => {
  it("detail body is not in the DOM when collapsed", () => {
    renderRegeneracjaSection();
    expect(screen.queryByTestId("section-details")).toBeNull();
  });

  it("'Aktywność codzienna' row is not visible before expansion", () => {
    renderRegeneracjaSection();
    expect(screen.queryByText("Aktywność codzienna")).toBeNull();
  });

  it("'Praca fizyczna' row is not visible before expansion", () => {
    renderRegeneracjaSection();
    expect(screen.queryByText("Praca fizyczna")).toBeNull();
  });

  it("'Sen' row is not visible before expansion", () => {
    renderRegeneracjaSection();
    expect(screen.queryByText("Sen")).toBeNull();
  });

  it("'Poziom stresu' row is not visible before expansion", () => {
    renderRegeneracjaSection();
    expect(screen.queryByText("Poziom stresu")).toBeNull();
  });
});

// ─── Test 3: "Pokaż szczegóły" reveals all source values ─────────────────────

describe("(3) Clicking 'Pokaż szczegóły' reveals all source values", () => {
  it("shows the detail body after clicking", () => {
    renderRegeneracjaSection();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("section-details")).toBeDefined();
  });

  it("'Aktywność codzienna' is visible after expansion", () => {
    renderRegeneracjaSection({ activityLevel: "Siedzący" });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Aktywność codzienna")).toBeDefined();
    expect(screen.getByText("Siedzący")).toBeDefined();
  });

  it("'Praca fizyczna: Nie' is visible after expansion", () => {
    renderRegeneracjaSection({ physicalWork: false });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Praca fizyczna")).toBeDefined();
    expect(screen.getByText("Nie")).toBeDefined();
  });

  it("'Sen: 5 h' is visible after expansion", () => {
    renderRegeneracjaSection({ sleepHours: "5" });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Sen")).toBeDefined();
    expect(screen.getByText("5 h")).toBeDefined();
  });

  it("'Poziom stresu: 2/10' is visible after expansion", () => {
    renderRegeneracjaSection({ stressLevel: "2/10" });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Poziom stresu")).toBeDefined();
    expect(screen.getByText("2/10")).toBeDefined();
  });

  it("toggle label changes to 'Ukryj szczegóły' after clicking", () => {
    renderRegeneracjaSection();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("toggle-label").textContent).toBe("Ukryj szczegóły");
  });
});

// ─── Test 4: "Ukryj szczegóły" collapses the section ─────────────────────────

describe("(4) Clicking 'Ukryj szczegóły' collapses the section", () => {
  it("clicking twice returns to collapsed state", () => {
    renderRegeneracjaSection();
    const btn = screen.getByRole("button");
    // Expand
    fireEvent.click(btn);
    expect(screen.getByTestId("section-details")).toBeDefined();
    // Collapse
    fireEvent.click(btn);
    expect(screen.queryByTestId("section-details")).toBeNull();
  });

  it("source value rows disappear after collapsing", () => {
    renderRegeneracjaSection();
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(screen.getByText("Aktywność codzienna")).toBeDefined();
    fireEvent.click(btn);
    expect(screen.queryByText("Aktywność codzienna")).toBeNull();
  });

  it("toggle label returns to 'Pokaż szczegóły' after collapsing", () => {
    renderRegeneracjaSection();
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getByTestId("toggle-label").textContent).toBe("Pokaż szczegóły");
  });
});

// ─── Test 5: Pain and medical warnings are never hidden ───────────────────────

describe("(5) Pain and medical warnings are never hidden by this accordion", () => {
  it("a pain warning rendered OUTSIDE the accordion is always visible", () => {
    render(
      <div>
        {/* Pain warning — must NOT be wrapped in CollapsibleSurveySection */}
        <div
          data-testid="pain-warning"
          role="alert"
          className="border-2 border-red-500 bg-red-50 rounded-lg p-4"
        >
          <p>Uwaga: klient zgłasza ból kolana</p>
        </div>

        {/* Lifestyle section is collapsible — pain warning is not */}
        <CollapsibleSurveySection
          icon={<Moon size={14} />}
          title="Regeneracja i styl życia"
          summaryLabel="Jakość regeneracji"
          summaryValue="Słaba"
        >
          <DetailRow label="Sen" value="5 h" />
        </CollapsibleSurveySection>
      </div>,
    );

    // Pain warning always visible regardless of accordion state
    expect(screen.getByTestId("pain-warning")).toBeDefined();
    expect(screen.getByText("Uwaga: klient zgłasza ból kolana")).toBeDefined();

    // Clicking the accordion button does not affect the pain warning
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("pain-warning")).toBeDefined();
  });

  it("health card rendered alongside collapsed accordion is always visible", () => {
    render(
      <div>
        <div data-testid="health-card" role="region" aria-label="Kontuzje i ograniczenia">
          <p>Ograniczenie ruchowe: prawe kolano</p>
        </div>
        <CollapsibleSurveySection
          icon={<Moon size={14} />}
          title="Regeneracja i styl życia"
          summaryLabel="Jakość regeneracji"
          summaryValue="Umiarkowana"
        >
          <DetailRow label="Sen" value="7 h" />
        </CollapsibleSurveySection>
      </div>,
    );
    // Health card visible before and after toggle
    expect(screen.getByTestId("health-card")).toBeDefined();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("health-card")).toBeDefined();
  });
});

// ─── Test 6: Correct accessible expanded state ────────────────────────────────

describe("(6) The section exposes the correct accessible expanded state", () => {
  it("button has aria-expanded=false when collapsed", () => {
    renderRegeneracjaSection();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("button has aria-expanded=true when expanded", () => {
    renderRegeneracjaSection();
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("button's aria-controls matches the id of the detail body", () => {
    renderRegeneracjaSection();
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    const controlledId = btn.getAttribute("aria-controls");
    expect(controlledId).toBeTruthy();
    const body = document.getElementById(controlledId!);
    expect(body).not.toBeNull();
    expect(body?.getAttribute("data-testid")).toBe("section-details");
  });

  it("aria-expanded toggles correctly on repeated clicks", () => {
    renderRegeneracjaSection();
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });
});

// ─── Test 7: No interview data is removed or changed ─────────────────────────

describe("(7) No interview data is removed or changed", () => {
  it("all values appear verbatim in the expanded body", () => {
    renderRegeneracjaSection({
      activityLevel: "Siedzący",
      physicalWork: false,
      sleepHours: "5",
      stressLevel: "2/10",
      recoveryLabel: "Słaba",
    });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Siedzący")).toBeDefined();
    expect(screen.getByText("Nie")).toBeDefined();
    expect(screen.getByText("5 h")).toBeDefined();
    expect(screen.getByText("2/10")).toBeDefined();
    // Jakość regeneracji appears both in the badge and in the detail row
    expect(screen.getAllByText(/Słaba/).length).toBeGreaterThanOrEqual(1);
  });

  it("value in summary badge matches the value shown inside the details", () => {
    renderRegeneracjaSection({ recoveryLabel: "Dobra", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" });
    // Badge shows "Dobra" before expansion
    expect(screen.getByTestId("summary-badge").textContent).toContain("Dobra");
    // After expansion the same value appears in the detail row too
    fireEvent.click(screen.getByRole("button"));
    // At least two occurrences: badge + detail row
    expect(screen.getAllByText(/Dobra/).length).toBeGreaterThanOrEqual(2);
  });

  it("DetailRow suppresses a null value without throwing", () => {
    expect(() =>
      render(
        <CollapsibleSurveySection
          icon={<Moon size={14} />}
          title="Test"
          summaryLabel="Test"
          summaryValue="Ok"
        >
          <DetailRow label="Nullable field" value={null} />
          <DetailRow label="Defined field" value="wartość" />
        </CollapsibleSurveySection>,
      ),
    ).not.toThrow();
    fireEvent.click(screen.getByRole("button"));
    // Null row must not appear in DOM
    expect(screen.queryByText("Nullable field")).toBeNull();
    // Defined row is visible
    expect(screen.getByText("wartość")).toBeDefined();
  });
});
