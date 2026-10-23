import { createQueue, type QueueOp, type SendResult, type TrainingQueue } from "./queue";

/** Absolute /api path, Clerk cookie (same as the rest of the portal). */
async function send(op: QueueOp, sessionId: number | null): Promise<SendResult> {
  const base = "/api/client-portal/training/sessions";
  const [url, method] =
    op.kind === "start" ? [base, "POST"]
    : op.kind === "set" ? [`${base}/${sessionId}/sets`, "PUT"]
    : op.kind === "pain" ? [`${base}/${sessionId}/pain`, "POST"]
    : [`${base}/${sessionId}/finish`, "POST"];
  let res: Response;
  try {
    res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op.body) });
  } catch {
    return { ok: false, permanent: false };
  }
  if (res.ok) return { ok: true, data: await res.json().catch(() => ({})) };
  // 401 (session expired), 408, 429 and 5xx: retry later. Other 4xx will never succeed.
  const temporary = res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500;
  return { ok: false, permanent: !temporary };
}

let queue: TrainingQueue | null = null;
export function trainingQueue(): TrainingQueue {
  if (!queue) {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* private mode */ }
    const mem = new Map<string, string>();
    queue = createQueue({
      storage: storage ?? { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) },
      send,
    });
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => void queue!.flush());
      void queue.flush();
    }
  }
  return queue;
}

const CACHE_KEY = "optimatren-trening-today:v1";
export function cacheToday(data: unknown): void { try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* ignore */ } }
export function readCachedToday<T>(): T | null { try { const r = window.localStorage.getItem(CACHE_KEY); return r ? (JSON.parse(r) as T) : null; } catch { return null; } }

/** Tests only: forget the in-memory queue so the next call re-reads storage. */
export function resetTrainingQueueForTests(): void { queue = null; }
