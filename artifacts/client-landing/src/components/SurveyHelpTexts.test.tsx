/**
 * @vitest-environment happy-dom
 *
 * Nothing the old form told the client may silently disappear. The fixture holds every helper text
 * (section descriptions, hints, notes, option descriptions, recommendations) taken verbatim from the
 * old SurveyForm.tsx / survey-config (git 259bb38^). The wizard is rendered on every screen for two
 * answer profiles and the visible text is compared. Texts removed on purpose are listed with the reason.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import SurveyWizard from "@/components/SurveyWizard";
import { draftKey, EMPTY_ANSWERS, visibleSteps, type Answers } from "@/lib/surveyWizard";
import fixture from "@/lib/__fixtures__/old-survey-help-texts.json";

vi.mock("@/components/AvoidedExercisesPicker", () => ({ AvoidedExercisesPicker: () => <div /> }));
vi.mock("@/components/FavoriteExercisesPicker", () => ({ FavoriteExercisesPicker: () => <div /> }));
vi.mock("@/components/MuscleGroupCombobox", () => ({ MuscleGroupCombobox: () => <div /> }));

const TOKEN = "h".repeat(64);
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/[’]/g, "'").trim();

/** Removed on purpose — each with the decision that removed it. */
const DROPPED: Record<string, string> = {
  "Podpowiedź: BMI wskazuje": "decyzja 23.10: BMI i podpowiedź o BMI widzi tylko trener (profil klienta)",
  "Na tym etapie nie musisz wybierać konkretnych priorytetów": "decyzja 23.10 (pkt 6): początkujący wybiera jedną partię; tekst „Wybierz jedną partię, na której chcesz się skupić. Plan i tak rozwinie całe ciało.”",
  "Na początku łatwo pochopnie ocenić": "decyzja 23.10 (pkt 6): zastąpione tym samym nowym tekstem pod pytaniem",
  "💡 Ta informacja pomoże": "decyzja 23.10 (pkt 9): zdanie bez emoji i bez słowa „treningowy”, tylko na ekranie „Jak często wykonujesz cardio?”",
  "Zaznacz tylko te metody": "decyzja 23.10 (pkt 8): pytanie odwrócone na „Metody do unikania” (stary tekst opisywał metody, które klient CHCE stosować, a zapisywał je jako unikane)",
  "Nie kieruj się wyłącznie liczbą lat treningu": "decyzja 23.10: kłóci się z regułą 2 lat; zastąpione zdaniem „Wybierz opis, który najlepiej do Ciebie pasuje…”",
};

const base: Answers = { ...EMPTY_ANSWERS, firstName: "Ala", lastName: "T", email: "a@example.com", dateOfBirth: "1992-05-10", gender: "Kobieta", heightCm: 168, weightKg: "62", sessionDuration: "45–60 min", desiredWeeklyFrequency: 3 };
const PROFILES: Answers[] = [
  { ...base, trainingGoal: "Redukcja tkanki tłuszczowej", experienceLevel: "Początkujący", trainingLocation: "Dom", injuryStatus: "Tak", activityLevel: "Siedzący", cardioPreference: "Tylko niezbędne minimum", planStylePreference: "Prosty i łatwy do utrzymania" },
  { ...base, trainingGoal: "Cel sportowy", athleteStatus: "Hobbystycznie", experienceLevel: "Zaawansowany", trainingLocation: "Siłownia plenerowa", injuryStatus: "Nie", avoidsAdvancedMethods: "Tak", cardioPreference: "Tak, uwzględnij cardio w planie" },
  { ...base, trainingGoal: "Budowa sylwetki", experienceLevel: "Średniozaawansowany", trainingLocation: "Siłownia", injuryStatus: "Nie", avoidsAdvancedMethods: "Nie" },
  { ...base, trainingGoal: "Poprawa kondycji", experienceLevel: "Brak aktywności fizycznej", trainingLocation: "Siłownia", injuryStatus: "Nie" },
];

function screensText(): string {
  let all = "";
  for (const answers of PROFILES) {
    for (const stepId of visibleSteps(answers)) {
      window.localStorage.setItem(draftKey(TOKEN), JSON.stringify({ v: 1, answers, stepId }));
      const { unmount } = render(
        <QueryClientProvider client={new QueryClient()}>
          <SurveyWizard inviteToken={TOKEN} prefill={{}} />
        </QueryClientProvider>,
      );
      for (const b of screen.queryAllByRole("button", { name: /^Więcej$/ })) fireEvent.click(b);
      all += " " + document.body.textContent;
      unmount();
    }
  }
  return norm(all);
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("helper texts of the old form", () => {
  const visible = screensText();
  const entries = (fixture as { kind: string; text: string }[]).map((f) => ({ ...f, text: norm(f.text) }));

  it("the fixture is complete (guards against an accidentally emptied list)", () => {
    expect(entries.length).toBeGreaterThanOrEqual(45);
    expect(new Set(entries.map((e) => e.kind))).toEqual(new Set(["section", "hint", "note", "option", "recommendation", "bmi"]));
  });

  for (const e of entries) {
    const dropped = Object.keys(DROPPED).find((p) => e.text.startsWith(p));
    if (dropped) {
      it(`removed on purpose: „${e.text.slice(0, 60)}…” — ${DROPPED[dropped]}`, () => {
        expect(visible).not.toContain(e.text);
      });
    } else {
      it(`[${e.kind}] „${e.text.slice(0, 70)}…” is shown`, () => {
        expect(visible).toContain(e.text);
      });
    }
  }
});
