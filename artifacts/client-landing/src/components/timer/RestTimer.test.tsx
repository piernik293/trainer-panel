// @vitest-environment happy-dom
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const sound = vi.hoisted(() => ({ scheduleRestCues: vi.fn((_secondsLeft: number) => true), cancelRestCues: vi.fn(), unlockAudio: vi.fn(), vibrate: vi.fn(() => true) }));
vi.mock("@/lib/timer/sound", () => sound);

import { RestTimer } from "./RestTimer";
import { startRest, type RestState } from "@/lib/timer/rest";
import { getTimerSettings, resetTimerSettingsForTests, setTimerSettings } from "@/lib/timer/settings";

function Harness({ initial, onClose = vi.fn() }: { initial: RestState; onClose?: () => void }) {
  const [s, set] = useState(initial);
  return <RestTimer state={s} counter={1} onChange={set} onClose={onClose} />;
}
const clock = () => screen.getByTestId("rest-left").textContent;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T12:00:00Z")); window.localStorage.clear(); resetTimerSettingsForTests(); Object.values(sound).forEach((f) => f.mockClear()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("RestTimer", () => {
  it("duży licznik, „Następnie: …”, odlicza od znacznika czasu", () => {
    render(<Harness initial={startRest(90, "Seria 2 z 3")} />);
    expect(clock()).toBe("1:30");
    expect(screen.getByTestId("rest-next-small").textContent).toBe("Następnie: Seria 2 z 3");
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(clock()).toBe("1:00");
  });
  it("po „zgaszeniu ekranu” (czas skacze bez tyknięć) po powrocie pokazuje prawidłowy czas", () => {
    render(<Harness initial={startRest(90, "x")} />);
    act(() => { vi.setSystemTime(Date.now() + 50_000); document.dispatchEvent(new Event("visibilitychange")); });
    expect(clock()).toBe("0:40");
  });
  it("−15 s i +15 s zmieniają czas, a przyciski mają 56 px (h-14)", () => {
    render(<Harness initial={startRest(90, "x")} />);
    const minus = screen.getByRole("button", { name: "Skróć przerwę o 15 sekund" });
    const plus = screen.getByRole("button", { name: "Wydłuż przerwę o 15 sekund" });
    expect(minus.className).toContain("h-14"); expect(plus.className).toContain("h-14");
    fireEvent.click(minus); expect(clock()).toBe("1:15");
    fireEvent.click(plus); fireEvent.click(plus); expect(clock()).toBe("1:45");
  });
  it("„Pomiń przerwę” zamyka ekran", () => {
    const onClose = vi.fn();
    render(<Harness initial={startRest(90, "x")} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Pomiń przerwę" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("dźwięk jest zaplanowany na zegarze audio (3 piknięcia + melodia), a po zmianie czasu planowany od nowa", () => {
    render(<Harness initial={startRest(90, "x")} />);
    expect(sound.scheduleRestCues).toHaveBeenCalledTimes(1);
    expect(sound.scheduleRestCues.mock.calls[0]![0]).toBeCloseTo(90, 0);
    fireEvent.click(screen.getByRole("button", { name: "Wydłuż przerwę o 15 sekund" }));
    expect(sound.scheduleRestCues).toHaveBeenCalledTimes(2);
    expect(sound.scheduleRestCues.mock.calls[1]![0]).toBeCloseTo(105, 0);
  });
  it("koniec: „Dawaj!”, następna seria, wibracja raz; „Zaczynam” zamyka", () => {
    const onClose = vi.fn();
    render(<Harness initial={startRest(15, "Seria 2 z 3")} onClose={onClose} />);
    act(() => { vi.advanceTimersByTime(15_500); });
    expect(screen.getByTestId("rest-cheer").textContent).toBe("Jeszcze jedna!"); // counter 1 → drugi tekst z listy
    expect(screen.getByTestId("rest-next").textContent).toBe("Seria 2 z 3");
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(sound.vibrate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Zaczynam" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("wibracja wyłączona w ustawieniach: brak wibracji na końcu", () => {
    setTimerSettings({ vibration: false });
    render(<Harness initial={startRest(15, "x")} />);
    act(() => { vi.advanceTimersByTime(16_000); });
    expect(sound.vibrate).not.toHaveBeenCalled();
  });
  it("wyciszenie jednym kliknięciem: zapamiętane, bez planowania dźwięku; ponowne włączenie planuje od nowa", () => {
    render(<Harness initial={startRest(60, "x")} />);
    expect(sound.scheduleRestCues).toHaveBeenCalledTimes(1);
    const mute = screen.getByTestId("rest-mute");
    expect(mute.className).toContain("h-11"); expect(mute.className).toContain("w-11"); // 44 px
    expect(mute.getAttribute("aria-label")).toBe("Wycisz dźwięk");
    fireEvent.click(mute);
    expect(getTimerSettings().sound).toBe(false);
    expect(JSON.parse(window.localStorage.getItem("optimatren-timer:v1")!)).toMatchObject({ sound: false, vibration: true });
    expect(screen.getByTestId("rest-mute").getAttribute("aria-label")).toBe("Włącz dźwięk");
    expect(sound.cancelRestCues).toHaveBeenCalled();
    expect(sound.scheduleRestCues).toHaveBeenCalledTimes(1); // wyciszone: nic nowego
    fireEvent.click(screen.getByTestId("rest-mute"));
    expect(sound.scheduleRestCues).toHaveBeenCalledTimes(2);
  });
  it("ustawienia domyślnie: dźwięk i wibracja włączone", () => {
    expect(getTimerSettings()).toEqual({ sound: true, vibration: true });
  });
});
