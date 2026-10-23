// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import { SetScreen } from "./SetScreen";
import { PainSheet, PAIN_NOTICE } from "./PainSheet";
import { TrainingFlow } from "./TrainingFlow";
import { resetTrainingQueueForTests } from "@/lib/training/sync";
import type { ExerciseInfo, TrainingDay } from "@/lib/training/types";

afterEach(cleanup);

const ex = (over: Partial<ExerciseInfo> = {}): ExerciseInfo => ({
  planExerciseId: 11, exerciseId: 5, name: "Wyciskanie sztangi", muscleGroup: "Klatka piersiowa", equipment: ["Sztanga"], sets: 3, reps: "8–10",
  repMin: 8, repMax: 10, rir: 2, restText: "2 min–3 min", weightStepKg: 2.5, showWeight: true, howTo: "Opuść sztangę do klatki.", note: null,
  videoUrl: null, imageUrl: null,
  previous: [{ setNumber: 1, weightKg: 60, reps: 8, rir: 2 }, { setNumber: 2, weightKg: 60, reps: 8, rir: 2 }],
  record: { weightKg: 70, reps: 5 }, history: [{ weightKg: 70, reps: 5 }, { weightKg: 60, reps: 8 }], ...over,
});

const screenProps = (e: ExerciseInfo, onSave = vi.fn()) => ({
  ex: e, index: 0, total: 3, sets: undefined, skipped: false, onSave,
  onPrev: vi.fn(), onNext: vi.fn(), onOpenList: vi.fn(), onPain: vi.fn(),
});

