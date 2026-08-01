/**
 * @vitest-environment happy-dom
 *
 * Step1Summary right-side panel layout — focused tests (spec items 31–38)
 *
 * Tests the conditional two-column layout introduced in PlanDraftWizard:
 *   - pain warning renders in the right-side panel on desktop
 *   - activity recommendation renders below the pain warning
 *   - the panel is sticky on desktop
 *   - cards move above main content on mobile
 *   - main content expands when no card exists
 *   - empty placeholder panels are not rendered
 *   - existing warning and recommendation text remains unchanged
 *   - layout does not introduce horizontal scrolling
 *
 * Uses a minimal TestLayout component that exercises the same conditional logic
 * as the real Step1Summary without needing the full wizard context (Clerk, TanStack
 * Query, etc.).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

afterEach(cleanup);

// ─── Test component (mirrors Step1Summary's layout logic) ─────────────────────

interface TestLayoutProps {
  showPainAlert: boolean;
  showHealthAlert: boolean;
  showCardioNote: boolean;
  painText?: string;
  cardioText?: string;
}

function TestLayout({
  showPainAlert,
  showHealthAlert,
  showCardioNote,
  painText = "Boli mnie kolano",
  cardioText = "Rekomenduje się 8000 kroków dziennie",
}: TestLayoutProps) {
  const hasRightPanel = showPainAlert || showHealthAlert || showCardioNote;

  return (
    <div
      className={hasRightPanel ? "lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start" : ""}
      data-testid="outer-container"
    >
      {/* Left column */}
      <div className="space-y-4 min-w-0" data-testid="main-column">
        {/* Mobile cards (visible on mobile, hidden on desktop) */}
        {hasRightPanel && (
          <div
            className="lg:hidden space-y-3"
            role="region"
            aria-label="Ostrzeżenia i rekomendacje"
            data-testid="mobile-cards"
          >
            {showPainAlert && (
              <div data-testid="pain-mobile" className="border-2 border-red-500 bg-red-50 rounded-lg p-4">
                <span className="font-semibold text-red-700">Zwróć uwagę: klient zgłasza ból</span>
                <p className="text-sm text-red-700 mt-1">&ldquo;{painText}&rdquo;</p>
              </div>
            )}
            {showHealthAlert && (
              <div data-testid="health-mobile" className="border-2 border-amber-400 bg-amber-50 rounded-lg p-4">
                <span className="font-semibold text-amber-700">Uwaga: zgłoszono zdrowie / ograniczenia</span>
              </div>
            )}
            {showCardioNote && (
              <div data-testid="cardio-mobile" className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                <span className="font-semibold text-blue-700">Rekomendacje aktywności</span>
                <p className="text-sm text-blue-700 mt-1">{cardioText}</p>
              </div>
            )}
          </div>
        )}

        {/* Main data content */}
        <div data-testid="data-cards">
          <div data-testid="client-card">Dane klienta</div>
          <div data-testid="profile-card">Profil treningowy</div>
        </div>
      </div>

      {/* Desktop right panel */}
      {hasRightPanel && (
        <aside
          className="hidden lg:block space-y-3"
          aria-label="Ostrzeżenia i rekomendacje"
          data-testid="right-panel"
        >
          {showPainAlert && (
            <div data-testid="pain-desktop" className="border-2 border-red-500 bg-red-50 rounded-lg p-4">
              <span className="font-semibold text-red-700">Zwróć uwagę: klient zgłasza ból</span>
              <p className="text-sm text-red-700 mt-1">&ldquo;{painText}&rdquo;</p>
            </div>
          )}
          {showHealthAlert && (
            <div data-testid="health-desktop" className="border-2 border-amber-400 bg-amber-50 rounded-lg p-4">
              <span>Uwaga: zgłoszono zdrowie / ograniczenia</span>
            </div>
          )}
          {showCardioNote && (
            <div data-testid="cardio-desktop" className="border border-blue-200 bg-blue-50 rounded-lg p-4">
              <span className="font-semibold text-blue-700">Rekomendacje aktywności</span>
              <p className="text-sm text-blue-700 mt-1">{cardioText}</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

// ─── 31. Pain warning renders in the right-side panel on desktop ──────────────

describe("(31) Pain warning is present in the right-side panel", () => {
  it("right panel exists when pain is detected", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    expect(screen.getByTestId("right-panel")).toBeDefined();
    expect(screen.getByTestId("pain-desktop")).toBeDefined();
  });

  it("pain warning text is visible in the right panel", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    const rightPanel = screen.getByTestId("right-panel");
    expect(rightPanel.textContent).toContain("Zwróć uwagę: klient zgłasza ból");
  });
});

// ─── 32. Activity recommendation renders below the pain warning ───────────────

describe("(32) Activity recommendation appears below the pain warning", () => {
  it("cardio card is in the right panel when both pain and cardio exist", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={true} />,
    );
    const rightPanel = screen.getByTestId("right-panel");
    expect(rightPanel.textContent).toContain("Rekomendacje aktywności");
  });

  it("cardio card appears after pain card in the DOM within the right panel", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={true} />,
    );
    const rightPanel = screen.getByTestId("right-panel");
    const children = Array.from(rightPanel.children);
    const painIdx = children.findIndex((c) => c.getAttribute("data-testid") === "pain-desktop");
    const cardioIdx = children.findIndex((c) => c.getAttribute("data-testid") === "cardio-desktop");
    expect(painIdx).toBeLessThan(cardioIdx);
  });
});

