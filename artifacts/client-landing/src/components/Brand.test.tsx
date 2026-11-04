// @vitest-environment happy-dom
/** Marka v1 (BRAND_V1_ENABLED): logo, byczek w 6 stanach, ładowanie (nie miga), błąd, puste stany, sekwencja logowania, ikony PWA. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  Maskotka, MASKOTKA_STANY, MASKOTKA_PX, Logo, LogoIcon, GoldenBullBadge, Loading, ErrorState, EmptyState, IfBrand, PlanBuilding, LoginSequence,
  shouldPlayLoginSequence, LOGIN_STEPS, setBrandV1ForTests, resetBrandV1ForTests,
} from "@workspace/design-tokens/brand";
import { BrandMark } from "./BrandMark";

beforeEach(() => { resetBrandV1ForTests(); vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 }))); window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Byczek (Maskotka)", () => {
  it("renderuje każdy z 6 stanów z klasą stanu i opisem dla czytników", () => {
    for (const stan of MASKOTKA_STANY) {
      const { unmount } = render(<Maskotka stan={stan} />);
      const el = screen.getByTestId("maskotka");
      expect(el.getAttribute("class")).toContain(`s-${stan}`);
      expect(el.getAttribute("aria-label")).toContain("Byczek");
      unmount();
    }
    expect(MASKOTKA_STANY).toEqual(["idle", "walk", "lift", "success", "loading", "error"]);
  });
  it("3 rozmiary (s, m, l), proporcje 200:220; ozdobny byczek jest ukryty dla czytników", () => {
    const sizes = (["s", "m", "l"] as const).map((r) => { const { unmount } = render(<Maskotka rozmiar={r} decorative />); const el = screen.getByTestId("maskotka"); const w = Number(el.getAttribute("width")); unmount(); return w; });
    expect(sizes).toEqual([MASKOTKA_PX.s, MASKOTKA_PX.m, MASKOTKA_PX.l]);
    render(<Maskotka decorative />);
    expect(screen.getByTestId("maskotka").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByTestId("maskotka").getAttribute("role")).toBeNull();
  });
  it("CSS: animacje wszystkich stanów i prefers-reduced-motion (byczek stoi nieruchomo)", () => {
    const css = readFileSync(join(__dirname, "../../../../lib/design-tokens/src/brand/brand.css"), "utf8");
    for (const s of ["s-idle", "s-walk", "s-lift", "s-success", "s-loading", "s-error"]) expect(css, s).toContain(`.${s} `);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\{\.bull \*\{animation:none!important\}\}/);
    expect(css).toContain("transform-origin:64px 108px"); // ręce i głowa mają transform-origin w px (jak w projekcie)
  });
  it("odznaka „Złoty Byczek” ma opis", () => {
    render(<GoldenBullBadge />);
    expect(screen.getByRole("img", { name: "Odznaka Złoty Byczek" })).toBeTruthy();
  });
});

describe("Logo A „Rogate O”", () => {
  it("ikona i wersje: kolor (#C2410C), biała, sama ikona", () => {
    const { unmount } = render(<LogoIcon />);
    expect(document.querySelector("circle")!.getAttribute("stroke")).toBe("#C2410C");
    unmount();
    render(<Logo variant="white" />);
    expect(screen.getByTestId("logo").textContent).toBe("optimatren");
    expect(document.querySelector("circle")!.getAttribute("stroke")).toBe("#FFFFFF");
  });
  it("BrandMark: bez flagi dawny kwadrat „O”, z flagą logo A", () => {
    const { container, rerender } = render(<BrandMark />);
    expect(container.textContent).toBe("O");
    expect(screen.queryByTestId("logo-icon")).toBeNull();
    act(() => setBrandV1ForTests(true));
    rerender(<BrandMark />);
    expect(screen.getByTestId("logo-icon")).toBeTruthy();
    expect(container.textContent).toBe("");
  });
  it("IfBrand: bez flagi zawartość zapasowa, z flagą nowa", () => {
    const { rerender } = render(<IfBrand fallback={<p>stare</p>}><p>nowe</p></IfBrand>);
    expect(screen.getByText("stare")).toBeTruthy();
    act(() => setBrandV1ForTests(true));
    rerender(<IfBrand fallback={<p>stare</p>}><p>nowe</p></IfBrand>);
    expect(screen.getByText("nowe")).toBeTruthy();
  });
});

describe("ładowanie, błąd, puste stany", () => {
  it("ładowanie nie miga: przed 600 ms nic nie widać, po 600 ms byczek (loading), po 5 s „Jeszcze chwila…”", () => {
    vi.useFakeTimers();
    render(<Loading />);
    expect(screen.getByTestId("loading").getAttribute("data-visible")).toBe("0");
    expect(screen.queryByTestId("maskotka")).toBeNull();
    act(() => { vi.advanceTimersByTime(599); });
    expect(screen.queryByTestId("maskotka")).toBeNull();
    act(() => { vi.advanceTimersByTime(2); });
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("loading");
    expect(screen.queryByTestId("loading-slow")).toBeNull();
    act(() => { vi.advanceTimersByTime(4500); });
    expect(screen.getByTestId("loading-slow").textContent).toBe("Jeszcze chwila…");
  });
  it("szybka odpowiedź: ekran znika przed 600 ms i byczek nigdy się nie pojawia", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Loading />);
    act(() => { vi.advanceTimersByTime(300); });
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId("maskotka")).toBeNull();
  });
  it("błąd: byczek (error), tekst i „Spróbuj ponownie”", () => {
    const retry = vi.fn();
    render(<ErrorState title="Brak sieci" message="Sprawdź połączenie." onRetry={retry} />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("error");
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" }).className).toContain("min-h-11"); // 44 px
  });
  it("pusty stan: byczek (idle) i tekst", () => {
    render(<EmptyState title="Brak podopiecznych" message="Zaproś pierwszą osobę." />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("idle");
    expect(screen.getByText("Brak podopiecznych")).toBeTruthy();
  });
  it("układanie planu: Walk → Lift → Success (po ukończeniu i min. 2 powtórzeniach)", () => {
    vi.useFakeTimers();
    const { rerender } = render(<PlanBuilding />);
    expect(screen.getByTestId("plan-building").getAttribute("data-stan")).toBe("walk");
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.getByTestId("plan-building").getAttribute("data-stan")).toBe("lift");
    rerender(<PlanBuilding done />); // gotowe zbyt wcześnie — byczek dokończy powtórzenia
    expect(screen.getByTestId("plan-building").getAttribute("data-stan")).toBe("lift");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId("plan-building").getAttribute("data-stan")).toBe("success");
  });
});

describe("sekwencja logowania", () => {
  it("łącznie ok. 1,5 s: Idle → Walk → Lift → Success", () => {
    expect(LOGIN_STEPS.map((s) => s.stan)).toEqual(["idle", "walk", "lift", "success"]);
    const total = LOGIN_STEPS.reduce((a, s) => a + s.ms, 0);
    expect(total).toBeGreaterThan(1200); expect(total).toBeLessThanOrEqual(1600);
  });
  it("raz dziennie: drugi raz tego samego dnia nie gra, następnego dnia gra", () => {
    const mem = new Map<string, string>();
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(shouldPlayLoginSequence("2026-11-04", st)).toBe(true);
    expect(shouldPlayLoginSequence("2026-11-04", st)).toBe(false);
    expect(shouldPlayLoginSequence("2026-11-05", st)).toBe(true);
  });
  it("bez flagi nie pokazuje nic; z flagą gra kolejne stany, kończy się sama i da się pominąć dotknięciem", () => {
    vi.useFakeTimers();
    const { unmount } = render(<LoginSequence today="2026-11-04" />);
    expect(screen.queryByTestId("login-sequence")).toBeNull(); // flaga wyłączona
    unmount();
    window.localStorage.clear();
    act(() => setBrandV1ForTests(true));
    render(<LoginSequence today="2026-11-04" />);
    expect(screen.getByTestId("login-sequence").getAttribute("data-stan")).toBe("idle");
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByTestId("login-sequence").getAttribute("data-stan")).toBe("walk");
    fireEvent.click(screen.getByRole("button", { name: "Pomiń animację" }));
    expect(screen.queryByTestId("login-sequence")).toBeNull();
    cleanup();
    // ten sam dzień: nie gra drugi raz
    render(<LoginSequence today="2026-11-04" />);
    expect(screen.queryByTestId("login-sequence")).toBeNull();
  });
});

describe("pliki marki", () => {
  const pub = join(__dirname, "../../public");
  const png = (f: string) => { const b = readFileSync(join(pub, f)); return { sig: b.subarray(1, 4).toString(), w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
  it("ikony PWA, favicony i apple-touch istnieją w odpowiednich rozmiarach", () => {
    for (const [f, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-512.png", 512], ["apple-touch-icon.png", 180], ["favicon-32.png", 32], ["favicon-512.png", 512]] as const) {
      expect(existsSync(join(pub, f)), f).toBe(true);
      expect(png(f), f).toEqual({ sig: "PNG", w: size, h: size });
    }
  });
  it("logo w SVG (kolor, biała, ikona) i manifest (nazwa Optimatren, kolor motywu #C2410C)", () => {
    for (const f of ["brand/logo.svg", "brand/logo-white.svg", "brand/logo-icon.svg", "brand/logo-icon-white.svg"]) expect(readFileSync(join(pub, f), "utf8"), f).toContain("<svg");
    expect(readFileSync(join(pub, "brand/logo.svg"), "utf8")).toContain("#C2410C");
    const m = JSON.parse(readFileSync(join(pub, "manifest.webmanifest"), "utf8"));
    expect(m.name).toBe("Optimatren"); expect(m.theme_color.toUpperCase()).toBe("#C2410C");
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual(["icon-192.png", "icon-512.png", "icon-maskable-512.png"]);
  });
});
