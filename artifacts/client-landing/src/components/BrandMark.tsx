import { cn } from "@/lib/utils";

/** Temporary logo: 32 px accent square with "O" (the image logo stays in the repo, unused here). */
export function BrandMark({ className }: { className?: string }) {
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
