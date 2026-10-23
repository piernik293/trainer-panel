/**
 * Offline queue for the training flow. Every write carries a client-generated UUID,
 * so a retry after a lost response never duplicates (the server answers `duplicate`).
 * Operations are sent in order; the server session id is only known after `start`
 * succeeded, so later operations refer to the session by its UUID until then.
 */
export type OpKind = "start" | "set" | "pain" | "finish";

export interface QueueOp {
  id: string; // = clientUuid of the write (start: session uuid)
  kind: OpKind;
  sessionUuid: string;
  /** For `set`: key used to replace an older, not yet sent version of the same set. */
  slot?: string;
  body: Record<string, unknown>;
}

export type SendResult =
  | { ok: true; data?: { id?: number } }
  | { ok: false; permanent: boolean }; // permanent = the server will never accept it (4xx), temporary = retry later

export interface QueueStorage { getItem(k: string): string | null; setItem(k: string, v: string): void }

interface Persisted { ops: QueueOp[]; sessionIds: Record<string, number>; rejected: number }
const KEY = "optimatren-trening-queue:v1";

export function createQueue(deps: {
  storage: QueueStorage;
  send: (op: QueueOp, sessionId: number | null) => Promise<SendResult>;
}) {
  const read = (): Persisted => {
    try {
      const raw = deps.storage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw) as Persisted; if (Array.isArray(p.ops)) return p; }
    } catch { /* corrupted or unavailable storage → start empty */ }
    return { ops: [], sessionIds: {}, rejected: 0 };
  };
  let state = read();
  const persist = () => { try { deps.storage.setItem(KEY, JSON.stringify(state)); } catch { /* keep in memory */ } };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  let flushing: Promise<void> | null = null;
  let again = false;

  function enqueue(op: QueueOp) {
    if (op.kind === "set" && op.slot) {
      const i = state.ops.findIndex((o) => o.kind === "set" && o.slot === op.slot && o.sessionUuid === op.sessionUuid);
      if (i >= 0) state.ops[i] = op; else state.ops.push(op);
    } else if (!state.ops.some((o) => o.id === op.id)) {
      state.ops.push(op);
    }
    persist(); emit();
  }

  async function run(): Promise<void> {
    while (state.ops.length > 0) {
      const op = state.ops[0]!;
      const sessionId = op.kind === "start" ? null : state.sessionIds[op.sessionUuid] ?? null;
      if (op.kind !== "start" && sessionId == null) {
        // Session start has not been delivered. If it is not queued either, nothing can be done with this op.
        if (!state.ops.some((o) => o.kind === "start" && o.sessionUuid === op.sessionUuid)) { state.ops.shift(); state.rejected++; persist(); continue; }
        // `start` is later in the list (cannot happen with FIFO order) — stop to stay safe.
        break;
      }
      let result: SendResult;
      try { result = await deps.send(op, sessionId); } catch { result = { ok: false, permanent: false }; }
      if (result.ok) {
        if (op.kind === "start" && result.data?.id) state.sessionIds[op.sessionUuid] = result.data.id;
        state.ops.shift();
      } else if (result.permanent) {
        state.ops.shift(); state.rejected++;
      } else {
        break; // no network / server trouble: keep everything, try again later
      }
      persist(); emit();
    }
    persist(); emit();
  }

  return {
    enqueue,
    /**
     * Sends what is queued. A call during a running flush makes it go around once more, so
     * operations added right before it ends are never stranded (flushing is cleared in the same
     * synchronous step that decides to stop).
     */
    flush(): Promise<void> {
      if (flushing) { again = true; return flushing; }
      flushing = (async () => {
        try {
          do { again = false; await run(); } while (again);
        } finally { flushing = null; }
      })();
      return flushing;
    },
    pending: () => state.ops.length,
    /** true when the session's `start` was delivered or is still waiting in the queue */
    knowsSession: (uuid: string) => state.sessionIds[uuid] != null || state.ops.some((o) => o.kind === "start" && o.sessionUuid === uuid),
    rejected: () => state.rejected,
    sessionId: (uuid: string) => state.sessionIds[uuid] ?? null,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
export type TrainingQueue = ReturnType<typeof createQueue>;
