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

  it("BMI shows on the height and weight screen", () => {
    window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers: { ...EMPTY_ANSWERS, heightCm: 170, weightKg: "80" }, stepId: "body" }));
    mount();
    expect(screen.getByTestId("bmi").textContent).toBe("BMI: 27.7");
    expect(screen.getByText(/BMI wskazuje podwyższoną masę ciała/)).toBeTruthy();
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
