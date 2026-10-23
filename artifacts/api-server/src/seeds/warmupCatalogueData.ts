/**
 * Warm-up and stretching exercises (docs/TRENING.md §6, approved 23.10.2026 with corrections:
 * joint tags, #28 added, #10 = the existing Band Pull-Apart row — gets the role, no duplicate).
 * Fields follow docs/KATALOG-STANDARD.md. `nr` is the number in the approved list.
 */
export interface WarmupCatalogueEntry {
  nr: number;
  name: string;
  slug: string;
  /** set when the exercise already exists in the catalogue (only role and amount are written) */
  existingSlug?: string;
  role: "rozgrzewka" | "rozciąganie";
  main: string;
  secondary: string[];
  pattern: string;
  type: "Złożone" | "Izolowane";
  learning: 1 | 2;
  reps: number | null;
  secs: number | null;
  perSide: boolean;
  equipment: string[];
  /** joints stressed — the generator does not offer the exercise to a client who reported pain there */
  joints: string[];
  location: string[];
  /** null = not confirmed for inactive clients ("do weryfikacji") */
  suitable: boolean | null;
  instr: string;
}

export const WARMUP_CATALOGUE: WarmupCatalogueEntry[] = [
  { nr: 1, name: "Marsz w miejscu", slug: "marsz-w-miejscu", role: "rozgrzewka", main: "Całe ciało", secondary: [], pattern: "Lokomocja", type: "Złożone", learning: 1, reps: null, secs: 60, perSide: false, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Maszeruj w miejscu, unosząc kolana na wygodną wysokość. Ramiona pracują swobodnie, oddychaj spokojnie." },
  { nr: 2, name: "Krążenia ramion", slug: "krazenia-ramion", role: "rozgrzewka", main: "Barki", secondary: [], pattern: "Mobilizacja", type: "Izolowane", learning: 1, reps: 10, secs: null, perSide: true, equipment: ["Masa własnego ciała"], joints: ["Bark"], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Stań wyprostowany. Zataczaj duże, powolne koła wyprostowanymi ramionami, w przód i w tył. Zakres zwiększaj stopniowo." },
  { nr: 3, name: "Krążenia bioder", slug: "krazenia-bioder", role: "rozgrzewka", main: "Pośladki", secondary: ["Odwodziciele"], pattern: "Mobilizacja", type: "Izolowane", learning: 1, reps: 10, secs: null, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Ręce na biodrach, stopy na szerokość barków. Zataczaj duże koła biodrami, bez pośpiechu." },
  { nr: 4, name: "Skręty tułowia", slug: "skrety-tulowia", role: "rozgrzewka", main: "Brzuch", secondary: ["Plecy"], pattern: "Mobilizacja", type: "Izolowane", learning: 1, reps: 10, secs: null, perSide: true, equipment: ["Masa własnego ciała"], joints: ["Plecy — dół"], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Stopy na szerokość barków, ramiona zgięte przed klatką. Skręcaj tułów raz w jedną, raz w drugą stronę, biodra stabilne." },
  { nr: 5, name: "Krążenia nadgarstków i łokci", slug: "krazenia-nadgarstkow-i-lokci", role: "rozgrzewka", main: "Przedramiona", secondary: [], pattern: "Mobilizacja", type: "Izolowane", learning: 1, reps: 10, secs: null, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Zataczaj małe i duże koła nadgarstkami, potem łokciami, w obie strony." },
  { nr: 6, name: "Kot–krowa", slug: "kotkrowa", role: "rozgrzewka", main: "Plecy", secondary: [], pattern: "Mobilizacja", type: "Izolowane", learning: 1, reps: 10, secs: null, perSide: false, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "W podporze na czworakach wyginaj plecy w górę (kot) i w dół (krowa), w rytmie oddechu." },
  { nr: 7, name: "Przysiad powitalny", slug: "przysiad-powitalny", role: "rozgrzewka", main: "Mięśnie czworogłowe uda", secondary: ["Pośladki"], pattern: "Przysiad", type: "Złożone", learning: 2, reps: 10, secs: null, perSide: false, equipment: ["Masa własnego ciała"], joints: ["Kolano"], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Stopy na szerokość barków, ramiona przed sobą. Zejdź w przysiad tak głęboko, jak to komfortowe, kolana w linii stóp, wróć do stania." },
  { nr: 8, name: "Wykroki chodzone (rozgrzewka)", slug: "wykroki-chodzone-rozgrzewka", role: "rozgrzewka", main: "Mięśnie czworogłowe uda", secondary: ["Pośladki"], pattern: "Wykrok", type: "Złożone", learning: 2, reps: 8, secs: null, perSide: true, equipment: ["Masa własnego ciała"], joints: ["Kolano"], location: ["Siłownia", "Dom", "Plener"], suitable: null,
    instr: "Zrób krok do przodu i opuść biodra, tułów prosto. Odepchnij się i przejdź do kolejnego kroku. W razie potrzeby przytrzymaj się ściany." },
  { nr: 9, name: "Mostek pośladkowy", slug: "mostek-posladkowy", role: "rozgrzewka", main: "Pośladki", secondary: ["Mięśnie dwugłowe uda"], pattern: "Aktywacja", type: "Izolowane", learning: 1, reps: 12, secs: null, perSide: false, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Leżąc na plecach ze zgiętymi kolanami unieś biodra, ściśnij pośladki na górze i wolno opuść." },
  { nr: 10, name: "Ściąganie łopatek z gumą (Band Pull-Apart)", slug: "sciaganie-lopatek-z-guma-band-pull-apart", existingSlug: "rozciaganie-gumy-przed-klatka-band-pull-apart", role: "rozgrzewka", main: "Barki", secondary: ["Plecy"], pattern: "Aktywacja", type: "Izolowane", learning: 2, reps: 15, secs: null, perSide: false, equipment: ["Gumy oporowe"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Trzymaj gumę przed sobą na wysokości klatki. Rozciągaj ją na boki, ściągając łopatki, i wolno wracaj." },
  { nr: 11, name: "Rotacje zewnętrzne z gumą", slug: "rotacje-zewnetrzne-z-guma", role: "rozgrzewka", main: "Barki", secondary: [], pattern: "Aktywacja", type: "Izolowane", learning: 2, reps: 12, secs: null, perSide: true, equipment: ["Gumy oporowe"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Łokieć przy boku zgięty do 90°, guma w dłoni. Obracaj przedramię na zewnątrz, kontrolowanie wracaj." },
  { nr: 12, name: "Pompki ścienne", slug: "pompki-scienne", role: "rozgrzewka", main: "Klatka piersiowa", secondary: ["Triceps"], pattern: "Pchanie poziome", type: "Złożone", learning: 1, reps: 10, secs: null, perSide: false, equipment: ["Masa własnego ciała"], joints: ["Bark", "Nadgarstek"], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Stań przodem do ściany, dłonie na ścianie na wysokości barków. Zegnij łokcie, przybliż klatkę do ściany i wypchnij się." },
  { nr: 13, name: "Deska na przedramionach", slug: "deska-na-przedramionach", role: "rozgrzewka", main: "Brzuch", secondary: [], pattern: "Stabilizacja tułowia", type: "Izolowane", learning: 2, reps: null, secs: 20, perSide: false, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Oprzyj się na przedramionach i palcach stóp, ciało w jednej linii. Napnij brzuch i oddychaj spokojnie." },
  { nr: 14, name: "Wspięcia na palce", slug: "wspiecia-na-palce", role: "rozgrzewka", main: "Łydki", secondary: [], pattern: "Wspięcie na palce", type: "Izolowane", learning: 1, reps: 15, secs: null, perSide: false, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Stań prosto, ewentualnie przytrzymaj się ściany. Wspinaj się na palce i wolno opuszczaj pięty." },
  { nr: 15, name: "Rowerek stacjonarny (lekki)", slug: "rowerek-stacjonarny-lekki", role: "rozgrzewka", main: "Całe ciało", secondary: [], pattern: "Lokomocja", type: "Złożone", learning: 1, reps: null, secs: 240, perSide: false, equipment: ["Maszyna"], joints: [], location: ["Siłownia", "Dom"], suitable: true,
    instr: "Pedałuj lekko, w tempie pozwalającym swobodnie rozmawiać. Siodełko na wysokości bioder." },
  { nr: 16, name: "Rozciąganie klatki przy ścianie", slug: "rozciaganie-klatki-przy-scianie", role: "rozciąganie", main: "Klatka piersiowa", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Oprzyj ramię o ścianę i obróć tułów od ściany, aż poczujesz rozciąganie klatki. Oddychaj spokojnie." },
  { nr: 17, name: "Rozciąganie barku (ramię w poprzek)", slug: "rozciaganie-barku-ramie-w-poprzek", role: "rozciąganie", main: "Barki", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Przyciągnij wyprostowane ramię w poprzek klatki drugą ręką. Bark rozluźniony." },
  { nr: 18, name: "Rozciąganie tricepsa (za głową)", slug: "rozciaganie-tricepsa-za-glowa", role: "rozciąganie", main: "Triceps", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Zegnij ramię za głową, łokieć w górze, drugą dłonią delikatnie dociskaj łokieć." },
  { nr: 19, name: "Rozciąganie bicepsa przy ścianie", slug: "rozciaganie-bicepsa-przy-scianie", role: "rozciąganie", main: "Biceps", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Dłoń na ścianie za sobą, ramię wyprostowane. Obracaj tułów od ściany, aż poczujesz rozciąganie." },
  { nr: 20, name: "Pozycja dziecka", slug: "pozycja-dziecka", role: "rozciąganie", main: "Plecy", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 40, perSide: false, equipment: ["Masa własnego ciała"], joints: ["Kolano"], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Z pozycji na czworakach usiądź pośladkami na piętach, ramiona wyciągnij do przodu. Oddychaj głęboko." },
  { nr: 21, name: "Rozciąganie czworogłowego (stojąc, przy ścianie)", slug: "rozciaganie-czworoglowego-stojac-przy-scianie", role: "rozciąganie", main: "Mięśnie czworogłowe uda", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Przytrzymaj się ściany, chwyć stopę i przyciągnij piętę do pośladka. Kolana blisko siebie, tułów prosto." },
  { nr: 22, name: "Rozciąganie tylnej części uda (siad)", slug: "rozciaganie-tylnej-czesci-uda-siad", role: "rozciąganie", main: "Mięśnie dwugłowe uda", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "W siadzie wyprostuj jedną nogę. Pochyl się od bioder, plecy proste, bez bólu." },
  { nr: 23, name: "Rozciąganie pośladka (leżąc, „czwórką”)", slug: "rozciaganie-posladka-lezac-czworka", role: "rozciąganie", main: "Pośladki", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Leżąc na plecach, skrzyżuj nogi „czwórką” i przyciągnij kolano do klatki." },
  { nr: 24, name: "Rozciąganie łydki przy ścianie", slug: "rozciaganie-lydki-przy-scianie", role: "rozciąganie", main: "Łydki", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Dłonie na ścianie, jedna noga z tyłu, pięta na podłodze, kolano wyprostowane. Przesuń biodra do przodu." },
  { nr: 25, name: "Rozciąganie przywodzicieli (siad skrzyżny)", slug: "rozciaganie-przywodzicieli-siad-skrzyzny", role: "rozciąganie", main: "Przywodziciele", secondary: [], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 30, perSide: false, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Usiądź ze złączonymi stopami, kolana opuść na boki. Plecy proste, delikatnie dociskaj kolana." },
  { nr: 26, name: "Skłon boczny stojąc", slug: "sklon-boczny-stojac", role: "rozciąganie", main: "Brzuch", secondary: ["Plecy"], pattern: "Rozciąganie", type: "Izolowane", learning: 1, reps: null, secs: 20, perSide: true, equipment: ["Masa własnego ciała"], joints: ["Plecy — dół"], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Stopy na szerokość barków, jedno ramię nad głową. Pochyl tułów na bok, miednica stabilna." },
  { nr: 27, name: "Rozciąganie zginaczy biodra (wykrok klęczny)", slug: "rozciaganie-zginaczy-biodra-wykrok-kleczny", role: "rozciąganie", main: "Mięśnie czworogłowe uda", secondary: ["Pośladki"], pattern: "Rozciąganie", type: "Izolowane", learning: 2, reps: null, secs: 30, perSide: true, equipment: ["Masa własnego ciała"], joints: ["Kolano"], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Uklęknij na jednym kolanie (podłóż miękką podkładkę), druga stopa z przodu. Przesuń biodra do przodu, tułów prosto." },
  { nr: 28, name: "Wymachy nóg (w przód i w bok)", slug: "wymachy-nog-w-przod-i-w-bok", role: "rozgrzewka", main: "Mięśnie dwugłowe uda", secondary: ["Pośladki", "Odwodziciele"], pattern: "Mobilizacja", type: "Izolowane", learning: 1, reps: 10, secs: null, perSide: true, equipment: ["Masa własnego ciała"], joints: [], location: ["Siłownia", "Dom", "Plener"], suitable: true,
    instr: "Stań bokiem do ściany i oprzyj o nią dłoń. Wykonuj spokojne wymachy nogą w przód i w tył, potem w bok, zakres zwiększaj stopniowo." },
];
