// Joint-load data check shared by every selection path (no imports on purpose: used by warmupSelection and jointExclusion without a cycle).
/**
 * Decision 3a (owner, 28.10.2026): an exercise WITHOUT filled joint-load data (level missing, joint list missing, or a list that is empty while the level
 * is not "Niskie") is never given to a client who reported a joint / pain, nor in the "no health consent" mode — we cannot know what it loads.
 */
export function lacksJointData(ex: { jointStress?: string | null; jointStressAreas?: readonly string[] | null }): boolean {
  const level = ex.jointStress?.trim();
  if (!level) return true;
  if (ex.jointStressAreas == null) return true;
  return ex.jointStressAreas.length === 0 && level !== "Niskie";
}
export const withheldForUnknownJoints = (
  ex: { jointStress?: string | null; jointStressAreas?: readonly string[] | null },
  blocked: ReadonlySet<string>,
  conservative: boolean,
): boolean => (blocked.size > 0 || conservative) && lacksJointData(ex);
