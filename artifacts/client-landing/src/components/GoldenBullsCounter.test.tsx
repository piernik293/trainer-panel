// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { GoldenBullsCounter } from "@workspace/design-tokens/brand";

const status = (b: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(b), { status: ok ? 200 : 500 })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("licznik „Złote Byczki”", () => {
  it("pokazuje „zostało X z N” osobno dla trenerów i Solo", async () => {
    status({ enabled: true, trainer: { pool: 10, left: 7 }, solo: { pool: 100, left: 64 } });
    const { unmount } = render(<GoldenBullsCounter kind="trainer" />);
    expect((await screen.findByTestId("golden-bulls-counter")).textContent).toContain("zostało 7 z 10");
    unmount();
    render(<GoldenBullsCounter kind="solo" />);
    expect((await screen.findByTestId("golden-bulls-counter")).textContent).toContain("zostało 64 z 100");
  });
  it("znika: kampania wyłączona, pula pusta, błąd serwera", async () => {
    for (const [body, ok] of [[{ enabled: false, trainer: { pool: 10, left: 0 }, solo: { pool: 100, left: 0 } }, true], [{ enabled: true, trainer: { pool: 10, left: 0 }, solo: { pool: 100, left: 5 } }, true], [{}, false]] as const) {
      status(body, ok);
      const { unmount } = render(<GoldenBullsCounter kind="trainer" />);
      await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByTestId("golden-bulls-counter")).toBeNull();
      unmount();
    }
  });
});
