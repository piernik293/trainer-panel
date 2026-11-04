import { cn } from "@/lib/utils";
import { LogoIcon, useBrandV1 } from "@workspace/design-tokens/brand";

/**
 * Znak marki obok nazwy. Z flagą BRAND_V1_ENABLED: logo A „Rogate O” (jeden komponent: lib/design-tokens/src/brand/Logo.tsx);
 * bez flagi: dotychczasowy kwadrat z „O”.
 */
export function BrandMark({ className }: { className?: string }) {
  const v1 = useBrandV1();
  if (v1) return <LogoIcon size={32} className={cn("h-8 w-8 shrink-0", className)} />;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-extrabold leading-none text-primary-foreground",
        className,
      )}
    >
      O
    </span>
  );
}
