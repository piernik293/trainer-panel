-- Wywiad zablokowany limitem pakietu trenera: znacznik na zaproszeniu, żeby trener zobaczył to w „Wymaga uwagi”. Addytywnie, nullable.
ALTER TABLE survey_invites ADD COLUMN IF NOT EXISTS limit_blocked_at timestamp;
