// @vitest-environment happy-dom
/** Własny plan w Solo: model (payload zachowuje numery, walidacja, import) i edytor (wyszukiwarka, własne ćwiczenia, kolejność, ostrzeżenia, zapis, import). */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { emptyPlan, fromImport, fromServer, move, newExercise, toPayload, validate } from "@/lib/ownplan/model";
import { OwnPlanEditor, OwnPlanEntry } from "./OwnPlanEditor";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const SERVER_PLAN = {
  planId: 5, title: "Mój plan", origin: "own",
  days: [{ id: 11, name: "Góra", exercises: [
    { id: 101, exerciseId: 7, name: "Wyciskanie sztangi leżąc", custom: false, sets: 4, repMin: 6, repMax: 8, weightKg: 60, rir: 2, restSeconds: 120, note: "powoli" },
    { id: 102, exerciseId: 9, name: "Spacer farmera", custom: true, sets: 3, repMin: 1, repMax: 1, weightKg: null, rir: null, restSeconds: null, note: null },
  ] }],
};

describe("model edytora", () => {
  it("payload zachowuje numery dni i ćwiczeń, własne idą jako customName, górne powtórzenia pomijane gdy równe dolnym, pusta notatka = null", () => {
    const p = fromServer(SERVER_PLAN);
    const out = toPayload(p);
    expect(out.days[0]).toMatchObject({ id: 11, name: "Góra" });
    expect(out.days[0]!.exercises[0]).toMatchObject({ id: 101, exerciseId: 7, sets: 4, repMin: 6, repMax: 8, weightKg: 60, rir: 2, restSeconds: 120, note: "powoli" });
    expect(out.days[0]!.exercises[1]).toMatchObject({ id: 102, exerciseId: 9, repMin: 1, note: null });
    expect("repMax" in out.days[0]!.exercises[1]!).toBe(false);
    const withCustom = { ...p, days: [{ ...p.days[0]!, exercises: [...p.days[0]!.exercises, newExercise({ customName: "Sanie" })] }] };
    expect(toPayload(withCustom).days[0]!.exercises[2]).toMatchObject({ customName: "Sanie", sets: 3, repMin: 8, repMax: 12 });
    expect("exerciseId" in toPayload(withCustom).days[0]!.exercises[2]!).toBe(false);
  });
  it("kolejność: move przesuwa o jedno miejsce i nie wychodzi poza listę", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(move([1, 2, 3], 2, 3)).toEqual([1, 2, 3]);
  });
  it("walidacja: nazwa, dni, ćwiczenia, serie, powtórzenia, limity", () => {
    expect(validate(emptyPlan())).toMatch(/nie ma ćwiczeń/);
    const ok = { title: "P", days: [{ name: "A", exercises: [newExercise({ customName: "X" })] }] };
    expect(validate(ok)).toBeNull();
    expect(validate({ ...ok, title: " " })).toMatch(/nazwę planu/);
    expect(validate({ title: "P", days: [] })).toMatch(/co najmniej jeden dzień/);
    expect(validate({ ...ok, days: [{ name: "", exercises: ok.days[0]!.exercises }] })).toMatch(/nazwy/);
    expect(validate({ ...ok, days: [{ name: "A", exercises: [{ ...ok.days[0]!.exercises[0]!, sets: 11 }] }] })).toMatch(/serie/);
    expect(validate({ ...ok, days: [{ name: "A", exercises: [{ ...ok.days[0]!.exercises[0]!, repMin: 10, repMax: 5 }] }] })).toMatch(/powtórzenia/);
    expect(validate({ ...ok, days: Array.from({ length: 8 }, () => ok.days[0]!) })).toMatch(/Najwyżej 7 dni/);
  });
  it("import: pewne dopasowanie bierze ćwiczenie z katalogu (z ostrzeżeniem), niepewne zostaje własnym; ciężar „60 kg”, serie i powtórzenia z pliku", () => {
    const days = fromImport([{ name: "Dzień 1", rows: [
      { exerciseText: "Przysiad ze sztangą", sets: 4, repsMin: 8, repsMax: 10, loadText: "60 kg", rir: 2, note: "pięty", match: { exerciseId: 3, name: "Przysiad ze sztangą", score: 1 }, jointWarning: "Zgłaszałeś ból: kolano." },
      { exerciseText: "Dziwne ćwiczenie", sets: null, repsMin: null, repsMax: null, loadText: "", rir: null, note: "", match: { exerciseId: 4, name: "Coś innego", score: 0.2 }, jointWarning: null },
    ] }]);
    expect(days[0]!.exercises[0]).toMatchObject({ exerciseId: 3, sets: 4, repMin: 8, repMax: 10, weightKg: 60, rir: 2, note: "pięty", warning: "Zgłaszałeś ból: kolano." });
    expect(days[0]!.exercises[1]).toMatchObject({ exerciseId: null, customName: "Dziwne ćwiczenie", sets: 3, repMin: 8, repMax: 8, weightKg: null });
  });
});

