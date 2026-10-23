/**
 * Effective experience level — the level the generator uses.
 *
 * Rule (approved 23.10.2026, docs/WYWIAD-INWENTARZ.md):
 *   effective = the lower of (client's choice, level implied by training time),
 *   where training time under 2 years allows at most "Początkujący".
 *   Unknown training time (empty / unreadable) → the client's choice stays.
 *   A trainer's manual override (clients.experience_level_override) wins.
 *
 * Applied right after loading the latest survey in every generator path, so
 * the beginner / no-activity safety rules see the effective level.
 */

export const EXPERIENCE_LEVELS = [
  "Brak aktywności fizycznej",
  "Początkujący",
  "Średniozaawansowany",
  "Zaawansowany",
] as const;
export type ExperienceLevelValue = (typeof EXPERIENCE_LEVELS)[number];

const BEGINNER: ExperienceLevelValue = "Początkujący";
export const MIN_YEARS_FOR_INTERMEDIATE = 2;

function rank(level: string | null | undefined): number {
  return level ? (EXPERIENCE_LEVELS as readonly string[]).indexOf(level) : -1;
}

/**
 * Training time in years from the survey text, e.g. "2 lata", "1,5 roku",
 * "pół roku", "18 miesięcy", "3 lata z przerwami". null when unreadable.
 */
export function parseTrainingYears(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(",", ".").trim();
  if (!s) return null;
  if (/pó[łl]\s*roku/.test(s) && !/\d/.test(s)) return 0.5;
  let years = 0;
  let found = false;
  const y = s.match(/(\d+(?:\.\d+)?)\s*(?:lat|lata|rok|roku|r\.|years?)/);
  if (y) {
    years += Number(y[1]);
    found = true;
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:mies|m-c|mc|months?)/);
  if (m) {
    years += Number(m[1]) / 12;
    found = true;
  }
  if (/pó[łl]\s*roku/.test(s)) {
    years += 0.5;
    found = true;
  }
  if (!found) {
    // A bare number ("2") is read as years.
    const n = s.match(/^(\d+(?:\.\d+)?)$/);
    if (!n) return null;
    years = Number(n[1]);
  }
  return Number.isFinite(years) && years >= 0 && years < 100 ? years : null;
}

export interface EffectiveLevel {
  /** What the client chose in the interview. */
  chosen: string | null;
  /** Level the generator uses. */
  effective: string | null;
  trainingYears: number | null;
  /** True when the 2-year rule lowered the level. */
  capped: boolean;
  /** True when the trainer's override decided. */
  overridden: boolean;
}

export function resolveEffectiveLevel(
  chosen: string | null | undefined,
  trainingDuration: string | null | undefined,
  override?: string | null,
): EffectiveLevel {
  const trainingYears = parseTrainingYears(trainingDuration);
  const base = chosen ?? null;
  if (override && rank(override) >= 0) {
    return { chosen: base, effective: override, trainingYears, capped: false, overridden: true };
  }
  const capped =
    trainingYears !== null && trainingYears < MIN_YEARS_FOR_INTERMEDIATE && rank(base) > rank(BEGINNER);
  return { chosen: base, effective: capped ? BEGINNER : base, trainingYears, capped, overridden: false };
}

/** Survey row with experienceLevel replaced by the effective level. */
export function withEffectiveLevel<T extends { experienceLevel?: string | null; trainingDuration?: string | null }>(
  survey: T,
  override?: string | null,
): T {
  const r = resolveEffectiveLevel(survey.experienceLevel, survey.trainingDuration, override);
  return r.effective === (survey.experienceLevel ?? null) ? survey : { ...survey, experienceLevel: r.effective };
}

export function formatYears(years: number): string {
  if (years < 1) {
    const months = Math.round(years * 12);
    return `${months} mies.`;
  }
  const v = Math.round(years * 10) / 10;
  const n = Number.isInteger(v) ? v : v.toLocaleString("pl-PL");
  return `${n} ${v === 1 ? "rok" : Number.isInteger(v) && v % 10 >= 2 && v % 10 <= 4 && (v % 100 < 12 || v % 100 > 14) ? "lata" : "lat"}`;
}

/** Trainer-facing warning text, or null when nothing was changed. */
export function effectiveLevelWarning(r: EffectiveLevel): string | null {
  if (r.overridden && r.effective !== r.chosen) {
    return `Klient wybrał „${r.chosen ?? "—"}”, plan według poziomu ustawionego przez trenera: „${r.effective}”.`;
  }
  if (!r.capped || r.trainingYears === null) return null;
  return `Klient wybrał „${r.chosen}”, staż ${formatYears(r.trainingYears)} — plan jako „${r.effective}”. Możesz to zmienić w profilu klienta.`;
}