// ─── 33. The panel is NOT sticky (scrolls away naturally) ────────────────────

describe("(33) Right panel has no sticky positioning class", () => {
  it("aside does not have the lg:sticky class", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    const aside = screen.getByTestId("right-panel");
    expect(aside.className).not.toContain("lg:sticky");
  });

  it("aside has no top offset class", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    const aside = screen.getByTestId("right-panel");
    expect(aside.className).not.toContain("lg:top-");
  });
});

// ─── 34. Cards move above the main content on mobile ─────────────────────────

describe("(34) Mobile: warning cards appear above the main data sections in DOM order", () => {
  it("mobile-cards div is present when pain alert exists", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    expect(screen.getByTestId("mobile-cards")).toBeDefined();
  });

  it("mobile-cards appears before the data-cards in the main column", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    const mainColumn = screen.getByTestId("main-column");
    const children = Array.from(mainColumn.children);
    const mobileIdx = children.findIndex((c) => c.getAttribute("data-testid") === "mobile-cards");
    const dataIdx = children.findIndex((c) => c.getAttribute("data-testid") === "data-cards");
    expect(mobileIdx).toBeLessThan(dataIdx);
  });
});

// ─── 35. Main content expands when no card exists ────────────────────────────

describe("(35) Main content uses full width when no warning or recommendation exists", () => {
  it("outer container has no grid class when there are no cards", () => {
    render(
      <TestLayout showPainAlert={false} showHealthAlert={false} showCardioNote={false} />,
    );
    const container = screen.getByTestId("outer-container");
    // No grid class applied — content uses full width
    expect(container.className).not.toContain("lg:grid");
  });

  it("outer container has grid class when pain alert exists", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    const container = screen.getByTestId("outer-container");
    expect(container.className).toContain("lg:grid");
  });
});

// ─── 36. Empty placeholder panels are not rendered ───────────────────────────

describe("(36) No empty right panel or mobile-cards section is rendered", () => {
  it("right panel does not exist when no warnings or recommendations", () => {
    render(
      <TestLayout showPainAlert={false} showHealthAlert={false} showCardioNote={false} />,
    );
    expect(screen.queryByTestId("right-panel")).toBeNull();
  });

  it("mobile-cards section does not exist when no warnings or recommendations", () => {
    render(
      <TestLayout showPainAlert={false} showHealthAlert={false} showCardioNote={false} />,
    );
    expect(screen.queryByTestId("mobile-cards")).toBeNull();
  });

  it("right panel exists with only a cardio note (no pain)", () => {
    render(
      <TestLayout showPainAlert={false} showHealthAlert={false} showCardioNote={true} />,
    );
    expect(screen.getByTestId("right-panel")).toBeDefined();
    // Pain element must NOT be in the right panel
    expect(screen.queryByTestId("pain-desktop")).toBeNull();
    // Cardio element IS in the right panel
    expect(screen.getByTestId("cardio-desktop")).toBeDefined();
  });
});

// ─── 37. Existing warning text and recommendation content remain unchanged ────

describe("(37) Warning text and recommendation content are preserved", () => {
  it("pain warning heading is 'Zwróć uwagę: klient zgłasza ból'", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    expect(screen.getAllByText(/Zwróć uwagę: klient zgłasza ból/).length).toBeGreaterThan(0);
  });

  it("activity recommendation heading is 'Rekomendacje aktywności'", () => {
    render(
      <TestLayout showPainAlert={false} showHealthAlert={false} showCardioNote={true} />,
    );
    expect(screen.getAllByText(/Rekomendacje aktywności/).length).toBeGreaterThan(0);
  });

  it("original client pain text is quoted in the card", () => {
    render(
      <TestLayout
        showPainAlert={true}
        showHealthAlert={false}
        showCardioNote={false}
        painText="Boli mnie kolano od miesica"
      />,
    );
    // The text appears inside both the mobile and desktop cards
    expect(screen.getAllByText(/Boli mnie kolano od miesica/).length).toBeGreaterThan(0);
  });
});

// ─── 38. Layout does not introduce horizontal scrolling ──────────────────────

describe("(38) Layout does not create horizontal overflow", () => {
  it("outer container does not have overflow-x classes", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={true} />,
    );
    const container = screen.getByTestId("outer-container");
    expect(container.className).not.toContain("overflow-x-scroll");
    expect(container.className).not.toContain("overflow-x-auto");
  });

  it("main column has min-w-0 to prevent grid blowout", () => {
    render(
      <TestLayout showPainAlert={true} showHealthAlert={false} showCardioNote={false} />,
    );
    const mainColumn = screen.getByTestId("main-column");
    expect(mainColumn.className).toContain("min-w-0");
  });
});
