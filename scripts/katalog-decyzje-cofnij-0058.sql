-- COFNIĘCIE migracji 0058 („L-sit z podparciem”): ukrywa i dezaktywuje dodane ćwiczenie (nic nie usuwa). Uruchamiaj ręcznie po pg_dump.
UPDATE exercises SET hidden = true, is_active = false, updated_at = now() WHERE review_batch = 'katalog-decyzje-0058';
