/**
 * @vitest-environment happy-dom
 *
 * Wywiad 2.0 — the interface: one question per screen, progress, auto-advance,
 * conditional screen, summary with "Zmień", autosave + resume, keyboard.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import SurveyWizard from "@/components/SurveyWizard";
import { draftKey, EMPTY_ANSWERS, buildSurveyPayload, normalizeAnswers, visibleSteps, isStepVisible, type Answers } from "@/lib/surveyWizard";
import { birthDateBounds, getLocalDateString } from "@workspace/survey-config";

vi.mock("@/components/AvoidedExercisesPicker", () => ({ AvoidedExercisesPicker: () => <div data-testid="avoided-picker" /> }));
vi.mock("@/components/FavoriteExercisesPicker", () => ({ FavoriteExercisesPicker: () => <div data-testid="favorite-picker" /> }));
vi.mock("@/components/MuscleGroupCombobox", () => ({ MuscleGroupCombobox: () => <div /> }));

const TOKEN = "t".repeat(64);
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SurveyWizard inviteToken={TOKEN} prefill={{ firstName: "Marta", email: "marta@example.com" }} />
    </QueryClientProvider>,
  );
const question = () => screen.getByTestId("question").textContent;
const next = () => fireEvent.click(screen.getByTestId("next"));

beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("steps", () => {
  it("shows one question, stage 'X z N', progressbar, 'Dalej' disabled until a valid answer", () => {
    mount();
    expect(question()).toBe("Jak masz na imię?");
    expect(screen.getByTestId("stage-name").textContent).toBe("O Tobie");
    expect(screen.getByTestId("stage-count").textContent).toContain("1 z 9");
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(true); // surname missing
    fireEvent.change(screen.getByLabelText("Nazwisko"), { target: { value: "Test" } });
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("Imię") as HTMLInputElement).value).toBe("Marta"); // prefilled from the invitation
  });

  it("single choice moves on by itself after ~300 ms; 'Wstecz' returns", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "Marta", lastName: "T", email: "m@example.com" }, stepId: "goal" }));
    mount();
    expect(question()).toBe("Jaki jest Twój cel treningowy?");
    fireEvent.click(screen.getByLabelText("Budowa sylwetki"));
    expect(question()).toBe("Jaki jest Twój cel treningowy?");
    act(() => { vi.advanceTimersByTime(350); });
    expect(question()).toBe("Dlaczego chcesz trenować?");
    fireEvent.click(screen.getByLabelText("Wstecz"));
    expect(question()).toBe("Jaki jest Twój cel treningowy?");
  });

  it("conditional screen: sport questions only for the sport goal, with the reason", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "M", lastName: "T", email: "m@example.com" }, stepId: "goal" }));
    mount();
    fireEvent.click(screen.getByLabelText("Cel sportowy"));
    act(() => { vi.advanceTimersByTime(350); });
    expect(question()).toBe("Jak uprawiasz sport?");
    expect(screen.getByText("Pytamy o to, bo celem jest sport.")).toBeTruthy();
  });

  it("multi-choice tiles: aria-pressed and a counter on the button", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, trainingLocation: "Dom" }, stepId: "equipment" }));
    mount();
    const hantle = screen.getByRole("button", { name: "Hantle" });
    expect(hantle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(hantle);
    fireEvent.click(screen.getByRole("button", { name: "Kettlebell" }));
    expect(screen.getByRole("button", { name: "Hantle" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("next").textContent).toBe("Dalej · zaznaczono 2");
  });

  it("health question carries the 'not a diagnosis' note", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, healthConsent: true }, stepId: "injury" }));
    mount();
    expect(screen.getByText(/To nie jest diagnoza/)).toBeTruthy();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("health consent: unticked by default; without it the question is not asked and the screen can be passed; ticking shows the question", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS }, stepId: "injury" }));
    mount();
    const box = within(screen.getByTestId("health-consent")).getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText(/Bez zgody pomijamy pytania o zdrowie/)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Tak" })).toBeNull();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(box);
    expect(screen.getByRole("radio", { name: "Tak" })).toBeTruthy();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Bez zgody pomijamy pytania o zdrowie/)).toBeNull();
  });

  it("height and weight screen never shows BMI (value or text) to the client", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, heightCm: 170, weightKg: "80" }, stepId: "body" }));
    mount();
    expect(screen.queryByTestId("bmi")).toBeNull();
    expect(screen.queryByText(/BMI/i)).toBeNull();
    expect(screen.queryByText(/27[.,]7/)).toBeNull();
  });

  it("level screen lead matches the 2-year rule (no 'don't go by years' sentence)", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS }, stepId: "level" }));
    mount();
    expect(screen.getByText(/Wybierz opis, który najlepiej do Ciebie pasuje\. Trener dostosuje plan do Twojego doświadczenia\./)).toBeTruthy();
    // the old section description is one tap away
    expect(screen.queryByText(/Poziom zaawansowania decyduje o tym/)).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Więcej" })[0]!);
    expect(screen.getByText(/Poziom zaawansowania decyduje o tym, jak dobieram technikę/)).toBeTruthy();
    expect(screen.queryByText(/liczbą lat/)).toBeNull();
  });

  it("level screen: one-line descriptions, full text only behind 'Więcej'", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS }, stepId: "level" }));
    mount();
    expect(screen.getByText("Uczę się podstaw i techniki.")).toBeTruthy();
    expect(screen.queryByText(/nie czuję się jeszcze pewnie w samodzielnym planowaniu/)).toBeNull();
    const more = screen.getAllByRole("button", { name: "Więcej" });
    expect(more).toHaveLength(5); // one for the section description + one per level
    fireEvent.click(more[2]!);
    expect(screen.getByText(/nie czuję się jeszcze pewnie w samodzielnym planowaniu/)).toBeTruthy();
    expect((screen.getByLabelText(/^Początkujący/) as HTMLInputElement).checked).toBe(false); // "Więcej" does not choose
    expect(screen.getByRole("button", { name: "Mniej" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("autosave and resume", () => {
  it("answers are saved under a token-scoped key and the interview resumes at the same step", () => {
    const first = mount();
    fireEvent.change(screen.getByLabelText("Nazwisko"), { target: { value: "Test" } });
    next();
    expect(question()).toBe("Jak się z Tobą skontaktować?");
    const saved = JSON.parse(window.localStorage.getItem(draftKey(TOKEN))!);
    expect(saved).toMatchObject({ v: 1, stepId: "contact" });
    expect(saved.answers.lastName).toBe("Test");
    first.unmount();

    mount(); // same link again
    expect(question()).toBe("Jak się z Tobą skontaktować?");
    fireEvent.click(screen.getByLabelText("Wstecz"));
    expect((screen.getByLabelText("Nazwisko") as HTMLInputElement).value).toBe("Test");
  });

  it("works with unavailable storage", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } });
    mount();
    expect(question()).toBe("Jak masz na imię?");
  });
});

describe("summary", () => {
  const filled: Answers = {
    ...EMPTY_ANSWERS, firstName: "Marta", lastName: "Test", email: "m@example.com", dateOfBirth: "1990-05-05", gender: "Kobieta",
    heightCm: 170, weightKg: "65", trainingGoal: "Budowa sylwetki", experienceLevel: "Początkujący", trainingLocation: "Siłownia",
    desiredWeeklyFrequency: 3, sessionDuration: "45–60 min", healthConsent: true, injuryStatus: "Nie", activityLevel: "Siedzący", sleepHours: "7–8 godzin",
    planStylePreference: "Prosty i łatwy do utrzymania",
  };

  it("lists the stages with 'Zmień' leading to the right step; submit sends the payload and clears the draft", async () => {
    vi.useRealTimers();
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: filled, stepId: "summary" }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    mount();
    expect(question()).toBe("Sprawdź swoje odpowiedzi");
    const rows = screen.getAllByTestId("summary-stage");
    expect(rows).toHaveLength(9);
    fireEvent.click(within(rows[1]).getByRole("button", { name: /Zmień/ }));
    expect(question()).toBe("Jaki jest Twój cel treningowy?");
    fireEvent.click(screen.getByLabelText("Wstecz"));

    // back on the summary: send
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: filled, stepId: "summary" }));
    cleanup();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Wyślij trenerowi" }));
    await screen.findByText("Dziękujemy!");
    expect(screen.getByText(/zwykle w ciągu 1–2 dni/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ trainingGoal: "Budowa sylwetki", injuryStatus: "Brak", healthConsent: true, firstName: "Marta", athleteStatus: "Nie" });
    expect(window.localStorage.getItem(draftKey(TOKEN))).toBeNull();
  });
});

describe("keyboard", () => {
  it("Enter = Dalej; focus lands on the question after a step change", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Nazwisko"), { target: { value: "Test" } });
    fireEvent.keyDown(screen.getByLabelText("Nazwisko"), { key: "Enter" });
    expect(question()).toBe("Jak się z Tobą skontaktować?");
    expect(document.activeElement).toBe(screen.getByTestId("question"));
  });

  it("arrows move within a radio group", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS }, stepId: "goal" }));
    mount();
    const first = screen.getByLabelText("Budowa sylwetki") as HTMLInputElement;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect((screen.getByLabelText("Zwiększenie siły") as HTMLInputElement).checked).toBe(true);
  });
});

describe("validation and equipment in the interface (Task 3–5, 23.10)", () => {
  const open = (stepId: string, answers: Partial<Answers> = {}) => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "M", lastName: "T", email: "m@example.com", ...answers }, stepId }));
    mount();
  };

  it("birth date: empty field, calendar limited to 16–90 years and opening ~30 years back (never today)", () => {
    open("birth");
    expect((screen.getByLabelText("Data urodzenia") as HTMLInputElement).value).toBe("");
    const cal = document.querySelector('input[type="date"]') as HTMLInputElement;
    const b = birthDateBounds();
    expect(cal.min).toBe(b.min);
    expect(cal.max).toBe(b.max);
    expect(cal.value).toBe(b.opensAt);
    expect(cal.value).not.toBe(getLocalDateString(new Date()));
    expect(Number(b.opensAt.slice(0, 4))).toBe(new Date().getFullYear() - 30);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("birth date: Polish message under the field for age < 16 or > 90, none for a valid date", () => {
    open("birth", { gender: "Kobieta" });
    const field = screen.getByLabelText("Data urodzenia");
    fireEvent.change(field, { target: { value: "01012020" } });
    expect(screen.getByRole("alert").textContent).toBe("Wiek musi mieścić się między 16 a 90 lat. Sprawdź datę urodzenia.");
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: "01011900" } });
    expect(screen.getByRole("alert").textContent).toContain("16 a 90 lat");
    fireEvent.change(field, { target: { value: "31021990" } });
    expect(screen.getByRole("alert").textContent).toContain("poprawną datę");
    fireEvent.change(field, { target: { value: "01011990" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Wiek: \d+ lat/)).toBeTruthy();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(false);
  });

  it("height 120–230 and weight 35–250: message under the field after leaving it", () => {
    open("body");
    const h = screen.getByLabelText("Wzrost"); const w = screen.getByLabelText("Waga");
    fireEvent.change(h, { target: { value: "119" } }); fireEvent.blur(h);
    expect(screen.getByText("Wzrost musi być między 120 a 230 cm.")).toBeTruthy();
    fireEvent.change(h, { target: { value: "175" } });
    expect(screen.queryByText(/Wzrost musi być/)).toBeNull();
    fireEvent.change(w, { target: { value: "251" } }); fireEvent.blur(w);
    expect(screen.getByText("Waga musi być między 35 a 250 kg.")).toBeTruthy();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(w, { target: { value: "62,5" } });
    expect(screen.queryByText(/Waga musi być/)).toBeNull();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(false);
  });

  it("disabled 'Dalej' is grey (not pale orange) and says what to fill in", () => {
    open("name", { firstName: "", lastName: "" });
    const next = screen.getByTestId("next") as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(next.className).toContain("disabled:bg-muted");
    expect(next.className).toContain("disabled:opacity-100");
    expect(screen.getByTestId("next-hint").textContent).toBe("Uzupełnij: imię.");
    expect(next.getAttribute("aria-describedby")).toBe("next-hint");
    fireEvent.change(screen.getByLabelText("Imię"), { target: { value: "Ala" } });
    expect(screen.getByTestId("next-hint").textContent).toBe("Uzupełnij: nazwisko.");
    fireEvent.change(screen.getByLabelText("Nazwisko"), { target: { value: "K" } });
    expect(screen.queryByTestId("next-hint")).toBeNull();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(false);
  });

  it("'Brak sprzętu' unticks the rest and the other way round", () => {
    open("equipment", { trainingLocation: "Dom" });
    const box = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}$`) });
    const on = (name: string) => box(name).getAttribute("aria-pressed") === "true";
    fireEvent.click(box("Hantle")); fireEvent.click(box("Gumy oporowe"));
    expect(on("Hantle") && on("Gumy oporowe")).toBe(true);
    fireEvent.click(box("Brak sprzętu"));
    expect(on("Brak sprzętu")).toBe(true);
    expect(on("Hantle") || on("Gumy oporowe")).toBe(false);
    fireEvent.click(box("Kettlebell"));
    expect(on("Kettlebell")).toBe(true);
    expect(on("Brak sprzętu")).toBe(false);
  });

  it("lista sprzętu: Kółka gimnastyczne i Uchwyty do pompek (24.10), przed „Brak sprzętu”", () => {
    open("equipment", { trainingLocation: "Dom" });
    const labels = screen.getAllByRole("button").map((b) => b.textContent?.trim() ?? "");
    const at = (n: string) => labels.findIndex((l) => l === n);
    expect(at("Kółka gimnastyczne")).toBeGreaterThan(-1);
    expect(at("Uchwyty do pompek")).toBeGreaterThan(-1);
    expect(at("Kółka gimnastyczne")).toBeLessThan(at("Brak sprzętu"));
    expect(at("Uchwyty do pompek")).toBeLessThan(at("Brak sprzętu"));
    const box = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}$`) });
    fireEvent.click(box("Kółka gimnastyczne")); fireEvent.click(box("Uchwyty do pompek"));
    expect(box("Kółka gimnastyczne").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("next").textContent).toBe("Dalej · zaznaczono 2");
    fireEvent.click(box("Brak sprzętu"));
    expect(box("Uchwyty do pompek").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("goals with descriptions, recommended session length, priority groups (23.10)", () => {
  const open = (stepId: string, answers: Partial<Answers> = {}) => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "M", lastName: "T", email: "m@example.com", ...answers }, stepId }));
    mount();
  };
  const GOALS: Record<string, string> = {
    "Budowa sylwetki": "Więcej mięśni i lepsze proporcje ciała.",
    "Zwiększenie siły": "Podnosić więcej w głównych ćwiczeniach.",
    "Redukcja tkanki tłuszczowej": "Mniej tkanki tłuszczowej przy zachowaniu mięśni. Duże znaczenie ma też dieta.",
    "Poprawa kondycji": "Łatwiej znosić wysiłek i szybciej się regenerować.",
    "Poprawa sprawności": "Swobodniejszy ruch na co dzień — mobilność, stabilizacja, równowaga.",
    "Cel sportowy": "Przygotowanie do konkretnej dyscypliny lub startu.",
  };

  it("every goal has its own arrow; opening it shows the description and does not select the goal", () => {
    open("goal");
    for (const [goal, text] of Object.entries(GOALS)) {
      const arrow = screen.getByRole("button", { name: `Pokaż opis: ${goal}` });
      expect(arrow.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText(text)).toBeNull();
      fireEvent.click(arrow);
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.getByRole("button", { name: `Ukryj opis: ${goal}` }).getAttribute("aria-expanded")).toBe("true");
      expect((screen.getByLabelText(goal) as HTMLInputElement).checked).toBe(false);
    }
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(true); // still nothing chosen
  });

  it("'Cel sportowy' looks like the other goals: enabled, same background (no grey)", () => {
    open("goal");
    const sport = screen.getByLabelText("Cel sportowy") as HTMLInputElement;
    expect(sport.disabled).toBe(false);
    const card = (el: HTMLElement) => el.closest("div.relative") as HTMLElement;
    expect(card(sport).className).toBe(card(screen.getByLabelText("Budowa sylwetki")).className);
    expect(card(sport).className).not.toMatch(/bg-muted/);
    expect(card(sport).className).not.toMatch(/hover:bg-/); // hover must not turn an option grey (looked disabled)
  });

  it.each([
    ["Brak aktywności fizycznej", "", "30–45 min", "Krótko na start, żeby zbudować nawyk i nie przeciążyć organizmu."],
    ["Początkujący", "", "45–60 min", "Wystarczy na rozgrzewkę i kilka ćwiczeń z dobrą techniką."],
    ["Średniozaawansowany", "3 lata", "60–90 min", "Więcej serii i dłuższe przerwy przy ćwiczeniach głównych."],
    ["Zaawansowany", "5 lat", "60–90 min", "Duża objętość i przerwy 3–5 min przy ciężkich seriach."],
    // chosen intermediate, only 1 year of training → effective beginner → the beginner's recommendation
    ["Średniozaawansowany", "1 rok", "45–60 min", "Wystarczy na rozgrzewkę i kilka ćwiczeń z dobrą techniką."],
  ])("session length: level %s (%s) → badge on %s", (experienceLevel, trainingDuration, option, why) => {
    open("session", { experienceLevel, trainingDuration });
    const badges = screen.getAllByText("Polecane dla Ciebie");
    expect(badges).toHaveLength(1);
    expect(badges[0]!.closest("label")!.textContent).toContain(option);
    expect(screen.getByText(why)).toBeTruthy();
    // the client may still choose any option
    const radios = within(screen.getByRole("radiogroup", { name: "Czas treningu" })).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.value)).toEqual(["30–45 min", "45–60 min", "60–90 min", "90+ min"]);
    expect(radios.every((r) => !r.disabled)).toBe(true);
  });

  it("priority groups: skipped for beginners (C3), advanced get up to three", () => {
    expect(isStepVisible("priority", { ...EMPTY_ANSWERS, experienceLevel: "Początkujący" })).toBe(false);
    expect(isStepVisible("priority", { ...EMPTY_ANSWERS, experienceLevel: "Średniozaawansowany", trainingDuration: "1 rok" })).toBe(false); // effective = beginner
    open("priority", { experienceLevel: "Zaawansowany" });
    expect(screen.getByText(/Wybierz do 3 partii mięśniowych/)).toBeTruthy();
    expect(screen.getAllByText(/^Priorytet \d$/)).toHaveLength(3);
  });

  it("cardio: two options only", () => {
    open("cardioPref");
    const group = screen.getByRole("radiogroup", { name: "Cardio w planie" });
    expect(within(group).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["Tak, uwzględnij cardio w planie", "Tylko niezbędne minimum"]);
    expect(screen.queryByText(/dodatkiem do planu/)).toBeNull();
  });
});

describe("cardio: no instant advance, silent 20 s countdown cancelled by any interaction (23.10)", () => {
  const open = () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "M", lastName: "T", email: "m@example.com", trainingGoal: "Poprawa kondycji" }, stepId: "cardioPref" }));
    mount();
  };
  const choose = (v: string) => fireEvent.click(screen.getByLabelText(v));
  const idle = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it("does not move on after the choice; the hint stays readable; moves on after 20 s", () => {
    open();
    choose("Tylko niezbędne minimum");
    idle(1000);
    expect(question()).toBe("Jak uwzględnić cardio w planie?");
    expect(screen.getByText(/To nie problem/)).toBeTruthy(); // the reassurance under the choice
    idle(18_000);
    expect(question()).toBe("Jak uwzględnić cardio w planie?"); // 19 s: still here
    idle(1500);
    expect(question()).toBe("Jaki styl planu Ci odpowiada?"); // "minimum": the form-of-activity screen is skipped
  });

  it("no visible counter", () => {
    open();
    choose("Tak, uwzględnij cardio w planie");
    expect(document.body.textContent).not.toMatch(/\b\d+\s*s\b|za \d+|sekund|odliczani/i);
  });

  it.each([
    ["a click", () => fireEvent.click(document.body)],
    ["a key press", () => fireEvent.keyDown(document.body, { key: "a" })],
    ["a touch", () => fireEvent.touchStart(document.body)],
    ["scrolling", () => fireEvent.scroll(window)],
    ["the pointer", () => fireEvent.pointerDown(document.body)],
  ])("%s cancels the countdown — then only 'Dalej' moves on", (_n, interact) => {
    open();
    choose("Tak, uwzględnij cardio w planie");
    idle(2000);
    interact();
    idle(60_000);
    expect(question()).toBe("Jak uwzględnić cardio w planie?");
    fireEvent.click(screen.getByTestId("next"));
    expect(question()).toBe("Jaka forma aktywności tlenowej najbardziej Ci odpowiada?"); // "Tak": the form screen follows
  });

  it("changing the answer cancels it too", () => {
    open();
    choose("Tak, uwzględnij cardio w planie");
    idle(500);
    choose("Tylko niezbędne minimum");
    idle(60_000);
    expect(question()).toBe("Jak uwzględnić cardio w planie?");
  });

  it("other single-choice questions keep the short auto-advance", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "M", lastName: "T", email: "m@example.com" }, stepId: "goal" }));
    mount();
    fireEvent.click(screen.getByLabelText("Budowa sylwetki"));
    idle(350);
    expect(question()).toBe("Dlaczego chcesz trenować?");
  });
});

describe("preferences stage: exercises and methods to avoid for the EFFECTIVE intermediate / advanced level (23.10)", () => {
  const open = (stepId: string, answers: Partial<Answers>) => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "M", lastName: "T", email: "m@example.com", ...answers }, stepId }));
    mount();
  };
  it("'Metody do unikania': multi-choice of the generator's list, several at once", () => {
    open("methodsList", { experienceLevel: "Zaawansowany", trainingDuration: "5 lat" });
    expect(question()).toBe("Metody do unikania");
    const names = ["Superserie", "Serie złożone (Compound Set)", "Drop sety", "Serie do upadku mięśniowego", "Serie wymuszone", "Rest-Pause"];
    for (const n of names) expect(screen.getByRole("button", { name: n }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Drop sety" }));
    fireEvent.click(screen.getByRole("button", { name: "Rest-Pause" }));
    expect(screen.getByRole("button", { name: "Drop sety" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Rest-Pause" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("next").textContent).toContain("zaznaczono 2");
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(false); // optional
  });
  it("both questions are on the existing 9th stage 'Preferencje planu' (stage count unchanged)", () => {
    open("avoided", { experienceLevel: "Średniozaawansowany", trainingDuration: "3 lata" });
    expect(screen.getByTestId("stage-name").textContent).toBe("Preferencje planu");
    expect(screen.getByTestId("stage-count").textContent).toContain("z 9");
    expect(question()).toBe("Ćwiczenia do unikania");
    expect(screen.getByTestId("avoided-picker")).toBeTruthy(); // catalogue search + free text
    cleanup();
    open("methodsList", { experienceLevel: "Zaawansowany", trainingDuration: "5 lat" });
    expect(screen.getByTestId("stage-name").textContent).toBe("Preferencje planu");
    expect(screen.getByTestId("stage-count").textContent).toContain("z 9");
  });
  it("a chosen intermediate with < 2 years never sees them (effective = beginner): the draft jumps past", () => {
    open("avoided", { experienceLevel: "Średniozaawansowany", trainingDuration: "1 rok" });
    expect(question()).not.toBe("Ćwiczenia do unikania");
  });
});

describe("Cardio stage: frequency → inclusion → form (only for 'Tak') (23.10, pkt 9)", () => {
  const open = (stepId: string, answers: Partial<Answers> = {}) => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, firstName: "M", lastName: "T", email: "m@example.com", trainingGoal: "Poprawa kondycji", ...answers }, stepId }));
    mount();
  };
  const HINT = "Ta informacja pomoże lepiej dopasować plan do celu oraz preferencji. Cardio nie jest obowiązkowym elementem każdego planu.";

  it("order of the screens and the hint only on 'Jak często wykonujesz cardio?'", () => {
    const ids = visibleSteps({ ...EMPTY_ANSWERS, cardioPreference: "Tak, uwzględnij cardio w planie" }).filter((i) => i.startsWith("cardio"));
    expect(ids).toEqual(["cardioFreq", "cardioPref", "cardioType"]);
    open("cardioFreq");
    expect(question()).toBe("Jak często wykonujesz cardio?");
    expect(document.body.textContent!.split(HINT).length - 1).toBe(1); // once
    cleanup();
    open("cardioPref");
    expect(document.body.textContent).not.toContain("Ta informacja pomoże");
    cleanup();
    open("cardioType", { cardioPreference: "Tak, uwzględnij cardio w planie" });
    expect(document.body.textContent).not.toContain("Ta informacja pomoże");
  });

  it("'Tak' → the form-of-activity screen is shown", () => {
    const ids = visibleSteps({ ...EMPTY_ANSWERS, cardioPreference: "Tak, uwzględnij cardio w planie" });
    expect(ids).toContain("cardioType");
  });
  it("'minimum' (or no answer) → the screen is skipped and the answer cleared", () => {
    expect(visibleSteps({ ...EMPTY_ANSWERS, cardioPreference: "Tylko niezbędne minimum" })).not.toContain("cardioType");
    expect(visibleSteps({ ...EMPTY_ANSWERS })).not.toContain("cardioType");
    expect(normalizeAnswers({ ...EMPTY_ANSWERS, cardioPreference: "Tylko niezbędne minimum", preferredCardioType: "Bieganie" }).preferredCardioType).toBe("");
    // a legacy "dodatek" answer counts as "Tak"
    expect(visibleSteps({ ...EMPTY_ANSWERS, cardioPreference: "Cardio może być dodatkiem do planu" })).toContain("cardioType");
  });
  it("payload for 'Tak' keeps the form; for 'minimum' the form is empty", () => {
    const base: Answers = { ...EMPTY_ANSWERS, firstName: "A", lastName: "B", email: "a@b.pl", cardioFrequency: "1 raz w tygodniu" };
    const yes = buildSurveyPayload({ ...base, cardioPreference: "Tak, uwzględnij cardio w planie", preferredCardioType: "Rower" });
    expect(yes).toMatchObject({ cardioPreference: "Tak, uwzględnij cardio w planie", cardioFrequency: "1 raz w tygodniu", preferredCardioType: "Rower" });
    const min = buildSurveyPayload({ ...base, cardioPreference: "Tylko niezbędne minimum", preferredCardioType: "Rower" });
    expect(min["cardioPreference"]).toBe("Tylko niezbędne minimum");
    expect(min["preferredCardioType"] ?? "").toBe("");
  });
  it("footer: '© rok Optimatren', no old brand text", () => {
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Premium Personal Training|Wszelkie prawa/i);
  });
});
