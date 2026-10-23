# Styl B — Energia

Jedno źródło wyglądu dla panelu trenera i portalu klienta: `lib/design-tokens/src/tokens.css`
(zmienne CSS + mapowanie na Tailwind). Przełącznik motywu: `lib/design-tokens/src/index.ts`
(Jasny / Ciemny / Jak w systemie, localStorage z try/catch, domyślnie „Jak w systemie”).
Panel: Ustawienia → Ustawienia aplikacji. Portal: menu konta → Moje konto.

## Zasady
- Akcent (`bg-primary`) rzadko: jeden przycisk główny na ekran; reszta `outline`/link.
- Czerwień (`danger`) tylko dla problemów; status zawsze pigułką z tekstem.
- Przyciski ≥ 44 px (`size="lg"` = 50 px na główne akcje portalu); karty: `bg-card` + 1 px ramki, bez cieni.
- Nowy kod używa klas tokenów: `bg-surface`, `bg-muted`, `text-muted-foreground`, `bg-success-soft text-success`,
  `bg-warning-soft text-warning`, `bg-danger-soft text-danger`, `bg-brand-soft text-primary`, `section-label`, `stat-number`.
- Stare klasy palety Tailwind (`bg-green-100`, `text-amber-700`, …) są przemapowane w tokens.css na tokeny statusów
  (zielone → success, żółte/pomarańczowe → warning, czerwone → danger, niebieskie/fioletowe/szare → neutralne),
  więc działają też w trybie ciemnym. Pomarańcz palety = ostrzeżenie, nie akcent.

## Kontrast (WCAG, wymagane ≥ 4.5:1) — `python3 scripts/contrast-check.py`
`--success-soft` zmienione z #E7F6EC (4.49:1) na #EDF8F0. Statusy w trybie ciemnym dobrane jaśniejsze.

| Para (tekst / tło) | Jasny | Ciemny |
|---|---|---|
| `--text` / `--bg` | 16.74 ✓ | 17.17 ✓ |
| `--text` / `--surface` | 17.49 ✓ | 15.76 ✓ |
| `--text` / `--surface-2` | 15.22 ✓ | 14.03 ✓ |
| `--text-muted` / `--surface` | 7.63 ✓ | 6.82 ✓ |
| `--text-muted` / `--bg` | 7.30 ✓ | 7.43 ✓ |
| `--text-muted` / `--surface-2` | 6.64 ✓ | 6.07 ✓ |
| `--accent-text` / `--accent` | 5.18 ✓ | 5.76 ✓ |
| `--accent-text` / `--accent-hover` | 7.36 ✓ | 7.49 ✓ |
| `--accent` / `--surface` | 5.18 ✓ | 5.66 ✓ |
| `--accent` / `--accent-soft` | 4.69 ✓ | 4.91 ✓ |
| `--accent` / `--bg` | 4.96 ✓ | 6.17 ✓ |
| `--danger` / `--danger-soft` | 5.75 ✓ | 5.79 ✓ |
| `--danger` / `--surface` | 6.57 ✓ | 6.22 ✓ |
| `--warning` / `--warning-soft` | 6.15 ✓ | 9.38 ✓ |
| `--warning` / `--surface` | 6.85 ✓ | 11.23 ✓ |
| `--success` / `--success-soft` | 4.61 ✓ | 8.82 ✓ |
| `--success` / `--surface` | 5.02 ✓ | 9.87 ✓ |
| `--text` / `--accent-soft` | 15.84 ✓ | 13.66 ✓ |
| `--danger-text` / `--danger` | 6.57 ✓ | 6.32 ✓ |
