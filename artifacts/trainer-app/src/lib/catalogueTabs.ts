/** Katalog ćwiczeń: zakładka „Rozgrzewka i rozciąganie” jest osobno od ćwiczeń treningowych (decyzja właściciela 26.10.2026). */
export type CatalogueTab = "training" | "warmup";
export const CATALOGUE_TABS: ReadonlyArray<{ id: CatalogueTab; label: string }> = [
  { id: "training", label: "Ćwiczenia treningowe" },
  { id: "warmup", label: "Rozgrzewka i rozciąganie" },
];
const WARMUP_ROLES: readonly string[] = ["rozgrzewka", "rozciąganie"];

export const isWarmupOrStretch = (ex: { role?: string | null }): boolean => !!ex.role && WARMUP_ROLES.includes(ex.role);

export function splitByTab<T extends { role?: string | null }>(list: readonly T[] | undefined, tab: CatalogueTab): T[] {
  return (list ?? []).filter((e) => isWarmupOrStretch(e) === (tab === "warmup"));
}
