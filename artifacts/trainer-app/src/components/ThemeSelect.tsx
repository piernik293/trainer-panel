import { useState } from "react";
import {
  THEME_OPTIONS,
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from "@workspace/design-tokens";
import { cn } from "@/lib/utils";

/** Jasny / Ciemny / Jak w systemie — saved in this browser (localStorage). */
export function ThemeSelect() {
  const [pref, setPref] = useState<ThemePreference>(() => readThemePreference());
  return (
    <fieldset>
      <legend className="section-label mb-2">Motyw</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motyw">
        {THEME_OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-sm font-semibold",
              pref === o.value
                ? "border-primary bg-brand-soft text-primary"
                : "border-input bg-card text-foreground hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={o.value}
              checked={pref === o.value}
              onChange={() => {
                setPref(o.value);
                setThemePreference(o.value);
              }}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
