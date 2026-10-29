import { CalendarCheck, ListChecks, LineChart, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type ShellTab = "dzis" | "plan" | "postepy" | "ty";
export const SHELL_TABS: { id: ShellTab; label: string; Icon: typeof CalendarCheck }[] = [
  { id: "dzis", label: "Dziś", Icon: CalendarCheck },
  { id: "plan", label: "Plan", Icon: ListChecks },
  { id: "postepy", label: "Postępy", Icon: LineChart },
  { id: "ty", label: "Ty", Icon: UserRound },
];

/** Bottom bar: four equal targets of at least 56 px, safe-area aware. Only one accent (the current tab). */
export function BottomBar({ tab, onChange }: { tab: ShellTab; onChange: (t: ShellTab) => void }) {
  return (
    <nav aria-label="Nawigacja główna" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="mx-auto flex max-w-2xl">
        {SHELL_TABS.map(({ id, label, Icon }) => {
          const current = tab === id;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={current ? "page" : undefined}
                className={cn("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold", current ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
