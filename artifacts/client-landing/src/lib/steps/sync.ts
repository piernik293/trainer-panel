import { createStepsQueue, type SendResult, type StepsQueue } from "./queue";

export interface StepsSummary {
  today: string;
  goal: number | null;
  todaySteps: number | null;
  todayPercent: number | null;
  days: { date: string; steps: number | null }[];
  average: number | null;
  daysAtGoal: number | null;
  averagePercent: number | null;
}

async function send(date: string, steps: number): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch("/api/client-portal/steps", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, steps }) });
  } catch { return { ok: false, permanent: false }; }
  if (res.ok) return { ok: true };
  const temporary = res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500;
  return { ok: false, permanent: !temporary };
}

let queue: StepsQueue | null = null;
export function stepsQueue(): StepsQueue {
  if (!queue) {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* private mode */ }
    const mem = new Map<string, string>();
    queue = createStepsQueue({ storage: storage ?? { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) }, send });
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => void queue!.flush());
      void queue.flush();
    }
  }
  return queue;
}

const CACHE_KEY = "optimatren-kroki-summary:v1";
export function cacheSummary(s: StepsSummary): void { try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function readCachedSummary(): StepsSummary | null { try { const r = window.localStorage.getItem(CACHE_KEY); return r ? (JSON.parse(r) as StepsSummary) : null; } catch { return null; } }

export async function fetchSummary(): Promise<StepsSummary> {
  const res = await fetch("/api/client-portal/steps", { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
  return res.json();
}

export async function saveGoal(goal: number | null): Promise<StepsSummary> {
  const res = await fetch("/api/client-portal/steps-goal", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) });
  if (!res.ok) throw Object.assign(new Error(String(res.status)), { status: res.status });
  return res.json();
}
