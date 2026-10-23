import { describe, it, expect } from "vitest";
import { createQueue, type QueueOp, type SendResult } from "./queue";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };
const op = (kind: QueueOp["kind"], id: string, extra: Partial<QueueOp> = {}): QueueOp => ({ id, kind, sessionUuid: "S1", body: { clientUuid: id }, ...extra });

describe("offline queue", () => {
  it("sends in order and resolves the server session id for later operations", async () => {
    const calls: [string, number | null][] = [];
    const q = createQueue({ storage: mem(), send: async (o, sid): Promise<SendResult> => { calls.push([o.kind, sid]); return { ok: true, data: { id: 42 } }; } });
    q.enqueue(op("start", "S1")); q.enqueue(op("set", "a", { slot: "1:1" })); q.enqueue(op("finish", "f"));
    await q.flush();
    expect(calls).toEqual([["start", null], ["set", 42], ["finish", 42]]);
    expect(q.pending()).toBe(0);
    expect(q.sessionId("S1")).toBe(42);
  });
  it("keeps everything while offline and sends it when the network returns", async () => {
    let online = false; const sent: string[] = [];
    const q = createQueue({ storage: mem(), send: async (o): Promise<SendResult> => { if (!online) throw new Error("offline"); sent.push(o.id); return { ok: true, data: { id: 1 } }; } });
    q.enqueue(op("start", "S1")); q.enqueue(op("set", "a", { slot: "1:1" }));
    await q.flush();
    expect(q.pending()).toBe(2); expect(sent).toEqual([]);
    online = true; await q.flush();
    expect(sent).toEqual(["S1", "a"]); expect(q.pending()).toBe(0);
  });
  it("replaces a not yet sent set with its correction (one request instead of two)", async () => {
    const sent: unknown[] = [];
    const q = createQueue({ storage: mem(), send: async (o): Promise<SendResult> => { sent.push(o.body); return { ok: true, data: { id: 1 } }; } });
    q.enqueue(op("start", "S1"));
    q.enqueue(op("set", "a", { slot: "1:1", body: { clientUuid: "a", weightKg: 60 } }));
    q.enqueue(op("set", "b", { slot: "1:1", body: { clientUuid: "b", weightKg: 62.5 } }));
    expect(q.pending()).toBe(2);
    await q.flush();
    expect(sent[1]).toEqual({ clientUuid: "b", weightKg: 62.5 });
  });
  it("a lost response (retry of the same uuid) does not stop the queue: the server answers duplicate=true", async () => {
    let n = 0;
    const q = createQueue({ storage: mem(), send: async (): Promise<SendResult> => (n++ === 0 ? { ok: false, permanent: false } : { ok: true, data: { id: 3 } }) });
    q.enqueue(op("start", "S1"));
    await q.flush(); expect(q.pending()).toBe(1);
    await q.flush(); expect(q.pending()).toBe(0);
  });
  it("drops operations the server rejects for good, without blocking the rest", async () => {
    const sent: string[] = [];
    const q = createQueue({ storage: mem(), send: async (o): Promise<SendResult> => { sent.push(o.id); return o.id === "bad" ? { ok: false, permanent: true } : { ok: true, data: { id: 1 } }; } });
    q.enqueue(op("start", "S1")); q.enqueue(op("set", "bad", { slot: "1:1" })); q.enqueue(op("set", "ok", { slot: "1:2" }));
    await q.flush();
    expect(sent).toEqual(["S1", "bad", "ok"]); expect(q.rejected()).toBe(1); expect(q.pending()).toBe(0);
  });
  it("survives a page reload (persisted) and ignores an enqueue of the same id twice", async () => {
    const st = mem();
    const a = createQueue({ storage: st, send: async () => ({ ok: false, permanent: false }) });
    a.enqueue(op("start", "S1")); a.enqueue(op("start", "S1")); a.enqueue(op("pain", "p"));
    expect(a.pending()).toBe(2);
    const b = createQueue({ storage: st, send: async () => ({ ok: true, data: { id: 5 } }) });
    expect(b.pending()).toBe(2);
    await b.flush(); expect(b.pending()).toBe(0);
  });
  it("drops an operation for a session whose start is neither delivered nor queued", async () => {
    const q = createQueue({ storage: mem(), send: async () => ({ ok: true }) });
    q.enqueue(op("set", "x", { sessionUuid: "GONE", slot: "1:1" }));
    await q.flush();
    expect(q.pending()).toBe(0); expect(q.rejected()).toBe(1);
  });
  it("an operation enqueued while a flush is finishing is still sent", async () => {
    const sent: string[] = [];
    const q = createQueue({ storage: mem(), send: async (o): Promise<SendResult> => { sent.push(o.id); return { ok: true, data: { id: 1 } }; } });
    void q.flush(); // empty flush in flight
    q.enqueue(op("start", "S1"));
    await q.flush();
    expect(sent).toEqual(["S1"]);
  });
  it("works with unavailable storage", async () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    const q = createQueue({ storage: broken, send: async () => ({ ok: true, data: { id: 1 } }) });
    q.enqueue(op("start", "S1")); await q.flush(); expect(q.pending()).toBe(0);
  });
});
