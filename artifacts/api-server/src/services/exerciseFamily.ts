/**
 * „Ten sam wzorzec” w jednym dniu treningowym: warianty tego samego ruchu (np. dipy na poręczach i dipy na ławce,
 * dwa rodzaje pompek, dwa podciągania) to stopnie jednej drabinki — w jednym dniu wystarczy jeden.
 * Rodzina wynika z nazwy ćwiczenia (bez zmiany nazw w katalogu); null = brak ograniczenia.
 * Szersze wzorce (np. dwa wiosłowania, dwa wyciskania) zostają dozwolone — to zwykła objętość na jedną partię.
 */
const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").trim();

const RULES: Array<[RegExp, string]> = [
  [/dip/, "dipy"],
  [/(^|\s)pompk(?!.*(wybici|klask))/, "pompki"], // pompki z wybiciem/klaskaniem to blok pliometryczny, nie ta rodzina
  [/^podciag(anie|nac|ac)\b(?!.*(kolan|nog|bioder))|negatyw\w* podciag/, "podciaganie"],
  [/^martwy ciag/, "martwy ciag"],
  [/^(przysiad)\b(?!.*(wykroczn|bulgarsk|wyskok|skok))/, "przysiad"],
  [/wykrok|przysiad wykroczny|przysiad bulgarski/, "wykrok"],
];

export function exerciseFamily(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = strip(name);
  for (const [re, key] of RULES) if (re.test(n)) return key;
  return null;
}

/** Ile razy w liście ćwiczeń dnia powtarza się rodzina (suma nadwyżek); do metryki symulacji. */
export function familyDuplicates(names: ReadonlyArray<string>): number {
  const seen = new Map<string, number>();
  for (const n of names) { const f = exerciseFamily(n); if (f) seen.set(f, (seen.get(f) ?? 0) + 1); }
  let extra = 0; for (const c of seen.values()) if (c > 1) extra += c - 1;
  return extra;
}

/** Zostawia pierwsze ćwiczenie z każdej rodziny (kolejność dnia bez zmian). */
export function dropFamilyDuplicates<T extends { name: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((e) => { const f = exerciseFamily(e.name); if (!f) return true; if (seen.has(f)) return false; seen.add(f); return true; });
}
