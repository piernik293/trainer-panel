# Dziennik importu ćwiczeń z paczek

Narzędzie: `scripts/baza/import-paczka.ts` (logika `artifacts/api-server/src/services/paczkaImport.ts`). Domyślnie dry-run; zapis tylko z `--apply` po „importuj” od właściciela. Każdy wpis niżej dopisuje skrypt.
Uruchomienie: `set -a; . ./.env; set +a; pnpm --filter @workspace/api-server exec tsx ../../scripts/baza/import-paczka.ts <plik.csv> [--apply] [--batch NAZWA]`; cofnięcie: `… --rollback NAZWA`.
(Wpisy z testów na bazie testowej nie są zapisywane do tego pliku.)
