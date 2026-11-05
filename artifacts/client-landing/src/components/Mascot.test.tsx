// @vitest-environment happy-dom
/** Mapa animacji byczka: każde zdarzenie ma stan, każdy z 19 stanów ma zdarzenie, stany nie są użyte poza mapą; „raz”, zawieszenie w trakcie serii, offline vs błąd, miejsca w aplikacji. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  MASCOT_EVENTS, MASKOTKA_STANY, MascotHost, MascotEvent, ErrorState, showMascot, hideMascot, currentMascot, useMascotSuppressed, wasShown,
  setBrandV1ForTests, resetBrandV1ForTests, resetMascotForTests, type MascotEventId,
} from "@workspace/design-tokens/brand";
import { OfflineBanner } from "./OfflineBanner";
import { RampFlow } from "./training/RampFlow";
import { RestTimer } from "./timer/RestTimer";
import { HomeV2 } from "./v2/HomeV2";
import { startRest } from "@/lib/timer/rest";
import { FALLBACK_PROFILE } from "@/lib/v2/profile";
import type { RampItem } from "@/lib/training/types";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
beforeEach(() => { resetBrandV1ForTests(); resetMascotForTests(); window.localStorage.clear(); vi.stubGlobal("fetch", vi.fn(async () => json({}, 404))); window.HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const on = () => act(() => setBrandV1ForTests(true));

describe("mapa animacji (events)", () => {
  const ids = Object.keys(MASCOT_EVENTS) as MascotEventId[];
  it("każde zdarzenie ma prawidłowy stan (i stan po przejściu), czas i miejsce użycia", () => {
    for (const id of ids) {
      const d = MASCOT_EVENTS[id] as { stan: string; then?: { stan: string; afterMs: number }; ms: number | null; where: string };
      expect(MASKOTKA_STANY as readonly string[], id).toContain(d.stan);
      if (d.then) { expect(MASKOTKA_STANY as readonly string[], id).toContain(d.then.stan); expect(d.then.afterMs).toBeGreaterThan(0); }
      expect(d.ms === null || d.ms > 0, id).toBe(true);
      expect(d.where.length, id).toBeGreaterThan(5);
    }
  });
  it("każdy z 19 stanów ma co najmniej jedno zdarzenie", () => {
    const used = new Set<string>();
    for (const id of ids) { const d = MASCOT_EVENTS[id] as { stan: string; then?: { stan: string } }; used.add(d.stan); if (d.then) used.add(d.then.stan); }
    expect(MASKOTKA_STANY).toHaveLength(19);
    for (const s of MASKOTKA_STANY) expect(used.has(s), `stan bez zdarzenia: ${s}`).toBe(true);
  });
  it("żaden stan nie jest używany poza mapą: tylko Maskotka, events i strony podglądu wybierają stan", () => {
    const roots = [join(__dirname, ".."), join(__dirname, "../../../../lib/design-tokens/src/brand"), join(__dirname, "../../../trainer-app/src")];
    const allowed = [/design-tokens\/src\/brand\/(Maskotka|events)\.tsx$/, /pages\/(brand|ux-v2)-preview\.tsx$/, /\.test\.tsx?$/];
    const offenders: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (f !== "node_modules") walk(p); } else if (/\.tsx?$/.test(f) && !allowed.some((r) => r.test(p))) { const src = readFileSync(p, "utf8"); if (/<Maskotka\b[^>]*\bstan=/.test(src) || /<Maskotka\b/.test(src)) offenders.push(p.replace(/.*trainer-panel\//, "")); } } };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
  it("teksty są spokojne: bez „straciłeś”, bez zawstydzania i bez języka medycznego; care i streak_ended mają swój tekst", () => {
    const texts = ids.map((i) => (MASCOT_EVENTS[i] as { text?: string }).text).filter(Boolean).join(" ").toLowerCase();
    expect(texts).not.toMatch(/straci|przegra|zawied|wstyd|leń|diagnoz|uraz|kontuzj|choroba/);
    expect((MASCOT_EVENTS.pain_report as { text: string }).text).toBe("Przerwij to ćwiczenie, jeśli boli");
    expect((MASCOT_EVENTS.streak_ended as { text: string }).text).toBe("Seria się skończyła. Zapal ją od nowa w tym tygodniu.");
    expect((MASCOT_EVENTS.offline as { text: string }).text).toBe("Brak internetu. Trening zapisze się, gdy wróci zasięg.");
    expect((MASCOT_EVENTS.long_break_return as { text: string }).text).toContain("plan na Ciebie czeka");
  });
  it("strzałki: wave → idle, sleep → wave; brak WAKEUP i GOLDFLIP", () => {
    expect((MASCOT_EVENTS.first_login as { then: { stan: string } }).then.stan).toBe("idle");
    expect((MASCOT_EVENTS.long_break_return as { then: { stan: string } }).then.stan).toBe("wave");
    expect(MASKOTKA_STANY as readonly string[]).not.toContain("wakeup"); expect(MASKOTKA_STANY as readonly string[]).not.toContain("goldflip");
    expect(MASCOT_EVENTS.gold_bull.stan).toBe("levelup");
  });
});

describe("pokazywanie: jedno naraz, „raz”, zawieszenie w trakcie serii", () => {
  it("showMascot pokazuje zdarzenie w hoście, znika po czasie i po dotknięciu; jedno naraz (nowe zastępuje poprzednie)", () => {
    vi.useFakeTimers();
    render(<MascotHost />);
    act(() => { showMascot("set_pr"); });
    expect(screen.getByTestId("mascot-host").getAttribute("data-event")).toBe("set_pr");
    expect(screen.getAllByTestId("mascot-host")).toHaveLength(1);
    act(() => { showMascot("workout_done"); });
    expect(screen.getAllByTestId("mascot-host")).toHaveLength(1);
    expect(screen.getByTestId("mascot-host").getAttribute("data-event")).toBe("workout_done");
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.queryByTestId("mascot-host")).toBeNull();
    act(() => { showMascot("set_pr"); });
    fireEvent.click(screen.getByRole("button", { name: "Zamknij animację" }));
    expect(screen.queryByTestId("mascot-host")).toBeNull();
    expect(currentMascot()).toBeNull();
  });
  it("zdarzenia „raz” pokazują się raz na klucz i nie wracają po odświeżeniu (pamięć)", () => {
    render(<MascotHost />);
    expect(showMascot("streak_ended", "end-3")).toBe(true);
    expect(wasShown("streak_ended", "end-3")).toBe(true);
    act(() => hideMascot());
    expect(showMascot("streak_ended", "end-3")).toBe(false); // to samo zakończenie serii — drugi raz nie
    expect(showMascot("streak_ended", "end-5")).toBe(true); // inna seria
  });
  it("w trakcie wykonywania serii nic się nie pokazuje; po zapisaniu serii (zawieszenie zdjęte) wolno", () => {
    function SetScreenLike({ inSet }: { inSet: boolean }) { useMascotSuppressed(inSet); return null; }
    render(<MascotHost />);
    const { rerender } = render(<SetScreenLike inSet />);
    let shown = true; act(() => { shown = showMascot("workout_done"); });
    expect(shown).toBe(false);
    expect(screen.queryByTestId("mascot-host")).toBeNull();
    rerender(<SetScreenLike inSet={false} />);
    act(() => { shown = showMascot("workout_done"); });
    expect(shown).toBe(true);
    expect(screen.getByTestId("mascot-host")).toBeTruthy();
  });
  it("sekwencja w zdarzeniu: wave → idle po czasie z mapy", () => {
    vi.useFakeTimers();
    render(<MascotEvent event="first_login" />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("wave");
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("idle");
  });
  it("krótkie zdarzenie przy ekranie (koniec treningu ok. 2 s) uspokaja się do idle zamiast skakać w nieskończoność", () => {
    vi.useFakeTimers();
    render(<MascotEvent event="workout_done" />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("success");
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("idle");
  });
});

describe("offline osobno od błędu", () => {
  it("ErrorState: brak sieci → zdarzenie offline z tekstem o zapisie po powrocie zasięgu; błąd aplikacji → app_error z tytułem", () => {
    render(<ErrorState title="Coś poszło nie tak" message="Spróbuj za chwilę." offline />);
    expect(screen.getByTestId("mascot-event").getAttribute("data-event")).toBe("offline");
    expect(screen.getByTestId("mascot-text").textContent).toBe("Brak internetu. Trening zapisze się, gdy wróci zasięg.");
    expect(screen.queryByText("Coś poszło nie tak")).toBeNull();
    cleanup();
    render(<ErrorState title="Coś poszło nie tak" message="Spróbuj za chwilę." offline={false} onRetry={vi.fn()} />);
    expect(screen.getByTestId("mascot-event").getAttribute("data-event")).toBe("app_error");
    expect(screen.getByText("Coś poszło nie tak")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeTruthy();
  });
  it("baner offline pojawia się po utracie sieci (tylko z flagą marki) i znika po jej powrocie", () => {
    render(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    on();
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByTestId("offline-banner").textContent).toContain("Brak internetu");
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("offline");
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });
  it("bez flagi marki baner offline się nie pokazuje (portal jak dziś)", () => {
    render(<OfflineBanner />);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.queryByTestId("offline-banner")).toBeNull();
    act(() => { window.dispatchEvent(new Event("online")); });
  });
});

describe("miejsca w aplikacji", () => {
  const items: RampItem[] = [{ name: "Pajacyki", detail: "30 s", description: "x" }];
  it("rozgrzewka: pajacyki (warmup_screen); schłodzenie: rozciąganie nóg (cooldown_screen); bez flagi nic", () => {
    const { unmount } = render(<RampFlow kind="warmup" planDayId={1} items={items} onExit={vi.fn()} />);
    expect(screen.queryByTestId("mascot-event")).toBeNull();
    unmount(); on();
    const w = render(<RampFlow kind="warmup" planDayId={1} items={items} onExit={vi.fn()} />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("warmup");
    w.unmount();
    render(<RampFlow kind="cooldown" planDayId={1} items={items} onExit={vi.fn()} />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("stretch");
  });
  it("przerwa: siedzi na ławce (rest); po rekordzie przez 1,5 s prezentuje mięśnie (flex), potem wraca do rest", () => {
    vi.useFakeTimers(); on();
    render(<RestTimer state={startRest(90, "Seria 2 z 3")} counter={1} pr onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("flex");
    act(() => { vi.advanceTimersByTime(1600); });
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("rest");
    cleanup();
    render(<RestTimer state={startRest(90, "Seria 2 z 3")} counter={1} onChange={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("maskotka").getAttribute("data-stan")).toBe("rest");
  });

  describe("ekran „Dziś”", () => {
    const day = { planDayId: 1, weekday: "Wtorek", position: { index: 1, total: 3 }, name: "Góra ciała", estimatedMinutes: 50, exerciseCount: 1, equipment: [], trainerNote: null, exercises: [{ planExerciseId: 1, exerciseId: 1, name: "Wyciskanie", muscleGroup: "x", equipment: [], sets: 3, reps: "8", repMin: 8, repMax: 8, rir: 2, restText: "90 s", weightStepKg: 2, showWeight: true, howTo: null, note: null, videoUrl: null, imageUrl: null, previous: [], record: null, history: [] }], warmup: [], cooldown: [], activeSession: null };
    const today = (lastDaysAgo: number | null) => ({ client: { firstName: "Anna" }, plan: { id: 1, title: "P" }, week: { done: 0, target: 3 }, lastSession: lastDaysAgo == null ? null : { id: 9, completedAt: new Date(Date.now() - lastDaysAgo * 86_400_000).toISOString(), dayName: "A" }, today: day, next: null });
    const stub = (t: unknown) => vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/training/today") ? json(t) : u.includes("/client-portal/steps") ? json({ today: "2026-11-05", goal: 8000, todaySteps: 0, todayPercent: 0, days: [], average: 0, daysAtGoal: 0, averagePercent: 0 }) : json({}, 404))));
    const base = { profile: FALLBACK_PROFILE("Anna"), reloadKey: 0, achievements: [], onRamp: vi.fn(), onOpenYou: vi.fn() };

    it("długa przerwa (14+ dni): klient widzi śpiącego byczka z łagodnym tekstem; „Wracam” budzi go (wave) i karta znika; raz dziennie", async () => {
      stub(today(20)); on();
      render(<HomeV2 {...base} streakWeeks={null} onStart={vi.fn()} />);
      const card = await screen.findByTestId("long-break");
      expect(card.textContent).toContain("Wróć, kiedy zechcesz — plan na Ciebie czeka");
      expect(card.textContent).not.toMatch(/straci|wstyd|zawied/i);
      expect(screen.getAllByTestId("maskotka").some((m) => m.getAttribute("data-stan") === "sleep")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Wracam" }));
      expect(screen.queryByTestId("long-break")).toBeNull();
      cleanup(); stub(today(20));
      render(<HomeV2 {...base} streakWeeks={null} onStart={vi.fn()} />);
      await screen.findByTestId("home-training");
      expect(screen.queryByTestId("long-break")).toBeNull(); // tego samego dnia nie wraca
    });
    it("krótka przerwa: bez karty „długa przerwa”", async () => {
      stub(today(3)); on();
      render(<HomeV2 {...base} streakWeeks={null} onStart={vi.fn()} />);
      await screen.findByTestId("home-training");
      expect(screen.queryByTestId("long-break")).toBeNull();
    });
    it("„Zaczynamy”: byczek podnosi sztangę ok. 1,5 s (raz dziennie), potem trening startuje; dotknięcie pomija; drugi raz tego dnia od razu", async () => {
      stub(today(1)); on();
      const onStart = vi.fn();
      render(<HomeV2 {...base} streakWeeks={null} onStart={onStart} />);
      await screen.findByTestId("home-training");
      vi.useFakeTimers();
      fireEvent.click(screen.getByRole("button", { name: /Zacznij trening/ }));
      expect(screen.getByTestId("start-overlay")).toBeTruthy();
      expect(within(screen.getByTestId("start-overlay")).getByTestId("maskotka").getAttribute("data-stan")).toBe("lift");
      expect(onStart).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1600); });
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("start-overlay")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Zacznij trening/ }));
      expect(onStart).toHaveBeenCalledTimes(2); // drugi raz tego dnia: bez animacji
    });
    it("seria: nowa seria raz (streakstart), trwająca seria spokojnie (streak), koniec serii raz ze spokojnym tekstem (streakout); bez flagi nic", async () => {
      stub(today(1)); on();
      const { rerender } = render(<><MascotHost /><HomeV2 {...base} streakWeeks={1} streakLoaded onStart={vi.fn()} /></>);
      await screen.findByTestId("home-training");
      expect(screen.getByTestId("mascot-host").getAttribute("data-event")).toBe("streak_started");
      expect(screen.getByTestId("streak-mascot").querySelector(".s-streak")).toBeTruthy(); // karta serii: spokojny byczek z pochodnią
      act(() => hideMascot());
      rerender(<><MascotHost /><HomeV2 {...base} streakWeeks={4} streakLoaded onStart={vi.fn()} /></>);
      expect(screen.queryByTestId("mascot-host")).toBeNull(); // trwająca seria nie wywołuje animacji nad ekranem
      rerender(<><MascotHost /><HomeV2 {...base} streakWeeks={null} streakLoaded onStart={vi.fn()} /></>);
      expect(screen.getByTestId("mascot-host").getAttribute("data-event")).toBe("streak_ended");
      expect(screen.getByTestId("mascot-host").textContent).toContain("Seria się skończyła. Zapal ją od nowa w tym tygodniu.");
      expect(screen.getByTestId("mascot-host").textContent).not.toMatch(/straci/i);
      act(() => hideMascot());
      rerender(<><MascotHost /><HomeV2 {...base} streakWeeks={null} streakLoaded onStart={vi.fn()} /></>);
      expect(screen.queryByTestId("mascot-host")).toBeNull(); // koniec serii pokazany RAZ
    });
    it("bez flagi marki: żadnych animacji nad ekranem (strumień, seria, start)", async () => {
      stub(today(20));
      render(<><MascotHost /><HomeV2 {...base} streakWeeks={1} streakLoaded onStart={vi.fn()} /></>);
      await screen.findByTestId("home-training");
      expect(screen.queryByTestId("mascot-host")).toBeNull();
      expect(screen.queryByTestId("long-break")).toBeNull();
    });
    it("Złoty Byczek: levelup raz przy przyznaniu", async () => {
      stub(today(1)); on();
      render(<><MascotHost /><HomeV2 {...base} streakWeeks={null} goldenBull={7} onStart={vi.fn()} /></>);
      await screen.findByTestId("home-training");
      expect(screen.getByTestId("mascot-host").getAttribute("data-event")).toBe("gold_bull");
      expect(within(screen.getByTestId("mascot-host")).getByTestId("maskotka").getAttribute("data-stan")).toBe("levelup");
    });
  });
});
