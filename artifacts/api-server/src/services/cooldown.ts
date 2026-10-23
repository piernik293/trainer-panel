/**
 * Static cool-down template (stretching) by day type. Used until the stretching
 * exercises proposed in docs/TRENING.md are accepted into the catalogue.
 * Every item is a simple bodyweight stretch (safe for beginners and inactive clients).
 */
import type { DayType, RampItem } from "./rampWarmup";

const UPPER: RampItem[] = [
  { name: "Rozciąganie klatki przy ścianie", detail: "30 s na stronę", description: "Ramię oparte o ścianę, obróć tułów od ściany, oddychaj spokojnie." },
  { name: "Rozciąganie barku (ramię w poprzek)", detail: "30 s na stronę", description: "Przyciągnij ramię do klatki drugą ręką, bark rozluźniony." },
  { name: "Rozciąganie tricepsa (za głową)", detail: "30 s na stronę", description: "Łokieć w górze, dłoń za głową, delikatnie dociskaj." },
  { name: "Pozycja dziecka", detail: "40 s", description: "Pośladki na piętach, ramiona wyciągnięte do przodu, głęboki oddech." },
];
const LOWER: RampItem[] = [
  { name: "Rozciąganie czworogłowego (stojąc, przy ścianie)", detail: "30 s na nogę", description: "Pięta do pośladka, kolana blisko siebie, tułów prosto." },
  { name: "Rozciąganie tylnej części uda (siad, noga wyprostowana)", detail: "30 s na nogę", description: "Pochyl się od bioder, plecy proste, bez bólu." },
  { name: "Rozciąganie pośladka (leżąc, noga „czwórką”)", detail: "30 s na nogę", description: "Przyciągnij kolano do klatki, rozluźnij barki." },
  { name: "Rozciąganie łydki przy ścianie", detail: "30 s na nogę", description: "Pięta tylnej nogi na podłodze, kolano wyprostowane." },
];
const FULL: RampItem[] = [UPPER[0]!, UPPER[3]!, LOWER[0]!, LOWER[2]!];

export function getCooldown(dayType: DayType): RampItem[] {
  return dayType === "upper" ? UPPER : dayType === "lower" ? LOWER : FULL;
}
