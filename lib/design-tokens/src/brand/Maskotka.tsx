/**
 * Byczek — maskotka Optimatren (zatwierdzony projekt, wersja wysportowana, 19 stanów). SVG i animacje CSS (brand.css): bez bibliotek i plików z internetu.
 * Przy prefers-reduced-motion stoi nieruchomo (brand.css). Gdy będzie grafika od grafika (Lottie/Rive/SVG), podmienia się wnętrze tego komponentu
 * (docs/MASKOTKA.md). UWAGA: ekrany nie wybierają stanu same — wołają zdarzenie z `events.ts` (`<MascotEvent event=… />`, `showMascot(…)`).
 */
import { BULL_INNER } from "./bullSvg";

export type MaskotkaStan =
  | "idle" | "walk" | "lift" | "success" | "loading" | "error"
  | "wave" | "warmup" | "rest" | "flex" | "levelup" | "thinking" | "sleep" | "offline" | "stretch" | "care" | "streakstart" | "streak" | "streakout";
export type MaskotkaRozmiar = "s" | "m" | "l";
export const MASKOTKA_STANY: readonly MaskotkaStan[] = [
  "idle", "walk", "lift", "success", "loading", "error",
  "wave", "warmup", "rest", "flex", "levelup", "thinking", "sleep", "offline", "stretch", "care", "streakstart", "streak", "streakout",
];
export const MASKOTKA_PX: Record<MaskotkaRozmiar, number> = { s: 64, m: 120, l: 190 };
const NAZWA: Record<MaskotkaStan, string> = {
  idle: "stoi", walk: "idzie", lift: "podnosi sztangę", success: "cieszy się", loading: "czeka", error: "wzrusza ramionami",
  wave: "macha na powitanie", warmup: "robi pajacyki", rest: "odpoczywa na ławce", flex: "prezentuje mięśnie", levelup: "trzyma puchar", thinking: "myśli",
  sleep: "śpi w łóżku", offline: "nie ma internetu", stretch: "rozciąga nogi", care: "zjada brokuła", streakstart: "zapala pochodnię", streak: "trzyma płonącą pochodnię", streakout: "patrzy na zgaszoną pochodnię",
};

export function Maskotka({ stan = "idle", rozmiar = "m", decorative = false, className }: { stan?: MaskotkaStan; rozmiar?: MaskotkaRozmiar; /** tylko ozdoba (obok jest tekst) — ukryty dla czytników */ decorative?: boolean; className?: string }) {
  const w = MASKOTKA_PX[rozmiar];
  return (
    <svg className={`bull s-${stan}${className ? ` ${className}` : ""}`} width={w} height={Math.round((w * 220) / 200)} viewBox="0 0 200 220"
      role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `Byczek: ${NAZWA[stan]}`} aria-hidden={decorative ? true : undefined} focusable="false" data-testid="maskotka" data-stan={stan} data-rozmiar={rozmiar}
      dangerouslySetInnerHTML={{ __html: BULL_INNER }} />
  );
}
