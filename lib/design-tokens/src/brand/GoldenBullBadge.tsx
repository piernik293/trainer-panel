/** Odznaka „Złoty Byczek” (zatwierdzony projekt) — dla pierwszych trenerów i osób Solo (kampania, docs/CENNIK.md). */
export function GoldenBullBadge({ size = 48, className, decorative = false }: { size?: number; className?: string; decorative?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "Odznaka Złoty Byczek"} aria-hidden={decorative ? true : undefined} focusable="false" data-testid="golden-bull-badge">
      <circle cx="50" cy="54" r="40" fill="#B7791F" />
      <circle cx="50" cy="54" r="33" fill="none" stroke="#F2C14E" strokeWidth="3" />
      <path d="M30 40 C 22 34, 22 24, 28 18 C 28 28, 34 32, 40 34 Z" fill="#FFF4D6" />
      <path d="M70 40 C 78 34, 78 24, 72 18 C 72 28, 66 32, 60 34 Z" fill="#FFF4D6" />
      <rect x="34" y="32" width="32" height="38" rx="15" fill="#F2C14E" />
      <rect x="34" y="38" width="32" height="5" fill="#B7791F" />
      <rect x="40" y="56" width="20" height="12" rx="6" fill="#FFF4D6" />
    </svg>
  );
}
