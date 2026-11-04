// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { HomeV2 } from "./HomeV2";
import { FinishV2 } from "./FinishV2";
import { ProgressV2 } from "./ProgressV2";
import { YouV2, EditProfile } from "./YouV2";
import { FALLBACK_PROFILE } from "@/lib/v2/profile";
import { getTimerSettings, resetTimerSettingsForTests } from "@/lib/timer/settings";
import type { CatalogueItem, Overview } from "@/lib/v2/achievements";
import type { TodayResponse, TrainingDay } from "@/lib/training/types";
import type { RunState } from "@/lib/training/run";
import type { Summary } from "@/components/training/TrainingFlow";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const ex = (i: number, name: string) => ({ planExerciseId: i, exerciseId: i, name, muscleGroup: "x", equipment: [], sets: 3, reps: "8-10", repMin: 8, repMax: 10, rir: 2, restText: "90 s", weightStepKg: 2, showWeight: true, howTo: null, note: null, videoUrl: null, imageUrl: null, previous: [], record: null, history: [] });
const DAY = (over: Partial<TrainingDay> = {}): TrainingDay => ({
  planDayId: 1, weekday: "Wtorek", position: { index: 2, total: 3 }, name: "Góra ciała", estimatedMinutes: 50, exerciseCount: 5, equipment: [], trainerNote: null,
  exercises: [ex(1, "Wyciskanie hantli leżąc"), ex(2, "Wiosłowanie hantlem"), ex(3, "Wyciskanie nad głowę"), ex(4, "Biceps"), ex(5, "Triceps")],
  warmup: [{ name: "Krążenia", detail: "10", description: "x" }], cooldown: [], activeSession: null, ...over,
} as TrainingDay);
const TODAY = (over: Partial<TodayResponse> = {}): TodayResponse => ({ client: { firstName: "Anna" }, plan: { id: 1, title: "P" }, week: { done: 1, target: 3 }, lastSession: null, today: DAY(), next: null, ...over });

