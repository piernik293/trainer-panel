/**
 * Stage 4.1B.1 — POST /availability/exceptions/batch: real-stack integration
 * tests (real dev DB + supertest; only Clerk mocked via mutable mockUserId).
 *
 * Spec test matrix (backend part):
 *  10. block_days creates blocked_day for ALL dates
 *  11. active bookings are NOT cancelled by block_days
 *  12. add_extra_range creates exceptions for all dates
 *  13. clear_exceptions removes only exceptions, not weekly availability
 *  14. an invalid date rolls back the WHOLE transaction (nothing saved)
 *  15. trainer cannot modify another trainer's data (owner from session)
 *   +  duplicate blocked_day skipped, not duplicated
 *   +  past dates rejected; >31 dates rejected; unauthenticated 401
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { vi } from "vitest";

let mockUserId: string | null = null;
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: mockUserId }),
}));
vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

import {
  db,
  trainersTable,
  clientsTable,
  bookingsTable,
  trainerAvailabilityTable,
  trainerAvailabilityExceptionsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import bookingsRouter from "../routes/bookings";
import { wallTimeToUtc } from "../services/bookingSlots";

const TAG = `batchtest_${Date.now()}`;
const TRAINER_A = `${TAG}_trainerA`;
const TRAINER_B = `${TAG}_trainerB`;

let app: Express;
let trainerAId: number;
let trainerBId: number;
let clientId: number;

// Warsaw day helper N days out.
const wallDay = (daysOut: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(
    new Date(Date.now() + daysOut * 86_400_000),
  );

const d1 = wallDay(8);
const d2 = wallDay(9);
const d3 = wallDay(10);
const past = wallDay(-2);

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use("/", bookingsRouter);

  const [ta] = await db.insert(trainersTable).values({ clerkUserId: TRAINER_A }).returning();
  const [tb] = await db.insert(trainersTable).values({ clerkUserId: TRAINER_B }).returning();
  trainerAId = ta.id;
  trainerBId = tb.id;
  const [c1] = await db
    .insert(clientsTable)
    .values({
      firstName: "Batch",
      lastName: "Client",
      trainerId: trainerAId,
      clerkUserId: `${TAG}_client`,
      cooperationMode: "in_person",
    })
    .returning();
  clientId = c1.id;
  // Weekly availability rows for trainer A (should NEVER be touched by batch ops).
  for (let weekday = 0; weekday <= 6; weekday++) {
    await db.insert(trainerAvailabilityTable).values({
      trainerId: trainerAId,
      weekday,
      startTime: "16:00",
      endTime: "20:00",
      sessionMinutes: 60,
      bufferMinutes: 0,
    });
  }
});

afterAll(async () => {
  const trainerIds = [trainerAId, trainerBId].filter(Boolean);
  if (trainerIds.length) {
    await db.delete(bookingsTable).where(inArray(bookingsTable.trainerId, trainerIds));
    await db.delete(trainerAvailabilityExceptionsTable).where(inArray(trainerAvailabilityExceptionsTable.trainerId, trainerIds));
    await db.delete(trainerAvailabilityTable).where(inArray(trainerAvailabilityTable.trainerId, trainerIds));
    await db.delete(clientsTable).where(eq(clientsTable.id, clientId));
    await db.delete(trainersTable).where(inArray(trainersTable.id, trainerIds));
  }
});

const asTrainerA = () => { mockUserId = TRAINER_A; };
const asTrainerB = () => { mockUserId = TRAINER_B; };
const asNobody = () => { mockUserId = null; };

const exceptionsFor = (trainerId: number, dates: string[]) =>
  db
    .select()
    .from(trainerAvailabilityExceptionsTable)
    .where(
      and(
        eq(trainerAvailabilityExceptionsTable.trainerId, trainerId),
        inArray(trainerAvailabilityExceptionsTable.date, dates),
      ),
    );

describe("auth + validation", () => {
  it("rejects unauthenticated batch with 401", async () => {
    asNobody();
    const r = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates: [d1] });
    expect(r.status).toBe(401);
  });

  it("rejects past dates (Polish message)", async () => {
    asTrainerA();
    const r = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates: [d1, past] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Nie można zmieniać dni przeszłych.");
    expect(await exceptionsFor(trainerAId, [d1])).toHaveLength(0);
  });

  it("rejects more than 31 dates", async () => {
    asTrainerA();
    const dates = Array.from({ length: 32 }, (_, i) => wallDay(5 + i));
    const r = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("maksymalnie 31 dni");
  });

  it("an invalid date rolls back the whole batch — nothing is saved (14)", async () => {
    asTrainerA();
    const r = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates: [d1, "2026-13-45"] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Nieprawidłowa data. Użyj formatu RRRR-MM-DD.");
    expect(await exceptionsFor(trainerAId, [d1])).toHaveLength(0);
  });

  it("add_extra_range validates times and session length", async () => {
    asTrainerA();
    const missing = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "add_extra_range", dates: [d1] });
    expect(missing.status).toBe(400);

    const inverted = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "add_extra_range", dates: [d1], startTime: "12:00", endTime: "10:00", sessionDurationMinutes: 60, breakMinutes: 0 });
    expect(inverted.status).toBe(400);
    expect(inverted.body.error).toBe("Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia.");

    const tooShort = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "add_extra_range", dates: [d1], startTime: "10:00", endTime: "10:30", sessionDurationMinutes: 60, breakMinutes: 0 });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.error).toBe("Zakres godzin jest za krótki dla wybranego czasu sesji.");
    expect(await exceptionsFor(trainerAId, [d1])).toHaveLength(0);
  });
});

describe("block_days (10, 11, duplicates)", () => {
  it("creates blocked_day for ALL dates and skips already-blocked days (10)", async () => {
    asTrainerA();
    const first = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates: [d1, d2, d3] });
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ created: 3, removed: 0, skipped: 0 });

    // Re-blocking the same days: everything skipped, no duplicates.
    const second = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates: [d1, d2, d3] });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ created: 0, removed: 0, skipped: 3 });

    const rows = await exceptionsFor(trainerAId, [d1, d2, d3]);
    expect(rows.filter((r) => r.type === "blocked_day")).toHaveLength(3);
  });

  it("does NOT cancel an active booking on a blocked day (11)", async () => {
    const [dy, dm, dd] = d1.split("-").map(Number);
    const [booking] = await db
      .insert(bookingsTable)
      .values({
        trainerId: trainerAId,
        clientId,
        startsAt: wallTimeToUtc(dy, dm, dd, 17 * 60),
        durationMinutes: 60,
        status: "booked",
      })
      .returning();

    asTrainerA();
    // d1 is already blocked from the previous test — block again including it.
    const r = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates: [d1] });
    expect(r.status).toBe(200);

    const [after] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, booking.id));
    expect(after.status).toBe("booked");
    expect(after.cancelledAt).toBeNull();
  });
});

describe("add_extra_range (12)", () => {
  it("creates extra_range for all dates; identical ranges skipped on retry", async () => {
    asTrainerA();
    const payload = {
      action: "add_extra_range",
      dates: [d2, d3],
      startTime: "08:00",
      endTime: "10:00",
      sessionDurationMinutes: 60,
      breakMinutes: 0,
    };
    const first = await request(app).post("/availability/exceptions/batch").send(payload);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ created: 2, removed: 0, skipped: 0 });

    const second = await request(app).post("/availability/exceptions/batch").send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ created: 0, removed: 0, skipped: 2 });

    const rows = await exceptionsFor(trainerAId, [d2, d3]);
    expect(rows.filter((r) => r.type === "extra_range")).toHaveLength(2);
  });
});

describe("clear_exceptions (13)", () => {
  it("removes only exceptions — weekly availability and bookings stay (13)", async () => {
    asTrainerA();
    const r = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "clear_exceptions", dates: [d1, d2, d3] });
    expect(r.status).toBe(200);
    // 3 blocked_day + 2 extra_range from previous tests.
    expect(r.body).toEqual({ created: 0, removed: 5, skipped: 0 });

    expect(await exceptionsFor(trainerAId, [d1, d2, d3])).toHaveLength(0);
    // Weekly availability untouched.
    const weekly = await db
      .select()
      .from(trainerAvailabilityTable)
      .where(eq(trainerAvailabilityTable.trainerId, trainerAId));
    expect(weekly).toHaveLength(7);
    // Booking untouched.
    const bookings = await db
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.trainerId, trainerAId), eq(bookingsTable.status, "booked")));
    expect(bookings).toHaveLength(1);
  });
});

describe("trainer isolation (15)", () => {
  it("batch only ever touches the session trainer's rows", async () => {
    // Trainer B blocks d1; trainer A clearing d1 must not remove B's exception.
    asTrainerB();
    const blockB = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "block_days", dates: [d1], trainerId: trainerAId }); // body trainerId ignored
    expect(blockB.status).toBe(200);
    expect(blockB.body.created).toBe(1);

    asTrainerA();
    const clearA = await request(app)
      .post("/availability/exceptions/batch")
      .send({ action: "clear_exceptions", dates: [d1] });
    expect(clearA.status).toBe(200);
    expect(clearA.body.removed).toBe(0); // A has nothing on d1 anymore

    const bRows = await exceptionsFor(trainerBId, [d1]);
    expect(bRows).toHaveLength(1);
  });
});
