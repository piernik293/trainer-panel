// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ANIMATION_LIBRARY } from "@workspace/survey-config";
import { ExerciseAnimationBox, resetAnimationFlagForTests } from "./ExerciseAnimationBox";

const spec = ANIMATION_LIBRARY[0]!.spec;
function mock(enabled: boolean, found: boolean) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    if (url === "/api/exercise-animations/status") return new Response(JSON.stringify({ enabled }), { status: 200 });
    return found ? new Response(JSON.stringify({ exerciseId: 1, spec }), { status: 200 }) : new Response("{}", { status: 404 });
  }));
  return calls;
}
function reduced(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
}
beforeEach(() => { resetAnimationFlagForTests(); reduced(false); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("animacja w serii", () => {
  it("flaga wyłączona lub brak zatwierdzonej animacji: nic, i bez pytania o animację przy wyłączonej fladze", async () => {
    let calls = mock(false, true); const { container } = render(<ExerciseAnimationBox exerciseId={1} name="X" />);
    await waitFor(() => expect(calls).toContain("/api/exercise-animations/status")); expect(container.innerHTML).toBe(""); expect(calls.length).toBe(1); cleanup();
    resetAnimationFlagForTests(); calls = mock(true, false); const r2 = render(<ExerciseAnimationBox exerciseId={1} name="X" />);
    await waitFor(() => expect(calls.length).toBe(2)); expect(r2.container.innerHTML).toBe("");
  });
  it("zatwierdzona: pokazuje animację z przyciskiem pauzy (pauza i wznowienie)", async () => {
    mock(true, true); render(<ExerciseAnimationBox exerciseId={1} name="Pompki" />);
    await screen.findByTestId("set-animation"); const b = screen.getByTestId("animation-pause");
    expect(b.textContent).toBe("Wstrzymaj animację"); fireEvent.click(b); expect(b.textContent).toBe("Odtwórz animację"); expect(b.getAttribute("aria-pressed")).toBe("true");
  });
  it("„ogranicz ruch”: klatka statyczna i brak przycisku pauzy (nic się nie rusza)", async () => {
    reduced(true); mock(true, true); render(<ExerciseAnimationBox exerciseId={1} name="Pompki" />);
    await screen.findByTestId("set-animation"); expect(screen.queryByTestId("animation-pause")).toBeNull();
  });
  it("rozmiar danych animacji jest mały (< 4 KB na ćwiczenie)", () => { for (const a of ANIMATION_LIBRARY) expect(JSON.stringify(a.spec).length, a.name).toBeLessThan(4096); });
});
