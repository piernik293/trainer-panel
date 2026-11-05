// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { FirstTips } from "./FirstTips";

const stub = (enabled: boolean) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ enabled }), { status: 200 })));
beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("podpowiedzi na początek", () => {
  it("flaga wyłączona: nic; włączona: 3 podpowiedzi, zamknięcie zapamiętane", async () => {
    stub(false); const { container } = render(<FirstTips show />); await new Promise((r) => setTimeout(r, 20)); expect(container.innerHTML).toBe(""); cleanup();
    stub(true); const { unmount } = render(<FirstTips show />);
    await screen.findByTestId("first-tips"); expect(screen.getAllByRole("listitem")).toHaveLength(3); expect(screen.getByText(/Coś boli/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("first-tips-close")); expect(screen.queryByTestId("first-tips")).toBeNull();
    unmount(); render(<FirstTips show />); await waitFor(() => expect(screen.queryByTestId("first-tips")).toBeNull());
  });
});