beforeEach(() => { window.localStorage.clear(); window.HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubToday(res: Response | (() => Response)) {
  vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/training/today") ? (typeof res === "function" ? res() : res) : u.includes("/client-portal/steps") ? json({ today: "2026-11-03", goal: 8000, todaySteps: 5400, todayPercent: 67, days: [], average: 0, daysAtGoal: 0, averagePercent: 0 }) : json({}, 404))));
}
const HOME = { profile: { ...FALLBACK_PROFILE("Anna"), nick: "ShiiFuu" }, reloadKey: 0, streakWeeks: 4 as number | null, achievements: [] as CatalogueItem[], onStart: vi.fn(), onRamp: vi.fn(), onOpenYou: vi.fn() };

describe("Dziś (v2)", () => {
  it("podopieczny z planem: powitanie z nickiem, seria, X z Y, ciemna karta z 3 ćwiczeniami i „+ 2 ćwiczenia”, start", async () => {
    stubToday(json(TODAY()));
    const onStart = vi.fn();
    render(<HomeV2 {...HOME} onStart={onStart} />);
    expect((await screen.findByTestId("home-greeting")).textContent).toBe("Cześć, ShiiFuu!");
    expect(screen.getByTestId("streak-title").textContent).toBe("4 tygodnie z rzędu");
    expect(screen.getByTestId("streak-sub").textContent).toBe("W tym tygodniu: 1 z 3 treningów");
    expect(screen.getByLabelText("Treningi w tym tygodniu").children).toHaveLength(3);
    const card = screen.getByTestId("home-training");
    expect(card.textContent).toContain("TRENING NA DZIŚ · 2 Z 3");
    expect(card.textContent).toContain("Wyciskanie nad głowę");
    expect(card.textContent).not.toContain("Biceps");
    expect(card.textContent).toContain("+ 2 ćwiczenia");
    expect(card.textContent).toContain("najpierw rozgrzewka");
    fireEvent.click(screen.getByRole("button", { name: /Zacznij trening/ }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
  it("seria 0 → „Zacznij swoją serię” (bez negatywnych słów)", async () => {
    stubToday(json(TODAY({ week: { done: 0, target: 2 } })));
    render(<HomeV2 {...HOME} streakWeeks={null} />);
    expect((await screen.findByTestId("streak-title")).textContent).toBe("Zacznij swoją serię");
    expect(document.body.textContent).not.toMatch(/strac|utrac|przerw|zawied/i);
  });
  it("dzień odpoczynku: „Dziś odpoczynek” + następny trening", async () => {
    stubToday(json(TODAY({ today: null, next: DAY({ name: "Dół ciała" }) })));
    render(<HomeV2 {...HOME} />);
    const rest = await screen.findByTestId("home-rest");
    expect(rest.textContent).toContain("Dziś odpoczynek"); expect(rest.textContent).toContain("Dół ciała");
    expect(screen.queryByTestId("home-training")).toBeNull();
  });
  it("brak planu: „Trener przygotowuje Twój plan”", async () => {
    stubToday(json({}, 404));
    render(<HomeV2 {...HOME} />);
    expect((await screen.findByTestId("home-no-plan")).textContent).toContain("Trener przygotowuje Twój plan");
  });
  it("bez nicka: powitanie z imieniem; następne osiągnięcie z paskiem; „Wróć do treningu” przy trwającym", async () => {
    stubToday(json(TODAY({ today: DAY({ activeSession: { id: 5, sets: [], pain: [] } }) })));
    const next: CatalogueItem = { id: "milestone:10", kind: "milestone", title: "10 treningów", hint: "", state: "progress", progress: { value: 8, target: 10 }, earnedAt: null, seen: true };
    render(<HomeV2 {...HOME} profile={FALLBACK_PROFILE("Anna")} achievements={[next]} />);
    expect((await screen.findByTestId("home-greeting")).textContent).toBe("Cześć, Anna!");
    expect(screen.getByTestId("next-achievement").textContent).toContain("8/10");
    expect(screen.getByRole("button", { name: /Wróć do treningu/ })).toBeTruthy();
  });
  it("linia kroków i awatar jako przycisk do „Ty” (44 px)", async () => {
    stubToday(json(TODAY()));
    const onOpenYou = vi.fn();
    render(<HomeV2 {...HOME} onOpenYou={onOpenYou} />);
    await screen.findByTestId("home-training");
    expect(screen.getByTestId("steps-line").textContent).toContain("Kroki: 5 400 / 8 000");
    const btn = screen.getByRole("button", { name: "Twój profil" });
    expect(btn.className).toContain("h-11"); expect(btn.className).toContain("w-11");
    fireEvent.click(btn); expect(onOpenYou).toHaveBeenCalled();
  });
});

const RUN = { rating: null, note: "", painAreas: [] } as unknown as RunState;
const SUM: Summary = { minutes: 48, sets: 15, kg: 3240, reps: 130, hadPain: false, weekDone: 2, weekTarget: 3, records: [{ name: "Wyciskanie hantli leżąc", weightKg: 24, reps: 8, gainKg: 2 }] };
describe("Koniec treningu (v2)", () => {
  it("podsumowanie: ✓, 3 kafelki (czas, serie, kg), rekord, ocena, story i „Gotowe”", () => {
    const onFinish = vi.fn(); const onFeedback = vi.fn();
    render(<FinishV2 day={DAY()} run={RUN} sum={SUM} v2={{ streakWeeks: 4, nick: "x" }} onFeedback={onFeedback} onFinish={onFinish} />);
    expect(screen.getByRole("heading", { name: "Trening zrobiony!" })).toBeTruthy();
    expect(screen.getByText("Góra ciała · 2 z 3 w tym tygodniu")).toBeTruthy();
    expect(screen.getByText("48 min")).toBeTruthy(); expect(screen.getByText("15")).toBeTruthy(); expect(screen.getByText("3 240")).toBeTruthy();
    expect(screen.getByLabelText("Nowy rekord").textContent).toContain("24 kg × 8");
    fireEvent.click(screen.getByRole("radio", { name: "W sam raz" }));
    expect(onFeedback).toHaveBeenCalledWith("just_right", "");
    expect(screen.getByRole("button", { name: /Udostępnij na story/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gotowe" }));
    expect(onFinish).toHaveBeenCalled();
  });
  it("po zgłoszeniu bólu: zwykłe podsumowanie, bez rekordu", () => {
    render(<FinishV2 day={DAY()} run={RUN} sum={{ ...SUM, hadPain: true }} v2={{ streakWeeks: 4, nick: null }} onFeedback={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.queryByLabelText("Nowy rekord")).toBeNull();
    expect(screen.getByText("Trening zrobiony!")).toBeTruthy();
  });
  it("ćwiczenia bez ciężaru: zamiast kg są powtórzenia", () => {
    render(<FinishV2 day={DAY()} run={RUN} sum={{ ...SUM, kg: 0, records: [] }} v2={{ streakWeeks: null, nick: null }} onFeedback={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.queryByText("kg łącznie")).toBeNull();
    expect(screen.getByText("powtórzeń")).toBeTruthy();
  });
});

const ITEM = (id: string, state: CatalogueItem["state"], extra: Partial<CatalogueItem> = {}): CatalogueItem => ({ id, kind: "milestone", title: id, hint: `jak zdobyć ${id}`, state, progress: null, earnedAt: state === "earned" ? "2026-11-01T10:00:00.000Z" : null, seen: true, ...extra });
describe("Postępy (v2)", () => {
  const overview: Overview = {
    streakWeeks: 4, sessionCount: 8, recordCount: 5, earnedCount: 2, total: 12,
    items: [ITEM("A", "earned"), ITEM("B", "earned"), ITEM("C", "progress", { progress: { value: 8, target: 10 } }), ...Array.from({ length: 9 }, (_, i) => ITEM(`L${i}`, "locked"))],
  };
  it("3 kafelki, „X z Y”, siatka 9 (zdobyte → w toku → zablokowane), „Zobacz wszystkie” pokazuje opisy", () => {
    render(<ProgressV2 overview={overview} records={[]} activityDays={[]} today="2026-11-03" />);
    expect(screen.getByTestId("progress-tiles").textContent).toBe("8treningów4tyg. z rzędu5rekordów");
    expect(screen.getByTestId("ach-count").textContent).toBe("2 z 12");
    const cells = screen.getByTestId("ach-grid").children;
    expect(cells).toHaveLength(9);
    expect([...cells].map((c) => c.getAttribute("data-state")).slice(0, 4)).toEqual(["earned", "earned", "progress", "locked"]);
    expect(screen.getByText("8/10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zobacz wszystkie (12)" }));
    expect(screen.getByTestId("ach-list").children).toHaveLength(12);
    expect(screen.getByText("jak zdobyć L3")).toBeTruthy();
  });
  it("nowe konto (same zablokowane): bez błędów, bez słów o utracie", () => {
    render(<ProgressV2 overview={{ streakWeeks: null, sessionCount: 0, recordCount: 0, earnedCount: 0, total: 3, items: [ITEM("x", "locked")] }} records={[]} activityDays={[]} today="2026-11-03" />);
    expect(screen.getByTestId("progress-tiles").textContent).toBe("0treningów0tyg. z rzędu0rekordów");
    expect(document.body.textContent).not.toMatch(/strac|utrac|przepad/i);
  });
  it("bez osiągnięć (flaga wyłączona): bez kafelków i siatki", () => {
    render(<ProgressV2 overview={null} records={[]} activityDays={[]} today="2026-11-03" steps={<p>kroki</p>} />);
    expect(screen.queryByTestId("progress-tiles")).toBeNull(); expect(screen.getByText("kroki")).toBeTruthy();
  });
});

describe("Ty (v2) i edycja profilu", () => {
  const base = { featured: [ITEM("A", "earned")], trainerRow: <p>trener</p>, applyRow: <p>prowadzę</p>, appearance: <p>motyw</p>, privacy: <p>zgody</p>, legal: <a href="#">Regulamin</a>, onEdited: vi.fn(), onAllAchievements: vi.fn(), onSignOut: vi.fn() };
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => json({ goal: 8000, today: "2026-11-03", todaySteps: 0, todayPercent: 0, days: [], average: 0, daysAtGoal: 0, averagePercent: 0 }))); });
  it("nick i „trenuje od …”; bez nicka tylko miesiąc; wyróżnione osiągnięcia; wylogowanie", () => {
    const { rerender } = render(<YouV2 {...base} profile={{ ...FALLBACK_PROFILE("Anna"), nick: "shiifuu", trainsSince: "2026-10" }} />);
    expect(screen.getByTestId("you-name").textContent).toBe("shiifuu");
    expect(screen.getByTestId("you-sub").textContent).toBe("@shiifuu · trenuje od października");
    expect(screen.getByTestId("featured").children).toHaveLength(1);
    rerender(<YouV2 {...base} profile={{ ...FALLBACK_PROFILE("Anna"), trainsSince: "2026-10" }} />);
    expect(screen.getByTestId("you-sub").textContent).toBe("trenuje od października");
    fireEvent.click(screen.getByRole("button", { name: /Wyloguj się/ }));
    expect(base.onSignOut).toHaveBeenCalled();
  });
  it("odznaka „Trener” przy nicku tylko dla konta trenera", () => {
    const { rerender } = render(<YouV2 {...base} profile={{ ...FALLBACK_PROFILE("Anna"), nick: "ola", isTrainer: true }} />);
    expect(screen.getByTestId("trainer-badge").textContent).toBe("Trener");
    rerender(<YouV2 {...base} profile={{ ...FALLBACK_PROFILE("Anna"), nick: "ola", isTrainer: false }} />);
    expect(screen.queryByTestId("trainer-badge")).toBeNull();
  });
  it("edycja: przy zablokowanej zmianie nick jest tylko do odczytu z datą, a zapis nie wysyła nicka (nazwa i kolor dalej się zapisują)", async () => {
    const until = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    render(<EditProfile profile={{ ...FALLBACK_PROFILE("Anna"), nick: "ola_k", nickChangeAvailableAt: until }} onSaved={onSaved} onCancel={vi.fn()} />);
    expect((screen.getByLabelText(/Nick/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("nick-hint").textContent).toContain("Nick możesz zmienić ponownie");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).not.toHaveProperty("nick");
  });
  it("edycja: odblokowana — podpowiedź o zasadach (raz na 30 dni, stary nick zablokowany 30 dni)", () => {
    render(<EditProfile profile={FALLBACK_PROFILE("Anna")} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByLabelText(/Nick/) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByTestId("nick-hint").textContent).toContain("raz na 30 dni");
  });
  it("„Złoty Byczek” w profilu: odznaka z numerem tylko gdy jest; bez niej nic", () => {
    const { rerender } = render(<YouV2 {...base} profile={{ ...FALLBACK_PROFILE("Anna"), goldenBull: 12 }} />);
    expect(screen.getByTestId("golden-bull").textContent).toContain("Złoty Byczek #12");
    expect(screen.getByTestId("golden-bull-badge")).toBeTruthy();
    rerender(<YouV2 {...base} profile={{ ...FALLBACK_PROFILE("Anna"), goldenBull: null }} />);
    expect(screen.queryByTestId("golden-bull")).toBeNull();
  });
  it("stoper w „Ty”: dźwięk i wibracja domyślnie włączone; wyłączenie dźwięku zapisuje ustawienie (to samo co przycisk głośnika)", () => {
    resetTimerSettingsForTests();
    render(<YouV2 {...base} profile={FALLBACK_PROFILE("Anna")} />);
    fireEvent.click(screen.getByText("Stoper przerw"));
    const sound = screen.getByRole("switch", { name: "Dźwięk stopera" }) as HTMLInputElement;
    const vib = screen.getByRole("switch", { name: "Wibracja" }) as HTMLInputElement;
    expect(sound.checked).toBe(true); expect(vib.checked).toBe(true);
    fireEvent.click(sound);
    expect(getTimerSettings()).toEqual({ sound: false, vibration: true });
    resetTimerSettingsForTests();
  });
  it("edycja: 6 kolorów, błąd „nick zajęty” z serwera, zapis wywołuje onSaved", async () => {
    const onSaved = vi.fn();
    const p = FALLBACK_PROFILE("Anna");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ error: "Ten nick jest zajęty." }, 409))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<EditProfile profile={p} onSaved={onSaved} onCancel={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Kolor awatara" }).children).toHaveLength(6);
    fireEvent.change(screen.getByLabelText(/Nick/), { target: { value: "zajety" } });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Ten nick jest zajęty.");
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Nick/), { target: { value: "wolny_nick" } });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[1]![1] as RequestInit).body))).toMatchObject({ nick: "wolny_nick" });
  });
});
