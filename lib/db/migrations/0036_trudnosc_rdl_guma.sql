-- 0036: decyzja właściciela (26.10.2026): Martwy ciąg rumuński z gumą oporową (lekka guma, nauka zawiasu biodrowego) ma trudność nauki 2,
-- żeby mógł trafiać do planów nieaktywnych (silnik wymaga learningDifficulty <= 2). Tylko UPDATE; powtarzalne.
UPDATE exercises SET learning_difficulty = 2 WHERE source_id = 'OG_1009';
