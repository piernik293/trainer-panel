import type { ReactNode } from "react";
import { BottomBar, type ShellTab } from "./BottomBar";

/** Layout of the new portal: content of the current tab + the bottom bar. The tabs' content comes in as slots. */
export function PortalShell({ tab, onTab, children }: { tab: ShellTab; onTab: (t: ShellTab) => void; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-8" data-tab={tab}>{children}</main>
      <BottomBar tab={tab} onChange={onTab} />
    </div>
  );
}
