// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddToHomeHint, detectPlatform } from "./AddToHomeHint";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const setUa = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

describe("podpowiedź „Dodaj do ekranu głównego”", () => {
  beforeEach(() => { window.localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });
  it("rozpoznaje platformę; w zainstalowanej aplikacji i na komputerze nic", () => {
    expect(detectPlatform(IOS, false)).toBe("ios"); expect(detectPlatform(ANDROID, false)).toBe("android");
    expect(detectPlatform(IOS, true)).toBeNull(); expect(detectPlatform(DESKTOP, false)).toBeNull();
  });
  it("iPhone: instrukcja Safari; zamknięcie zapamiętane", () => {
    setUa(IOS);
    const { unmount } = render(<AddToHomeHint show />);
    expect(screen.getByTestId("a2hs-hint").textContent).toContain("Dodaj do ekranu początkowego");
    fireEvent.click(screen.getByTestId("a2hs-dismiss"));
    expect(screen.queryByTestId("a2hs-hint")).toBeNull();
    unmount(); render(<AddToHomeHint show />);
    expect(screen.queryByTestId("a2hs-hint")).toBeNull();
  });
  it("Android: instrukcja Chrome; show=false i komputer: brak", () => {
    setUa(ANDROID);
    const { unmount } = render(<AddToHomeHint show />);
    expect(screen.getByTestId("a2hs-hint").textContent).toContain("Dodaj do ekranu głównego"); unmount();
    render(<AddToHomeHint show={false} />); expect(screen.queryByTestId("a2hs-hint")).toBeNull();
    setUa(DESKTOP); render(<AddToHomeHint show />); expect(screen.queryByTestId("a2hs-hint")).toBeNull();
  });
});
