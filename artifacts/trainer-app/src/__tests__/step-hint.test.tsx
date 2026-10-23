/**
 * @vitest-environment happy-dom
 *
 * StepHint — the tip on the target screen appears only for ?krok=<step>, and can be closed.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { StepHint } from "@/components/dashboard/StepHint";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("StepHint", () => {
  it("is hidden without ?krok=", () => {
    render(<StepHint step={2}>Wskazówka</StepHint>);
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("is hidden for another step number", () => {
    window.history.replaceState({}, "", "/survey-invite?krok=3");
    render(<StepHint step={2}>Wskazówka</StepHint>);
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("shows for the matching step and closes", () => {
    window.history.replaceState({}, "", "/survey-invite?krok=2");
    render(<StepHint step={2}>Wskazówka</StepHint>);
    expect(screen.getByRole("note").textContent).toContain("Krok 2 z 5");
    fireEvent.click(screen.getByRole("button", { name: "Zamknij podpowiedź" }));
    expect(screen.queryByRole("note")).toBeNull();
  });
});
