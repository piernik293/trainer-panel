# Własny plan w Solo (flaga `OWN_PLAN_ENABLED`, domyślnie wyłączona)

Osoba bez trenera („Plan” → „Mam własny plan”; także na karcie „Ułóż swój plan”) wpisuje albo wczytuje swój plan i dalej go zmienia. Plan jest zwykłym aktywnym planem, więc stoper przerw, rekordy i osiągnięcia działają tak samo jak przy planie z generatora.

**Włączenie:** `OWN_PLAN_ENABLED=1` w `.env` + restart. Karta pojawia się tylko u osoby bez trenera, czyli wymaga też `SOLO_ENABLED=1` (Solo jest osobną flagą — jej nie włączam bez Twojej decyzji).

## Co umie
- Edytor na telefon (375 px, przyciski ≥ 44 px): dni → ćwiczenia → serie × powtórzenia (od–do), ciężar, RIR 0–4, przerwa, notatka; zmiana kolejności, usuwanie, dodawanie dni (do 7) i ćwiczeń (do 15 w dniu).
- Wyszukiwarka ćwiczeń z katalogu (fragment nazwy, bez polskich znaków); gdy nie ma — „Dodaj własne: …”.
- Wczytanie z pliku Excel/CSV: ten sam silnik co u trenera (`services/planImportParse.ts`: odczyt, zgadnięcie kolumn, dopasowanie nazw do katalogu). Pewne dopasowanie (≥ 0,6) bierze ćwiczenie z katalogu, reszta zostaje „własnym”. Nic nie trafia do planu bez zapisu w edytorze (to jest ekran sprawdzenia). Szablon pliku do pobrania.
- Edycja w miejscu: numery dni i ćwiczeń zostają, więc zapisane serie i rekordy nie tracą powiązania; usunięte ćwiczenia znikają z planu (zapisane serie zostają w historii).

## Bezpieczeństwo (plan jest użytkownika — nie blokujemy)
Przy ćwiczeniu obciążającym staw, w którym osoba zgłosiła ból w ostatnich 30 dniach, jest spokojne ostrzeżenie („Zgłaszałeś ból: kolano. To ćwiczenie może to obciążać — jeśli coś boli, pomiń je albo zamień.”); przy ćwiczeniu własnym — ogólne („nie wiemy, co obciąża”). Ostrzeżenie widać w wyszukiwarce, w wierszu ćwiczenia i po zapisie. Bez zgłoszonego bólu — bez ostrzeżeń.

## Dane
- Migracja `0074` (addytywna; kopia `~/backups/trainer_panel_przed_0074_*`): `exercises.created_by_client_id`. Ćwiczenia własne osoby są **nieaktywne i ukryte** (`is_active=false`, `hidden=true`), więc nie trafiają do katalogu, generatora, list trenerów ani zamiany ćwiczeń; trening i plan je wyświetlają. Jedno ćwiczenie na nazwę (ponowne użycie).
- Plan bez wywiadu dostaje wywiad-zaślepkę (`additionalInfo = "[plan własny — bez wywiadu]"`, poziom „Początkujący”), której nie liczy się jako prawdziwego wywiadu: generator ją ignoruje („Ułóż mój plan” poprosi o pytania), a status konta nie mówi „masz wywiad”.

## Ograniczenia
Import nie ma ręcznego mapowania kolumn (używa zgadniętego); gdy kolumn nie rozpozna — komunikat i szablon. Zamiana ćwiczenia (Solo „Zamień na inne”) na ćwiczeniu własnym nie ma alternatyw. Import ze zdjęcia — po becie.
