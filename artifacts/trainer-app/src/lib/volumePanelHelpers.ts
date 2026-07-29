/**
 * Pure helpers for VolumePanel beginner/no-activity presentation.
 * Kept in a separate, dependency-free module so they can be unit-tested
 * without importing the React component tree.
 */

export const BEGINNER_VOLUME_LEVELS = new Set([
  "Brak aktywności fizycznej",
  "Początkujący",
]);

/**
 * Lowercase keyword fragments that identify the four "smaller" muscle targets
 * shown in the collapsed section for beginner / no-activity clients.
 */
export const SMALLER_MUSCLE_KEYWORDS = [
  "łydki",
  "trójgłowy łydki",
  "przywodziciel",
  "trójgłowy ramienia",
  "dwugłowy ramienia",
];

/**
 * True when the given muscle target name belongs to the "smaller" group
 * (calves, adductors, triceps, biceps) that is collapsed by default for
 * beginner and no-activity clients.
 */
export function isSmallerTarget(muscleName: string): boolean {
  const lower = muscleName.toLowerCase();
  return SMALLER_MUSCLE_KEYWORDS.some((kw) => lower.includes(kw));
}
