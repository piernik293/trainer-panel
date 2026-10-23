import type { ReactNode } from "react";
import duotone800 from "./hero-duotone-800.webp";
import duotone1600 from "./hero-duotone-1600.webp";
import dark800 from "./hero-dark-800.webp";
import dark1600 from "./hero-dark-1600.webp";

/**
 * Welcome photo shared by the trainer panel (sign-in / sign-up) and the client
 * portal (interview welcome). Nowhere else. Source and processing: docs/ASSETS.md.
 *
 *  - "login": right half of the screen on desktop, a narrow strip on top on phones.
 *    The parent must be `position: relative`.
 *  - "portal-welcome": short header band; `children` is the text laid over the
 *    photo (the scrim on the text side keeps contrast >= 4.5:1).
 *
 * The photo is decorative (alt=""). Layout and the fade-in are plain CSS in
 * tokens.css (.app-hero*), the fade only runs for prefers-reduced-motion: no-preference.
 */
export type AppHeroVariant = "login" | "portal-welcome";

const SOURCES = {
  duotone: { small: duotone800, large: duotone1600 },
  dark: { small: dark800, large: dark1600 },
} as const;

export function AppHero({
  variant,
  tone = "duotone",
  mascot,
  children,
}: {
  variant: AppHeroVariant;
  /** "dark" = the darkened original, only for comparison; production uses duotone. */
  tone?: keyof typeof SOURCES;
  /**
   * Slot for the mascot (right edge of the photo). Empty today, renders nothing.
   * The mascot will go here, with states: idle, walk, lift, success, error/loading.
   */
  mascot?: ReactNode;
  children?: ReactNode;
}) {
  const src = SOURCES[tone];
  return (
    <div className={`app-hero app-hero--${variant}`} data-tone={tone}>
      <img
        className="app-hero__img"
        src={src.small}
        srcSet={`${src.small} 800w, ${src.large} 1600w`}
        sizes={variant === "login" ? "(min-width: 768px) 50vw, 100vw" : "100vw"}
        alt=""
        decoding="async"
        fetchPriority={variant === "login" ? "high" : undefined}
        onLoad={(e) => e.currentTarget.classList.add("is-loaded")}
        ref={(el) => {
          if (el?.complete) el.classList.add("is-loaded");
        }}
      />
      <div className="app-hero__scrim" aria-hidden="true" />
      {children ? <div className="app-hero__content">{children}</div> : null}
      {mascot ? (
        <div className="app-hero__mascot" aria-hidden="true">
          {mascot}
        </div>
      ) : null}
    </div>
  );
}
