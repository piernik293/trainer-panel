/**
 * Central feature-status registry.
 *
 * Add a key here when a module is not yet fully complete.
 * Remove (or set to "ready") when the feature ships — the badge disappears
 * automatically without touching any component files.
 *
 * Statuses:
 *   "in_progress" → shows "W trakcie" badge
 *   "planned"     → shows "Planowane" badge
 *   "ready"       → no badge rendered (default for unlisted keys)
 */

export type FeatureStatus = "in_progress" | "ready" | "planned";

/** Map of feature key → current development status. */
export const featureStatuses: Record<string, FeatureStatus> = {
  cardio_section: "in_progress",
};

/** Look up a feature's status; returns "ready" for unknown keys. */
export function getFeatureStatus(key: string): FeatureStatus {
  return featureStatuses[key] ?? "ready";
}
