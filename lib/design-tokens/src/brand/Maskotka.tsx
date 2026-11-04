/**
 * Byczek — maskotka Optimatren (zatwierdzony projekt, 6 stanów). SVG i animacje CSS (brand.css): bez bibliotek i plików z internetu.
 * Przy prefers-reduced-motion byczek stoi nieruchomo (brand.css). Gdy będzie grafika od grafika (Lottie/Rive/SVG), podmienia się wnętrze tego komponentu
 * (docs/MASKOTKA.md) — miejsca użycia zostają bez zmian.
 */
export type MaskotkaStan = "idle" | "walk" | "lift" | "success" | "loading" | "error";
export type MaskotkaRozmiar = "s" | "m" | "l";
export const MASKOTKA_STANY: readonly MaskotkaStan[] = ["idle", "walk", "lift", "success", "loading", "error"];
export const MASKOTKA_PX: Record<MaskotkaRozmiar, number> = { s: 64, m: 120, l: 190 };
const NAZWA: Record<MaskotkaStan, string> = { idle: "stoi", walk: "idzie", lift: "podnosi sztangę", success: "cieszy się", loading: "czeka", error: "wzrusza ramionami" };

export function Maskotka({ stan = "idle", rozmiar = "m", decorative = false, className }: { stan?: MaskotkaStan; rozmiar?: MaskotkaRozmiar; /** tylko ozdoba (obok jest tekst) — ukryty dla czytników */ decorative?: boolean; className?: string }) {
  const w = MASKOTKA_PX[rozmiar];
  return (
    <svg className={`bull s-${stan}${className ? ` ${className}` : ""}`} width={w} height={Math.round((w * 220) / 200)} viewBox="0 0 200 220"
      role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `Byczek: ${NAZWA[stan]}`} aria-hidden={decorative ? true : undefined} focusable="false" data-testid="maskotka" data-stan={stan} data-rozmiar={rozmiar}>
      <g className="all">
        <g className="legL"><rect x="76" y="160" width="17" height="44" rx="7" fill="#3B2A20" /><rect x="74" y="198" width="21" height="9" rx="4" fill="#1C1917" /></g>
        <g className="legR"><rect x="107" y="160" width="17" height="44" rx="7" fill="#3B2A20" /><rect x="105" y="198" width="21" height="9" rx="4" fill="#1C1917" /></g>
        <g className="torso"><rect x="60" y="96" width="80" height="78" rx="32" fill="#3B2A20" /><ellipse cx="100" cy="140" rx="24" ry="22" fill="#5C4334" /></g>
        <g className="armL"><line x1="64" y1="108" x2="50" y2="160" stroke="#3B2A20" strokeWidth="16" strokeLinecap="round" /><circle cx="50" cy="160" r="9" fill="#2A1D16" /></g>
        <g className="armR"><line x1="136" y1="108" x2="150" y2="160" stroke="#3B2A20" strokeWidth="16" strokeLinecap="round" /><circle cx="150" cy="160" r="9" fill="#2A1D16" /></g>
        <g className="head">
          <path d="M70 52 C 56 46, 50 34, 54 22 C 60 34, 68 40, 78 42 Z" fill="#E9D8BE" />
          <path d="M130 52 C 144 46, 150 34, 146 22 C 140 34, 132 40, 122 42 Z" fill="#E9D8BE" />
          <ellipse cx="64" cy="66" rx="10" ry="6" fill="#5C4334" />
          <ellipse cx="136" cy="66" rx="10" ry="6" fill="#5C4334" />
          <rect x="68" y="38" width="64" height="62" rx="28" fill="#4A3527" />
          <rect x="68" y="48" width="64" height="9" fill="#C2410C" />
          <circle cx="88" cy="68" r="5" fill="#FFFFFF" /><circle cx="89" cy="69" r="2.5" fill="#1C1917" />
          <circle cx="112" cy="68" r="5" fill="#FFFFFF" /><circle cx="113" cy="69" r="2.5" fill="#1C1917" />
          <rect x="80" y="78" width="40" height="22" rx="11" fill="#E9B48A" />
          <circle cx="92" cy="89" r="2.8" fill="#3B2A20" /><circle cx="108" cy="89" r="2.8" fill="#3B2A20" />
        </g>
      </g>
      <g className="bar"><line x1="24" y1="160" x2="176" y2="160" stroke="#57534E" strokeWidth="5" strokeLinecap="round" /><rect x="22" y="144" width="10" height="32" rx="3" fill="#C2410C" /><rect x="168" y="144" width="10" height="32" rx="3" fill="#C2410C" /></g>
      <g className="fx-star"><path d="M30 40 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" fill="#F59E0B" /><path d="M168 30 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#C2410C" /><circle cx="172" cy="84" r="4" fill="#F59E0B" /><circle cx="26" cy="96" r="3" fill="#C2410C" /></g>
      <g className="fx-dots"><circle cx="84" cy="214" r="5" fill="#C2410C" /><circle cx="100" cy="214" r="5" fill="#C2410C" /><circle cx="116" cy="214" r="5" fill="#C2410C" /></g>
      <g className="fx-err"><path className="drop" d="M150 44 C 150 44, 143 54, 143 58 a7 7 0 0 0 14 0 C 157 54, 150 44, 150 44 Z" fill="#7EA2FF" /><circle cx="40" cy="36" r="16" fill="#FFFFFF" stroke="#E2DCD6" strokeWidth="2" /><text x="40" y="43" textAnchor="middle" fontFamily="Manrope, sans-serif" fontSize="20" fontWeight="800" fill="#57534E">?</text></g>
    </svg>
  );
}
