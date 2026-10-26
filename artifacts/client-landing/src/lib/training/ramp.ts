/**
 * Warm-up and cool-down are separate from the workout (owner's decision 25.10.2026): each is opened on its own from "Dziś",
 * the cool-down is optional. This keeps only what the "Dziś" screen needs, for the current day, in localStorage.
 */
import type { RampItem } from "./types";

export type RampKind = "warmup" | "cooldown";

export interface RampProgress {
  v: 1;
  /** local date (YYYY-MM-DD) — the record is ignored on any other day */
  date: string;
  planDayId: number;
  warmupDone: boolean;
  cooldownDone: boolean;
  /** cool-down items saved when the workout ends, so the cool-down can still be done after it (offline too) */
  cooldownItems: RampItem[] | null;
  /** joints reported in "Coś boli?" — the cool-down drops stretches that load them */
  painAreas: string[];
}

const KEY = "optimatren-ramp:v1";

export const localDate = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function safeStorage(): Storage {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage; }
}

/** Today's record (any plan day) or null. */
export function loadRamp(storage: Pick<Storage, "getItem"> = safeStorage(), now = new Date()): RampProgress | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RampProgress;
    return r?.v === 1 && r.date === localDate(now) ? r : null;
  } catch { return null; }
}

/** Merge a change into today's record for this plan day (a record of another day or plan day is replaced). */
export function updateRamp(planDayId: number, patch: Partial<Omit<RampProgress, "v" | "date" | "planDayId">>, storage: Pick<Storage, "getItem" | "setItem"> = safeStorage(), now = new Date()): RampProgress {
  const cur = loadRamp(storage, now);
  const base: RampProgress = cur && cur.planDayId === planDayId
    ? cur
    : { v: 1, date: localDate(now), planDayId, warmupDone: false, cooldownDone: false, cooldownItems: null, painAreas: [] };
  const next = { ...base, ...patch };
  try { storage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable — progress lasts for this page only */ }
  return next;
}

export const withoutPainJoints = (items: readonly RampItem[], painAreas: readonly string[]): RampItem[] =>
  items.filter((c) => !(c.joints ?? []).some((j) => painAreas.includes(j)));
