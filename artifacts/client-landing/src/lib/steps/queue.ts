/**
 * Offline queue for manually entered steps (blok 6). One pending value per date: a correction made
 * before the network returns replaces the earlier one, and the server also keeps one value per day,
 * so a retry after a lost response never duplicates anything.
 */
export type SendResult = { ok: true } | { ok: false; permanent: boolean };
export interface StepsStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

const KEY = "optimatren-kroki-queue:v1";

export function createStepsQueue(deps: { storage: StepsStorage; send: (date: string, steps: number) => Promise<SendResult> }) {
  const read = (): Record<string, number> => {
    try {
      const raw = deps.storage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw) as unknown; if (p && typeof p === "object") return p as Record<string, number>; }
    } catch { /* corrupted or unavailable storage → start empty */ }
    return {};
  };
  let pending = read();
  const persist = () => { try { deps.storage.setItem(KEY, JSON.stringify(pending)); } catch { /* keep in memory */ } };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  let flushing: Promise<void> | null = null;
  let again = false;

  async function run() {
    let retry: boolean;
    do {
      retry = false;
      for (const date of Object.keys(pending).sort()) {
        const steps = pending[date]!;
        let r: SendResult;
        try { r = await deps.send(date, steps); } catch { r = { ok: false, permanent: false }; }
        if (r.ok || r.permanent) {
          // a newer value entered while this one was in flight stays queued and goes out in the next pass
          if (pending[date] === steps) { const { [date]: _sent, ...rest } = pending; pending = rest; } else retry = true;
          persist(); emit();
        } else return; // no network / server trouble: keep everything, try again later
      }
    } while (retry);
  }

  return {
    set(date: string, steps: number) { pending = { ...pending, [date]: steps }; persist(); emit(); },
    flush(): Promise<void> {
      if (flushing) { again = true; return flushing; }
      flushing = (async () => { try { do { again = false; await run(); } while (again); } finally { flushing = null; } })();
      return flushing;
    },
    count: () => Object.keys(pending).length,
    /** value waiting to be sent for a date, if any */
    peek: (date: string) => pending[date] ?? null,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
export type StepsQueue = ReturnType<typeof createStepsQueue>;
