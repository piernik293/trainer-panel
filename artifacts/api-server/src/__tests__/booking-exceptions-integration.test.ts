/**
 * Stage 4.1A — availability exceptions: real-stack integration tests.
 *
 * Runs against the REAL development database and real routers; only the
 * Clerk session layer is mocked (a mutable userId). All rows created here
 * use unique test clerk IDs and are deleted in afterAll.
 *
 * Matrix (spec audit list):
 *  1–3. GET/POST/DELETE exceptions without a session → 401
 *  4.  Trainer A does not see trainer B's exceptions
 *  5.  Trainer A cannot delete trainer B's exception (404)
 *  6.  trainer_id in body/query is ignored — owner comes from the session
 *  7.  Date range > 62 days rejected (400, Polish)
 *  8.  Invalid date format rejected (400, Polish)
 *  9.  Unsupported type rejected (400, Polish)
 * 10.  Client cannot book a slot on a blocked_day (409 SLOT_TAKEN)
 * 11.  Client cannot book a slot overlapping a blocked_range (409)
 * 12.  Client CAN book a slot created by extra_range (201)
 * 13.  Online client still gets 403 on slots and booking
 * 14.  Two bookings of the same instant → exactly one active row (unique idx)
 * 15.  After cancelling, the same slot can be booked again
 *  +   blocked_day added AFTER a booking leaves the booking 'booked';
 *      deleting the exception doesn't touch the booking
 *  +   Polish error messages, no raw DB errors leaked
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { vi } from "vitest";

// ─── Mock ONLY the Clerk session layer ───────────────────────────────────────
let mockUserId: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUserId }),
}));
vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

import { db, trainersTable, clientsTable, bookingsTable, trainerAvailabilityTable, trainerAvailabilityExceptionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import bookingsRouter from "../routes/bookings";
import { wallTimeToUtc } from "../services/bookingSlots";

const TAG = `bktest_${Date.now()}`;
const TRAINER_A = `${TAG}_trainerA`;
const TRAINER_B = `${TAG}_trainerB`;
const CLIENT_IN_PERSON = `${TAG}_client_inperson`;
const CLIENT_ONLINE = `${TAG}_client_online`;

let app: Express;
let trainerAId: number;
let trainerBId: number;
let clientId: number;

// A weekday ~10 days out (always inside the 30-day window, always future).
const target = new Date(Date.now() + 10 * 86_400_000);
const wall = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(target); // YYYY-MM-DD
const [ty, tm, td] = wall.split("-").map(Number);
// ISO weekday 0=Mon…6=Sun of that Warsaw day:
const weekday = (new Date(Date.UTC(ty, tm - 1, td)).getUTCDay() + 6) % 7;
const slot16 = wallTimeToUtc(ty, tm, td, 16 * 60);
const slot17 = wallTimeToUtc(ty, tm, td, 17 * 60);
const extraSlot9 = wallTimeToUtc(ty, tm, td, 9 * 60);

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use("/", bookingsRouter);

  const [ta] = await db.insert(trainersTable).values({ clerkUserId: TRAINER_A }).returning();
  const [tb] = await db.insert(trainersTable).values({ clerkUserId: TRAINER_B }).returning();
  trainerAId = ta.id;
  trainerBId = tb.id;
  const [c1] = await db.insert(clientsTable).values({
    firstName: "Test", lastName: "InPerson", trainerId: trainerAId,
    clerkUserId: CLIENT_IN_PERSON, cooperationMode: "in_person",
  }).returning();
  clientId = c1.id;
  await db.insert(clientsTable).values({
    firstName: "Test", lastName: "Online", trainerId: trainerAId,
    clerkUserId: CLIENT_ONLINE, cooperationMode: "online",
  });
  // Weekly availability for trainer A on the target weekday: 16:00–20:00.
  await db.insert(trainerAvailabilityTable).values({
    trainerId: trainerAId, weekday, startTime: "16:00", endTime: "20:00",
    sessionMinutes: 60, bufferMinutes: 0,
  });
});

afterAll(async () => {
  const trainerIds = [trainerAId, trainerBId].filter(Boolean);
  if (trainerIds.length) {
    await db.delete(bookingsTable).where(inArray(bookingsTable.trainerId, trainerIds));
    await db.delete(trainerAvailabilityExceptionsTable).where(inArray(trainerAvailabilityExceptionsTable.trainerId, trainerIds));
    await db.delete(trainerAvailabilityTable).where(inArray(trainerAvailabilityTable.trainerId, trainerIds));
    await db.delete(clientsTable).where(inArray(clientsTable.clerkUserId, [CLIENT_IN_PERSON, CLIENT_ONLINE]));
    await db.delete(trainersTable).where(inArray(trainersTable.id, trainerIds));
  }
});

const asTrainerA = () => { mockUserId = TRAINER_A; };
const asTrainerB = () => { mockUserId = TRAINER_B; };
const asClient = () => { mockUserId = CLIENT_IN_PERSON; };
const asOnlineClient = () => { mockUserId = CLIENT_ONLINE; };
const asNobody = () => { mockUserId = null; };

const range = { from: wall, to: wall };

describe("auth gating (1–3)", () => {
  it("rejects unauthenticated GET/POST/DELETE exceptions with 401 + Polish message", async () => {
    asNobody();
    const g = await request(app).get("/availability/exceptions").query(range);
    const p = await request(app).post("/availability/exceptions").send({ type: "blocked_day", date: wall });
    const d = await request(app).delete("/availability/exceptions/1");
    for (const r of [g, p, d]) {
      expect(r.status).toBe(401);
      expect(r.body.error).toBe("Twoja sesja wygasła. Zaloguj się ponownie.");
    }
  });
});

describe("trainer isolation (4–6)", () => {
  let bExceptionId: number;

  it("trainer B creates an exception; trainer A does not see it (4)", async () => {
    asTrainerB();
    const created = await request(app).post("/availability/exceptions").send({ type: "blocked_day", date: wall });
    expect(created.status).toBe(201);
    bExceptionId = created.body.id;

    asTrainerA();
    const list = await request(app).get("/availability/exceptions").query(range);
    expect(list.status).toBe(200);
    expect(list.body.some((r: { id: number }) => r.id === bExceptionId)).toBe(false);
  });

  it("trainer A cannot delete trainer B's exception (5)", async () => {
    asTrainerA();
    const del = await request(app).delete(`/availability/exceptions/${bExceptionId}`);
    expect(del.status).toBe(404);
    // Still present for B.
    asTrainerB();
    const list = await request(app).get("/availability/exceptions").query(range);
    expect(list.body.some((r: { id: number }) => r.id === bExceptionId)).toBe(true);
    await request(app).delete(`/availability/exceptions/${bExceptionId}`).expect(200);
  });

  it("trainer_id in body/query is ignored — session owns the row (6)", async () => {
    asTrainerA();
    const created = await request(app)
      .post("/availability/exceptions")
      .query({ trainer_id: trainerBId })
      .send({ type: "blocked_range", date: wall, startTime: "06:00", endTime: "07:00", trainerId: trainerBId, trainer_id: trainerBId });
    expect(created.status).toBe(201);
    expect(created.body.trainerId).toBe(trainerAId);
    await request(app).delete(`/availability/exceptions/${created.body.id}`).expect(200);
  });
});

describe("input validation (7–9)", () => {
  it("rejects a range longer than 62 days (7)", async () => {
    asTrainerA();
    const r = await request(app).get("/availability/exceptions").query({ from: "2026-01-01", to: "2026-12-31" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Zakres dat może obejmować maksymalnie 62 dni.");
  });

  it("rejects invalid date formats (8)", async () => {
    asTrainerA();
    const r = await request(app).get("/availability/exceptions").query({ from: "01.08.2026", to: wall });
    expect(r.status).toBe(400);
    const p = await request(app).post("/availability/exceptions").send({ type: "blocked_day", date: "2026-02-30" });
    expect(p.status).toBe(400);
    for (const x of [r, p]) expect(x.body.error).toMatch(/[ąćęłńóśźż]|dat/i);
  });

  it("rejects an unsupported type (9)", async () => {
    asTrainerA();
    const r = await request(app).post("/availability/exceptions").send({ type: "vacation", date: wall });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Uzupełnij lub popraw zaznaczone pola.");
  });
});

async function createException(body: Record<string, unknown>): Promise<number> {
  asTrainerA();
  const r = await request(app).post("/availability/exceptions").send(body);
  expect(r.status).toBe(201);
  return r.body.id as number;
}
async function deleteException(id: number): Promise<void> {
  asTrainerA();
  await request(app).delete(`/availability/exceptions/${id}`).expect(200);
}

describe("client booking vs exceptions (10–13)", () => {
  it("client cannot book on a blocked_day; slots for that day disappear (10)", async () => {
    const exId = await createException({ type: "blocked_day", date: wall });
    asClient();
    const slots = await request(app).get("/client-portal/booking/slots");
    expect(slots.status).toBe(200);
    expect(slots.body.slots.some((s: { startsAt: string }) => s.startsAt.startsWith(wall))).toBe(false);
    const book = await request(app).post("/client-portal/booking").send({ startsAt: slot16.toISOString() });
    expect(book.status).toBe(409);
    expect(book.body.error).toBe("Ten termin został właśnie zarezerwowany. Wybierz inny.");
    await deleteException(exId);
  });

  it("client cannot book a slot overlapping a blocked_range (11)", async () => {
    const exId = await createException({ type: "blocked_range", date: wall, startTime: "16:30", endTime: "17:30" });
    asClient();
    const book16 = await request(app).post("/client-portal/booking").send({ startsAt: slot16.toISOString() });
    expect(book16.status).toBe(409); // 16:00–17:00 overlaps 16:30–17:30
    const book17 = await request(app).post("/client-portal/booking").send({ startsAt: slot17.toISOString() });
    expect(book17.status).toBe(409); // 17:00–18:00 overlaps too
    await deleteException(exId);
  });

  it("client CAN book an extra_range slot (12); cancel frees it (15)", async () => {
    const exId = await createException({ type: "extra_range", date: wall, startTime: "09:00", endTime: "11:00", sessionDurationMinutes: 60, breakMinutes: 0 });
    asClient();
    const slots = await request(app).get("/client-portal/booking/slots");
    expect(slots.body.slots.some((s: { startsAt: string }) => s.startsAt === extraSlot9.toISOString())).toBe(true);
    const book = await request(app).post("/client-portal/booking").send({ startsAt: extraSlot9.toISOString() });
    expect(book.status).toBe(201);
    // Cancel → slot is bookable again (15).
    const cancel = await request(app).patch(`/client-portal/booking/${book.body.id}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("cancelled_by_client");
    const rebook = await request(app).post("/client-portal/booking").send({ startsAt: extraSlot9.toISOString() });
    expect(rebook.status).toBe(201);
    await request(app).patch(`/client-portal/booking/${rebook.body.id}/cancel`).expect(200);
    await deleteException(exId);
  });

  it("online client still gets 403 on slots and booking (13)", async () => {
    asOnlineClient();
    const slots = await request(app).get("/client-portal/booking/slots");
    expect(slots.status).toBe(403);
    expect(slots.body.error).toBe("Rezerwacje treningów nie są dostępne dla Twojego trybu współpracy.");
    const book = await request(app).post("/client-portal/booking").send({ startsAt: slot16.toISOString() });
    expect(book.status).toBe(403);
  });
});

describe("GET /availability/calendar (Stage 4.1B)", () => {
  const calRange = { from: wall, to: wall };

  it("rejects unauthenticated, bad dates and ranges over 62 days", async () => {
    asNobody();
    await request(app).get("/availability/calendar").query(calRange).expect(401);
    asTrainerA();
    const bad = await request(app).get("/availability/calendar").query({ from: "1.08.2026", to: wall });
    expect(bad.status).toBe(400);
    const tooLong = await request(app).get("/availability/calendar").query({ from: "2026-01-01", to: "2026-12-31" });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBe("Zakres dat może obejmować maksymalnie 62 dni.");
  });

  it("day summaries match slots; free slots come from the shared generator", async () => {
    asTrainerA();
    const r = await request(app).get("/availability/calendar").query(calRange);
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(1);
    const day = r.body.days[0];
    expect(day.date).toBe(wall);
    expect(day.hasAvailability).toBe(true);
    expect(day.freeSlots).toBe(day.slots.filter((s: { status: string }) => s.status === "free").length);
    expect(day.bookedSlots).toBe(day.slots.filter((s: { status: string }) => s.status === "booked").length);
    expect(day.totalSlots).toBe(day.slots.length);
    // 16–20 weekly = 4 slots total for the day when nothing else interferes.
    expect(day.totalSlots).toBeGreaterThan(0);
  });

  it("blocked_range reduces and extra_range increases free slots; summaries stay consistent", async () => {
    asTrainerA();
    const base = await request(app).get("/availability/calendar").query(calRange);
    const baseFree = base.body.days[0].freeSlots;

    const blockId = await createException({ type: "blocked_range", date: wall, startTime: "18:30", endTime: "19:30" });
    const blocked = await request(app).get("/availability/calendar").query(calRange);
    expect(blocked.body.days[0].freeSlots).toBeLessThan(baseFree);
    expect(blocked.body.days[0].exceptions.some((e: { id: number }) => e.id === blockId)).toBe(true);
    await deleteException(blockId);

    const extraId = await createException({ type: "extra_range", date: wall, startTime: "06:00", endTime: "08:00", sessionDurationMinutes: 60, breakMinutes: 0 });
    const extra = await request(app).get("/availability/calendar").query(calRange);
    expect(extra.body.days[0].freeSlots).toBe(baseFree + 2);
    await deleteException(extraId);
  });

  it("blocked_day zeroes free slots but keeps an existing booking visible", async () => {
    asClient();
    const book = await request(app).post("/client-portal/booking").send({ startsAt: slot17.toISOString() });
    expect(book.status).toBe(201);
    const exId = await createException({ type: "blocked_day", date: wall });

    asTrainerA();
    const r = await request(app).get("/availability/calendar").query(calRange);
    const day = r.body.days[0];
    expect(day.isBlockedDay).toBe(true);
    expect(day.freeSlots).toBe(0);
    const bookedSlot = day.slots.find((s: { status: string }) => s.status === "booked");
    expect(bookedSlot).toBeDefined();
    expect(bookedSlot.bookingId).toBe(book.body.id);
    expect(bookedSlot.clientName).toBe("Test InPerson");
    expect(bookedSlot.clientId).toBe(clientId);

    // Cleanup: delete exception, cancel booking; day returns to normal.
    await deleteException(exId);
    asClient();
    await request(app).patch(`/client-portal/booking/${book.body.id}/cancel`).expect(200);
    asTrainerA();
    const after = await request(app).get("/availability/calendar").query(calRange);
    expect(after.body.days[0].isBlockedDay).toBe(false);
    expect(after.body.days[0].bookedSlots).toBe(0);
  });

  it("does not include another trainer's bookings or exceptions", async () => {
    asTrainerB();
    const r = await request(app).get("/availability/calendar").query(calRange);
    const day = r.body.days[0];
    expect(day.slots).toHaveLength(0);
    expect(day.exceptions).toHaveLength(0);
    expect(day.hasAvailability).toBe(false);
  });

  it("handles a DST-transition month without shifting dates", async () => {
    asTrainerA();
    const r = await request(app).get("/availability/calendar").query({ from: "2027-03-01", to: "2027-03-31" });
    expect(r.status).toBe(200);
    expect(r.body.days).toHaveLength(31);
    expect(r.body.days[0].date).toBe("2027-03-01");
    expect(r.body.days[30].date).toBe("2027-03-31");
    // Every consecutive date present exactly once.
    const dates = r.body.days.map((d: { date: string }) => d.date);
    expect(new Set(dates).size).toBe(31);
  });
});

describe("double booking + blocks vs existing bookings (14 + section 5)", () => {
  it("two requests for the same instant yield exactly one active booking (14)", async () => {
    asClient();
    const first = await request(app).post("/client-portal/booking").send({ startsAt: slot16.toISOString() });
    expect(first.status).toBe(201);
    const second = await request(app).post("/client-portal/booking").send({ startsAt: slot16.toISOString() });
    // Same client → one-active-booking rule (409); either way not a duplicate.
    expect(second.status).toBe(409);
    const rows = await db.select().from(bookingsTable).where(eq(bookingsTable.trainerId, trainerAId));
    expect(rows.filter((r) => r.status === "booked" && r.startsAt.getTime() === slot16.getTime())).toHaveLength(1);

    // Concurrent DB-level check (different clients / raw inserts) is enforced
    // by the partial unique index — verified directly:
    let uniqueViolation = false;
    try {
      await db.insert(bookingsTable).values({
        trainerId: trainerAId, clientId, startsAt: slot16, durationMinutes: 60, status: "booked",
      });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      uniqueViolation = (e?.code ?? e?.cause?.code) === "23505";
    }
    expect(uniqueViolation).toBe(true);
  });

  it("a blocked_day added AFTER booking leaves the booking active; deleting it changes nothing (section 5)", async () => {
    const exId = await createException({ type: "blocked_day", date: wall });
    const rows = await db.select().from(bookingsTable)
      .where(eq(bookingsTable.trainerId, trainerAId));
    const row = rows.find((r) => r.status === "booked")!;
    expect(row).toBeDefined();
    expect(row.status).toBe("booked");
    // Trainer still sees it in upcoming.
    asTrainerA();
    const upcoming = await request(app).get("/bookings/upcoming");
    expect(upcoming.body.some((b: { id: number }) => b.id === row.id)).toBe(true);
    await deleteException(exId);
    const [after] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, row.id));
    expect(after.status).toBe("booked");
  });
});
