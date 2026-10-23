import type { AttentionItem } from "./dashboardApi";

const MONTHS_GEN = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];
const WEEKDAYS = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

/** "2026-10-22" → "Czwartek, 22 października" (the date is a calendar day, no timezone shifts). */
export function formatPolishDate(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? few : many;
}

export function headerSentence(attentionTotal: number, todayCount: number): string {
  const parts: string[] = [];
  if (attentionTotal > 0) {
    parts.push(
      `${attentionTotal} ${plural(attentionTotal, "sprawa czeka", "sprawy czekają", "spraw czeka")} na Twoją reakcję.`,
    );
  }
  if (todayCount > 0) {
    parts.push(`Dziś masz ${todayCount} ${plural(todayCount, "trening", "treningi", "treningów")}.`);
  }
  return parts.length > 0 ? parts.join(" ") : "Wszystko na bieżąco.";
}

/** "kiedy" column of an attention row, relative to the day of `todayIso`. */
export function formatWhen(item: Pick<AttentionItem, "kind" | "at">, todayIso: string): string {
  const day = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);
  const diff = day(todayIso) - day(item.at);
  if (item.kind === "plan_ending") {
    const left = -diff;
    if (left < 0) return `${-left} ${plural(-left, "dzień", "dni", "dni")} temu`;
    if (left === 0) return "dziś";
    if (left === 1) return "jutro";
    return `za ${left} dni`;
  }
  if (diff <= 0) return "dziś";
  if (diff === 1) return "wczoraj";
  return `${diff} dni temu`;
}

export const EVENT_TEXT = {
  interview_submitted: "wypełnił(a) wywiad",
  plan_activated: "plan został aktywowany",
  portal_joined: "założył(a) konto w portalu",
} as const;