describe("SetScreen", () => {
  it("shows target, record, previous result and starts from the previous session", () => {
    render(<SetScreen {...screenProps(ex())} />);
    expect(screen.getByText("Ćwiczenie 1 z 3")).toBeTruthy();
    expect(screen.getByText(/3 × 8–10 · RIR 2 · przerwa ok\. 2 min–3 min/)).toBeTruthy();
    expect(screen.getByText("70 kg × 5")).toBeTruthy(); // record
    expect(screen.getAllByText("60 kg × 8").length).toBeGreaterThan(0); // "Poprzednio"
    expect((screen.getByLabelText("Ciężar") as HTMLInputElement).value).toBe("60");
    expect((screen.getByLabelText("Powtórzenia") as HTMLInputElement).value).toBe("8");
    expect(screen.queryByText(/stoper|minutnik.*start/i)).toBeNull();
  });
  it("+ / − use the equipment step; exact value can be typed (comma ok)", () => {
    const onSave = vi.fn();
    render(<SetScreen {...screenProps(ex(), onSave)} />);
    fireEvent.click(screen.getByLabelText("Ciężar: więcej"));
    expect((screen.getByLabelText("Ciężar") as HTMLInputElement).value).toBe("62,5");
    const w = screen.getByLabelText("Ciężar");
    fireEvent.change(w, { target: { value: "67,5" } }); fireEvent.blur(w);
    fireEvent.click(screen.getByLabelText("Powtórzenia: więcej"));
    fireEvent.click(screen.getByRole("radio", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Zapisz serię" }));
    expect(onSave).toHaveBeenCalledWith(1, { weightKg: 67.5, reps: 9, rir: 1 });
  });
  it("dumbbells step by 1 kg", () => {
    render(<SetScreen {...screenProps(ex({ equipment: ["Hantle"], weightStepKg: 1, previous: [] }))} />);
    fireEvent.click(screen.getByLabelText("Ciężar: więcej"));
    expect((screen.getByLabelText("Ciężar") as HTMLInputElement).value).toBe("1");
  });
  it("bodyweight exercise: no weight field, optional extra load only on request", () => {
    const onSave = vi.fn();
    render(<SetScreen {...screenProps(ex({ showWeight: false, weightStepKg: null, previous: [] }), onSave)} />);
    expect(screen.queryByLabelText("Ciężar")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Zapisz serię" }));
    expect(onSave).toHaveBeenCalledWith(1, { weightKg: null, reps: 8, rir: null });
    fireEvent.click(screen.getByText(/Dodatkowe obciążenie/));
    expect(screen.getByLabelText("Dodatkowe obciążenie")).toBeTruthy();
  });
  it("RIR is a radiogroup 0–4+", () => {
    render(<SetScreen {...screenProps(ex())} />);
    const g = screen.getByRole("radiogroup", { name: /RIR/ });
    expect(within(g).getAllByRole("radio").map((r) => r.textContent)).toEqual(["0", "1", "2", "3", "4+"]);
  });
  it("saved sets can be corrected, and the next exercise is offered after the last set", () => {
    const onSave = vi.fn(); const onNext = vi.fn();
    const sets = { 1: { weightKg: 60, reps: 8, rir: 2 }, 2: { weightKg: 60, reps: 8, rir: 2 }, 3: { weightKg: 60, reps: 7, rir: 1 } };
    render(<SetScreen {...screenProps(ex(), onSave)} sets={sets} onNext={onNext} />);
    fireEvent.click(screen.getByRole("button", { name: "Następne ćwiczenie" }));
    expect(onNext).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Popraw serię 3/));
    fireEvent.click(screen.getByLabelText("Powtórzenia: więcej"));
    fireEvent.click(screen.getByRole("button", { name: "Zapisz zmianę" }));
    expect(onSave).toHaveBeenCalledWith(3, { weightKg: 60, reps: 8, rir: 1 });
  });
  it("touch targets: stepper buttons are 48 px", () => {
    render(<SetScreen {...screenProps(ex())} />);
    expect(screen.getByLabelText("Ciężar: więcej").className).toContain("h-12");
  });
});

describe("PainSheet", () => {
  it("is a dialog with the fixed notice; submit needs area and severity", () => {
    const onSubmit = vi.fn();
    render(<PainSheet exerciseName="Przysiad" onCancel={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole("dialog", { name: "Coś boli?" })).toBeTruthy();
    expect(screen.getByText(PAIN_NOTICE)).toBeTruthy();
    const send = screen.getByRole("button", { name: "Wyślij i pomiń ćwiczenie" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Plecy — dół" }));
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    fireEvent.change(screen.getByLabelText(/Kilka słów/), { target: { value: " pobolewa " } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSubmit).toHaveBeenCalledWith({ area: "Plecy — dół", severity: 3, description: "pobolewa" });
  });
  it("lists exactly the fixed areas, Escape and Anuluj close it, text limited to 500", () => {
    const onCancel = vi.fn();
    render(<PainSheet exerciseName="X" onCancel={onCancel} onSubmit={vi.fn()} />);
    const g = screen.getByRole("radiogroup", { name: /Gdzie/ });
    expect(within(g).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Kolano", "Biodro", "Plecy — dół", "Bark", "Łokieć", "Nadgarstek", "Inne"]);
    expect((screen.getByLabelText(/Kilka słów/) as HTMLTextAreaElement).maxLength).toBe(500);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
  it("uses no diagnostic wording", () => {
    render(<PainSheet exerciseName="X" onCancel={vi.fn()} onSubmit={vi.fn()} />);
    expect(document.body.textContent).not.toMatch(/uraz|kontuzj|zerwan|naderwan|diagnoz|zapalen/i);
  });
});

// ─── Whole flow against the offline queue ─────────────────────────────────────

const day = (): TrainingDay => ({
  planDayId: 9, weekday: "Piątek", position: { index: 2, total: 4 }, name: "Dzień B", estimatedMinutes: 45, exerciseCount: 2, equipment: ["Sztanga"], trainerNote: null,
  exercises: [ex(), ex({ planExerciseId: 12, exerciseId: 6, name: "Podciąganie", showWeight: false, weightStepKg: null, equipment: ["Drążek"], previous: [], record: null, history: [], sets: 1 })],
  warmup: [{ name: "Krążenia ramion", detail: "10 × w każdą stronę", description: "Duże koła." }],
  cooldown: [{ name: "Pozycja dziecka", detail: "40 s", description: "Oddychaj." }],
  activeSession: null,
});

describe("TrainingFlow end to end (offline queue)", () => {
  let calls: { url: string; method: string; body: Record<string, unknown> }[];
  beforeEach(() => {
    window.localStorage.clear(); resetTrainingQueueForTests(); calls = [];
    let id = 100;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: JSON.parse(String(init.body ?? "{}")) });
      return new Response(JSON.stringify({ id: ++id }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("warm-up → sets → pain skip → cool-down → rating → finish; every write is sent once with its UUID", async () => {
    const onExit = vi.fn();
    render(<TrainingFlow day={day()} firstName="Ala" week={{ done: 1, target: 4 }} onExit={onExit} />);
    // warm-up (no timer, the amount is information)
    expect(screen.getByText("10 × w każdą stronę")).toBeTruthy();
    expect(screen.getByText(/Następne:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    // exercise 1: three sets
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Zapisz serię" }));
    fireEvent.click(screen.getByRole("button", { name: "Następne ćwiczenie" }));
    // exercise 2: pain → skipped, moves on
    fireEvent.click(screen.getByRole("button", { name: /Coś boli\?/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Bark" }));
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Wyślij i pomiń ćwiczenie" }));
    // cool-down
    expect(screen.getByText("Pozycja dziecka")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    // finish
    expect(screen.getByRole("heading", { name: "Trening ukończony" })).toBeTruthy();
    expect(screen.getByText("Dobra robota, Ala!")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy(); // sets
    expect(screen.queryByText(/story/i)).toBeNull(); // no dead "share" button
    fireEvent.click(screen.getByRole("radio", { name: "W sam raz" }));
    fireEvent.click(screen.getByRole("button", { name: "Zakończ" }));
    expect(onExit).toHaveBeenCalledWith(true);

    await waitFor(() => expect(calls.filter((c) => c.url.endsWith("/finish")).length).toBe(1));
    const kinds = calls.map((c) => (c.url.endsWith("/sessions") ? "start" : c.url.split("/").pop()));
    expect(kinds.filter((k) => k === "start")).toHaveLength(1);
    expect(kinds.filter((k) => k === "sets").length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((k) => k === "pain")).toHaveLength(1);
    const uuids = calls.map((c) => c.body["clientUuid"]).filter(Boolean);
    expect(new Set(uuids).size).toBe(uuids.length); // no repeated id
    expect(calls.find((c) => c.url.endsWith("/pain"))!.body).toMatchObject({ area: "Bark", severity: 4, planExerciseId: 12 });
    expect(calls.find((c) => c.url.endsWith("/finish"))!.body).toMatchObject({ status: "completed", rating: "just_right" });
    expect(calls[0]!.url).toBe("/api/client-portal/training/sessions");
  });

  it("offline: nothing is lost, everything is sent after the network returns", async () => {
    const fail = vi.fn(async () => { throw new TypeError("offline"); });
    vi.stubGlobal("fetch", fail);
    render(<TrainingFlow day={day()} firstName="Ala" week={{ done: 0, target: 4 }} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    fireEvent.click(screen.getByRole("button", { name: "Zapisz serię" }));
    await waitFor(() => expect(fail).toHaveBeenCalled());
    const stored = JSON.parse(window.localStorage.getItem("optimatren-trening-queue:v1")!);
    expect(stored.ops.map((o: { kind: string }) => o.kind)).toEqual(["start", "set"]);
    const sent: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { sent.push(url); return new Response(JSON.stringify({ id: 7 }), { status: 200 }); }));
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toBe("/api/client-portal/training/sessions/7/sets");
  });
});

describe("cool-down after a pain report in this workout", () => {
  it("drops the stretches that load the reported joint", () => {
    window.localStorage.clear(); resetTrainingQueueForTests();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200 })));
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    const d = day();
    d.cooldown = [
      { name: "Pozycja dziecka", detail: "40 s", description: "Oddychaj.", joints: ["Kolano"] },
      { name: "Rozciąganie klatki przy ścianie", detail: "30 s na stronę", description: "Spokojnie.", joints: [] },
    ];
    render(<TrainingFlow day={d} firstName="Ala" week={{ done: 0, target: 4 }} onExit={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));                // warm-up
    fireEvent.click(screen.getByRole("button", { name: /Coś boli\?/ }));           // exercise 1
    const dlg = within(screen.getByRole("dialog", { name: "Coś boli?" }));
    fireEvent.click(dlg.getByRole("radio", { name: "Kolano" }));
    fireEvent.click(dlg.getByRole("radio", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "Wyślij i pomiń ćwiczenie" }));
    for (let i = 0; i < 1; i++) fireEvent.click(screen.getByRole("button", { name: "Zapisz serię" })); // exercise 2: one set
    fireEvent.click(screen.getByRole("button", { name: "Przejdź do schłodzenia" }));
    expect(screen.queryByText("Pozycja dziecka")).toBeNull();
    expect(screen.getByText("Rozciąganie klatki przy ścianie")).toBeTruthy();
    expect(screen.getByText(/Schłodzenie · 1 z 1/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
