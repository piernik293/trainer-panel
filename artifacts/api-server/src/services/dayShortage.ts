/**
 * Decision 51 (28.10.2026): a day may have 3 exercises (minimum 3 instead of 4); below 3 it is refused. Either way the trainer gets the same
 * short message in plain words: what is missing and what would help. Pure function.
 */
import { expandEquipmentForLocation, homeWithoutBackEquipment, normalizeEquipmentList } from "./equipmentNormalizer";

export const MIN_DAY_EXERCISES = 3;
/** The comfortable size of a day: below it the trainer is told why the day is shorter. */
export const FULL_DAY_EXERCISES = 4;

const PULLING_DAYS = new Set(["pull", "upper", "full_body", "plyo"]);

export function dayShortageMessage(a: {
  sessionType: string;
  effectiveLevel: string | null | undefined;
  location: string | null | undefined;
  equipmentText: string | null | undefined;
  blockedJoints: ReadonlySet<string>;
}): string {
  const equipment = expandEquipmentForLocation(normalizeEquipmentList(a.equipmentText), a.location);
  const home = (a.location ?? "").trim().toLowerCase() === "dom";
  if (PULLING_DAYS.has(a.sessionType) && homeWithoutBackEquipment(a.location, equipment)) {
    return "Mało ćwiczeń na plecy bez sprzętu. Dodaj gumę albo drążek, a plan będzie pełniejszy.";
  }
  if (a.blockedJoints.size > 0) {
    return `Zgłoszony ból (${[...a.blockedJoints].map((j) => j.toLowerCase()).join(", ")}) ogranicza wybór ćwiczeń w tym dniu. Dodaj ćwiczenia ręcznie albo poczekaj z tym dniem, a plan będzie pełniejszy.`;
  }
  if (a.effectiveLevel === "Brak aktywności fizycznej" || a.effectiveLevel === "Początkujący") {
    return "Dla osoby początkującej mamy w tym dniu mało sprawdzonych ćwiczeń. Dodaj ćwiczenia ręcznie albo wybierz inny typ dnia.";
  }
  if (home || (a.location ?? "").toLowerCase().includes("plener")) {
    return "Mało ćwiczeń przy takim sprzęcie. Dodaj hantle albo gumę, a plan będzie pełniejszy.";
  }
  return "Mało ćwiczeń pasujących do tego klienta w tym dniu. Dodaj ćwiczenia ręcznie albo zmień typ dnia, a plan będzie pełniejszy.";
}
