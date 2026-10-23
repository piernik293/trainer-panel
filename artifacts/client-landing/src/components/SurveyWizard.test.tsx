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
import { draftKey, EMPTY_ANSWERS, type Answers } from "@/lib/surveyWizard";
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
    expect(screen.getByText("Pytamy o to, bo wybrałeś/-aś cel sportowy.")).toBeTruthy();
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
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS }, stepId: "injury" }));
    mount();
    expect(screen.getByText(/To nie jest diagnoza/)).toBeTruthy();
    expect((screen.getByTestId("next") as HTMLButtonElement).disabled).toBe(true);
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
    expect(screen.getByText(/Poziom zaawansowania decyduje o tym.*Wybierz opis, który najlepiej do Ciebie pasuje\. Trener dostosuje plan do Twojego doświadczenia\./)).toBeTruthy();
    expect(screen.queryByText(/liczbą lat/)).toBeNull();
  });

  it("level screen: one-line descriptions, full text only behind 'Więcej'", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS }, stepId: "level" }));
    mount();
    expect(screen.getByText("Uczę się podstaw i techniki.")).toBeTruthy();
    expect(screen.queryByText(/nie czuję się jeszcze pewnie w samodzielnym planowaniu/)).toBeNull();
    const more = screen.getAllByRole("button", { name: "Więcej" });
    expect(more).toHaveLength(4);
    fireEvent.click(more[1]);
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
    desiredWeeklyFrequency: 3, sessionDuration: "45–60 min", injuryStatus: "Nie", activityLevel: "Siedzący", sleepHours: "7–8 godzin",
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
    await screen.findByText("Krok pierwszy zrobiony.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ trainingGoal: "Budowa sylwetki", injuryStatus: "Brak", firstName: "Marta", athleteStatus: "Nie" });
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
});
