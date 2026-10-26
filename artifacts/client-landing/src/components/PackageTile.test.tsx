// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { PackageTile } from "./PackageTile";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const stub = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body })));

describe("PackageTile", () => {
  it("shows 'Zostało X sesji' with correct Polish form, never a price", async () => {
    stub({ visible: true, remaining: 3, total: 10, pricePln: "400.00" });
    render(<PackageTile />);
    await waitFor(() => expect(screen.getByTestId("package-tile")).toBeTruthy());
    expect(screen.getByTestId("package-tile").textContent).toBe("Zostało 3 sesje z 10 w pakiecie");
    expect(screen.getByTestId("package-tile").textContent).not.toMatch(/zł|400/);
  });
  it.each([[1, "sesja"], [5, "sesji"], [0, "sesji"], [22, "sesje"]])("%i → %s", async (n, w) => {
    stub({ visible: true, remaining: n, total: 30 });
    render(<PackageTile />);
    await waitFor(() => expect(screen.getByTestId("package-tile").textContent).toContain(`Zostało ${n} ${w}`));
  });
  it("renders nothing when the trainer did not allow it or on error", async () => {
    stub({ visible: false }); const { container, rerender } = render(<PackageTile />);
    await new Promise((r) => setTimeout(r, 20)); expect(container.innerHTML).toBe("");
    stub({}, false); rerender(<PackageTile />); await new Promise((r) => setTimeout(r, 20)); expect(container.innerHTML).toBe("");
  });
});
