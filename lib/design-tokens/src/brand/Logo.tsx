/**
 * Logo A „Rogate O” (zatwierdzone): pierścień O z rogami. JEDNO miejsce — zmiana na wariant B lub C to podmiana tego pliku (i plików w public/brand).
 * variant: "color" (#C2410C, napis ciemny) · "white" (całe białe, na ciemnym) · "icon" (sama ikona, kolor).
 */
import type { CSSProperties } from "react";

export const LOGO_ACCENT = "#C2410C";
export type LogoVariant = "color" | "white" | "icon";

/** Sama ikona (viewBox 100×100). */
export function LogoIcon({ size = 32, color = LOGO_ACCENT, className, title }: { size?: number; color?: string; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false" data-testid="logo-icon">
      <path d="M22 34 C 14 22, 14 12, 22 6 C 22 16, 28 24, 36 28" fill={color} />
      <path d="M78 34 C 86 22, 86 12, 78 6 C 78 16, 72 24, 64 28" fill={color} />
      <circle cx="50" cy="58" r="30" fill="none" stroke={color} strokeWidth="13" />
    </svg>
  );
}

/** Ikona + napis „optimatren” (Manrope 800, małe litery). */
export function Logo({ variant = "color", size = 32, className, style }: { variant?: LogoVariant; size?: number; className?: string; style?: CSSProperties }) {
  if (variant === "icon") return <LogoIcon size={size} className={className} title="Optimatren" />;
  const white = variant === "white";
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: Math.round(size * 0.3), ...style }} role="img" aria-label="Optimatren" data-testid="logo">
      <LogoIcon size={size} color={white ? "#FFFFFF" : LOGO_ACCENT} />
      <span aria-hidden style={{ fontFamily: "Manrope, system-ui, sans-serif", fontWeight: 800, fontSize: Math.round(size * 0.75), lineHeight: 1, letterSpacing: "-0.01em", color: white ? "#FFFFFF" : "#1C1917" }}>optimatren</span>
    </span>
  );
}