describe("edytor", () => {
  let puts: unknown[];
  let putResponse: () => Response;
  beforeEach(() => {
    puts = []; putResponse = () => json({ planId: 5, created: false, warnings: [] });
    vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => {
      if (u === "/api/own-plan" && (!init || !init.method)) return json({ plan: SERVER_PLAN });
      if (u === "/api/own-plan" && init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return putResponse(); }
      if (u.startsWith("/api/own-plan/search")) return json({ results: [{ id: 21, name: "Przysiad goblet", muscleGroup: "Nogi", warning: "Zgłaszałeś ból: kolano. To ćwiczenie może to obciążać — jeśli coś boli, pomiń je albo zamień." }, { id: 22, name: "Przysiad bułgarski", muscleGroup: "Nogi", warning: null }] });
      if (u === "/api/own-plan/import/preview") return json({ mapping: { day: 0, exercise: 1, sets: 2, reps: 3 }, hasHeader: true, rows: [] });
      if (u === "/api/own-plan/import/analyze") return json({ days: [{ name: "A", rows: [{ exerciseText: "Przysiad", sets: 4, repsMin: 8, repsMax: 10, loadText: "50", rir: null, note: "", match: { exerciseId: 3, name: "Przysiad ze sztangą", score: 0.9 }, jointWarning: null }] }, { name: "B", rows: [{ exerciseText: "Mój wymysł", sets: 2, repsMin: 12, repsMax: 12, loadText: "", rir: null, note: "", match: null, jointWarning: null }] }], skipped: [] });
      return json({}, 404);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("wczytuje bieżący plan: dni, ćwiczenia, serie × powtórzenia, ciężar; własne oznaczone", async () => {
    render(<OwnPlanEditor onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByDisplayValue("Mój plan")).toBeTruthy();
    expect(screen.getAllByTestId("ex-row")).toHaveLength(2);
    expect((screen.getByLabelText("Serie: Wyciskanie sztangi leżąc") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Ciężar: Wyciskanie sztangi leżąc") as HTMLInputElement).value).toBe("60");
    expect(screen.getByText("własne")).toBeTruthy();
  });
  it("zmiana serii, zmiana kolejności i usunięcie → zapis wysyła numery istniejących ćwiczeń i zamyka edytor", async () => {
    const onSaved = vi.fn(), onClose = vi.fn();
    render(<OwnPlanEditor onClose={onClose} onSaved={onSaved} />);
    await screen.findByDisplayValue("Mój plan");
    fireEvent.change(screen.getByLabelText("Serie: Wyciskanie sztangi leżąc"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Przesuń niżej: Wyciskanie sztangi leżąc" }));
    expect(within(screen.getAllByTestId("ex-row")[0]!).getByText("Spacer farmera")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zapisz plan" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
    const body = puts[0] as { days: { id: number; exercises: { id: number; sets: number }[] }[] };
    expect(body.days[0]!.id).toBe(11);
    expect(body.days[0]!.exercises.map((e) => e.id)).toEqual([102, 101]);
    expect(body.days[0]!.exercises[1]!.sets).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "Usuń: Spacer farmera" })); // po zapisie można dalej edytować
  });
  it("dodawanie z wyszukiwarki: wynik z ostrzeżeniem trafia do planu z ostrzeżeniem; „dodaj własne” dodaje ćwiczenie własne", async () => {
    render(<OwnPlanEditor onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("Mój plan");
    fireEvent.click(screen.getByRole("button", { name: "Dodaj ćwiczenie" }));
    fireEvent.change(screen.getByLabelText("Szukaj ćwiczenia"), { target: { value: "przysiad" } });
    const hits = await screen.findAllByTestId("hit");
    expect(hits).toHaveLength(2);
    expect(hits[0]!.textContent).toContain("Zgłaszałeś ból: kolano");
    fireEvent.click(hits[0]!);
    expect(screen.queryByTestId("add-exercise")).toBeNull();
    expect(screen.getAllByTestId("ex-row")).toHaveLength(3);
    expect(screen.getByTestId("ex-warning").textContent).toContain("jeśli coś boli");
    expect(screen.getByTestId("ex-warning").textContent).not.toMatch(/uraz|kontuzj|diagnoz|choroba/i);
    fireEvent.click(screen.getByRole("button", { name: "Dodaj ćwiczenie" }));
    fireEvent.change(screen.getByLabelText("Szukaj ćwiczenia"), { target: { value: "Ciągnięcie sań" } });
    fireEvent.click(await screen.findByTestId("custom-add"));
    expect(screen.getAllByTestId("ex-row")).toHaveLength(4);
    expect(screen.getAllByText("własne").length).toBe(2);
  });
  it("zapis niczego nie blokuje przy ostrzeżeniu: plan jest zapisany, a ostrzeżenia pokazane z „Rozumiem”", async () => {
    putResponse = () => json({ planId: 5, created: false, warnings: [{ name: "Przysiad goblet", message: "Zgłaszałeś ból: kolano. Uważaj." }] });
    const onSaved = vi.fn(), onClose = vi.fn();
    render(<OwnPlanEditor onClose={onClose} onSaved={onSaved} />);
    await screen.findByDisplayValue("Mój plan");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz plan" }));
    expect((await screen.findByTestId("save-notes")).textContent).toContain("Przysiad goblet: Zgłaszałeś ból: kolano");
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Rozumiem" }));
    expect(onClose).toHaveBeenCalled();
  });
  it("błąd serwera: komunikat i możliwość ponowienia; dzień bez ćwiczeń blokuje zapis z jasnym powodem", async () => {
    putResponse = () => json({ error: "Nie udało się zapisać planu." }, 500);
    render(<OwnPlanEditor onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("Mój plan");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz plan" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nie udało się zapisać");
    fireEvent.click(screen.getByRole("button", { name: "Usuń: Spacer farmera" }));
    fireEvent.click(screen.getByRole("button", { name: "Usuń: Wyciskanie sztangi leżąc" }));
    expect((screen.getByRole("button", { name: "Zapisz plan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("nie ma ćwiczeń");
  });
  it("dodawanie i przesuwanie dni; ostatniego dnia nie da się usunąć; limit 7 dni", async () => {
    render(<OwnPlanEditor onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("Mój plan");
    expect((screen.getByRole("button", { name: "Usuń dzień 1" }) as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Dodaj dzień" }));
    expect(screen.getAllByTestId("day")).toHaveLength(7);
    expect((screen.getByRole("button", { name: "Dodaj dzień" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("import z pliku: ćwiczenia z pewnym dopasowaniem z katalogu, reszta jako własne; trzeba jeszcze zapisać", async () => {
    render(<OwnPlanEditor onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("Mój plan");
    const input = screen.getByTestId("import-file") as HTMLInputElement;
    const file = new File(["Dzień;Ćwiczenie\nA;Przysiad"], "plan.csv", { type: "text/csv" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); await new Promise((r) => setTimeout(r, 50)); });
    expect((await screen.findByTestId("import-info")).textContent).toContain("Sprawdź ćwiczenia");
    expect(screen.getAllByTestId("day")).toHaveLength(2);
    expect(screen.getByText("Przysiad ze sztangą")).toBeTruthy();
    expect(screen.getByText("Mój wymysł")).toBeTruthy();
    expect(puts).toHaveLength(0); // nic nie zapisano bez potwierdzenia
  });
  it("375 px: przyciski mają co najmniej 44 px (h-11/h-12/h-14)", async () => {
    render(<OwnPlanEditor onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByDisplayValue("Mój plan");
    for (const b of screen.getAllByRole("button")) expect(b.className, b.getAttribute("aria-label") ?? b.textContent ?? "").toMatch(/h-11|h-12|h-14|min-h-11|min-h-12/);
  });
});

describe("wejście „Mam własny plan”", () => {
  const stub = (own: boolean, linked: boolean) => vi.stubGlobal("fetch", vi.fn(async (u: string) => (u === "/api/own-plan/status" ? json({ enabled: own }) : u === "/api/account/status" ? json({ linked }) : json({ plan: null }))));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("widoczne tylko z flagą i tylko dla osoby bez trenera; klik otwiera edytor", async () => {
    stub(false, false);
    const { unmount } = render(<OwnPlanEntry onSaved={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("own-plan-entry")).toBeNull(); // flaga wyłączona
    unmount();
    stub(true, true);
    const u2 = render(<OwnPlanEntry onSaved={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("own-plan-entry")).toBeNull(); // podopieczny trenera
    u2.unmount();
    stub(true, false);
    render(<OwnPlanEntry onSaved={vi.fn()} />);
    fireEvent.click(await screen.findByTestId("own-plan-entry"));
    expect(await screen.findByTestId("own-plan-editor")).toBeTruthy();
  });
});
