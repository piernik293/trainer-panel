import { initialsOf } from "@/lib/v2/helpers";

/** Round avatar: initials on the chosen colour (no photos for now). White on every colour of the list meets 4.5:1. */
export function AvatarV2({ name, color, size = 44, className = "" }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${className}`}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.38) }}
    >{initialsOf(name)}</span>
  );
}
