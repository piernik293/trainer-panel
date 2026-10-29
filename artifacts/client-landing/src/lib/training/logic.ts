import type { ExerciseInfo, PrevSet } from "./types";

export interface LoggedSet { weightKg: number | null; reps: number | null; durationSeconds?: number | null; rir: number | null; skipped?: boolean }

/** Round to 2 decimals (avoids 0.1 + 0.2 artefacts when stepping by 2.5 / 1 kg). */
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function stepWeight(current: number | null, direction: 1 | -1, stepKg: number): number {
  return Math.max(0, round2((current ?? 0) + direction * stepKg));
}
export function stepReps(current: number | null, direction: 1 | -1): number {
  return Math.max(0, Math.min(200, (current ?? 0) + direction));
}

/** Accepts "62,5" and "62.5"; returns null for empty/invalid or out-of-range input. */
export function parseDecimal(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? round2(n) : null;
}
export function parseIntStrict(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 200 ? n : null;
}

/**
 * Starting values of a set: the set already saved just before it today; else reps from the plan (lower end of the
 * range) and weight from the previous session (the same set, or its last one) — the plan carries no kilograms.
 */
export function startValues(ex: ExerciseInfo, setNumber: number, today: Record<number, LoggedSet | undefined>): LoggedSet {
  const before = today[setNumber - 1];
  if (ex.timed) {
    // Ćwiczenie na czas: czas z planu (albo ostatnio wykonany), klient tylko potwierdza.
    const prevT: PrevSet | undefined = ex.previous.find((p) => p.setNumber === setNumber) ?? ex.previous[ex.previous.length - 1];
    const sec = (before && !before.skipped ? before.durationSeconds : null) ?? prevT?.durationSeconds ?? ex.seconds ?? null;
    return { weightKg: null, reps: null, durationSeconds: sec, rir: null };
  }
  if (before && !before.skipped && (before.reps != null || before.weightKg != null)) {
    return { weightKg: before.weightKg, reps: before.reps, rir: null };
  }
  // Powtórzenia z planu (dolny koniec zakresu), ciężar z poprzedniego treningu (ta sama seria albo ostatnia) — klient zmienia tylko, gdy zrobił inaczej.
  const prev: PrevSet | undefined = ex.previous.find((p) => p.setNumber === setNumber) ?? ex.previous[ex.previous.length - 1];
  return { weightKg: prev?.weightKg ?? null, reps: ex.repMin ?? prev?.reps ?? null, rir: null };
}

export function formatKg(n: number | null): string {
  return n == null ? "–" : `${String(round2(n)).replace(".", ",")} kg`;
}
export function formatSetResult(s: { weightKg: number | null; reps: number | null; durationSeconds?: number | null }, showWeight = true): string {
  if (s.durationSeconds != null && s.reps == null) return `${s.durationSeconds} s`;
  if (s.reps == null && s.weightKg == null) return "–";
  const w = showWeight && s.weightKg ? `${formatKg(s.weightKg)} × ` : "";
  return `${w}${s.reps ?? "–"}`;
}

/** "3 × 8–10 · RIR 2 · przerwa ok. 2 min" */
export function formatTarget(ex: Pick<ExerciseInfo, "sets" | "reps" | "rir" | "restText">): string {
  const parts = [`${ex.sets} × ${ex.reps}`];
  if (ex.rir != null) parts.push(`RIR ${ex.rir}`);
  parts.push(`przerwa ${ex.restText.startsWith("ok.") ? ex.restText : `ok. ${ex.restText}`}`);
  return parts.join(" · ");
}

/**
 * Record rule (mirrors api-server/services/training.ts recordGain): the set's weight is higher
 * than the best weight ever lifted for the same or more repetitions. First time ever: no record.
 */
export function recordGain(history: readonly { weightKg: number; reps: number }[], set: LoggedSet): number | null {
  if (set.weightKg == null || set.reps == null || set.reps <= 0 || set.weightKg <= 0) return null;
  if (history.length === 0) return null;
  const best = history.filter((h) => h.reps >= set.reps!).reduce((m, h) => Math.max(m, h.weightKg), 0);
  return set.weightKg > best ? round2(set.weightKg - best) : null;
}

export function formatRestShort(text: string): string {
  return text.replace(/\bmin–/, "–").replace(/(\d)\s*min–(\d)/, "$1–$2");
}
