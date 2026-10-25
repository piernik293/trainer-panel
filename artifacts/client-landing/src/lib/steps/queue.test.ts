import { describe, it, expect } from "vitest";
import { createStepsQueue, type SendResult } from "./queue";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

describe("steps offline queue", () => {
  it("keeps entries while offline and sends them when the network returns", async () => {
    let online = false; const sent: [string, number][] = [];
    const q = createStepsQueue({ storage: mem(), send: async (d, s): Promise<SendResult> => { if (!online) throw new Error("offline"); sent.push([d, s]); return { ok: true }; } });
    q.set("2026-10-25", 4000);
    await q.flush();
    expect(q.count()).toBe(1); expect(sent).toEqual([]);
    online = true; await q.flush();
    expect(sent).toEqual([["2026-10-25", 4000]]); expect(q.count()).toBe(0);
  });
  it("a correction replaces the not yet sent value for the same day (one request)", async () => {
    const sent: number[] = [];
    const q = createStepsQueue({ storage: mem(), send: async (_d, s): Promise<SendResult> => { sent.push(s); return { ok: true }; } });
    q.set("2026-10-25", 3000); q.set("2026-10-25", 5000);
    expect(q.count()).toBe(1); expect(q.peek("2026-10-25")).toBe(5000);
    await q.flush(); expect(sent).toEqual([5000]);
  });
  it("sends days in date order; a temporary failure keeps the rest, a permanent one drops that entry only", async () => {
    const sent: string[] = []; let fail: "temp" | "perm" | null = "temp";
    const q = createStepsQueue({ storage: mem(), send: async (d): Promise<SendResult> => {
      if (d === "2026-10-23" && fail === "temp") return { ok: false, permanent: false };
      if (d === "2026-10-23" && fail === "perm") return { ok: false, permanent: true };
      sent.push(d); return { ok: true };
    } });
    q.set("2026-10-24", 1); q.set("2026-10-23", 2);
    await q.flush(); expect(sent).toEqual([]); expect(q.count()).toBe(2);
    fail = "perm"; await q.flush();
    expect(sent).toEqual(["2026-10-24"]); expect(q.count()).toBe(0);
  });
  it("survives a reload: pending entries are read back from storage", async () => {
    const storage = mem();
    createStepsQueue({ storage, send: async () => ({ ok: false, permanent: false }) }).set("2026-10-25", 7000);
    const q2 = createStepsQueue({ storage, send: async () => ({ ok: true }) });
    expect(q2.peek("2026-10-25")).toBe(7000);
  });
  it("a value entered while a request is in flight is not lost", async () => {
    const sent: number[] = []; let q!: ReturnType<typeof createStepsQueue>;
    q = createStepsQueue({ storage: mem(), send: async (_d, s): Promise<SendResult> => { if (s === 1000) q.set("2026-10-25", 2000); sent.push(s); return { ok: true }; } });
    q.set("2026-10-25", 1000);
    await q.flush();
    expect(sent).toEqual([1000, 2000]); expect(q.count()).toBe(0);
  });
});
