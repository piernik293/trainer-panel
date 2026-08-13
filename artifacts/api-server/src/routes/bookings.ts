/**
 * Booking calendar routes (Stage 4 MVP).
 *
 * Trainer (requireAuth):
 *   GET    /availability                 — weekly availability rows
 *   POST   /availability                 — add a range
 *   PATCH  /availability/:id             — toggle active
 *   DELETE /availability/:id             — remove a range
 *   GET    /bookings/upcoming            — upcoming active bookings + client name
 *   PATCH  /bookings/:id/cancel          — cancel (status → cancelled_by_trainer)
 *
 * Client portal (requireClientAuth; only cooperationMode in_person/hybrid):
 *   GET    /client-portal/booking        — my upcoming booking (or null) + eligibility
 *   GET    /client-portal/booking/slots  — available slots for the next 30 days
 *   POST   /client-portal/booking        — book a slot
 *   PATCH  /client-portal/booking/:id/cancel — cancel my booking
 *
 * Bookings are never hard-deleted; cancellation flips status, which frees the
 * slot again (partial unique index only covers status='booked').
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, and, gte, lte, asc, inArray } from "drizzle-orm";
import {
  db,
  clientsTable,
  trainerAvailabilityTable,
  trainerAvailabilityExceptionsTable,
  bookingsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireClientAuth } from "../middlewares/requireClientAuth";
import {
  generateSlots,
  wallTimeToUtc,
  BOOKING_WINDOW_DAYS,
  type ExceptionRow,
} from "../services/bookingSlots";

const router: IRouter = Router();

const GENERIC_ERROR = "Wystąpiły chwilowe problemy techniczne. Spróbuj ponownie za chwilę.";
const SLOT_TAKEN = "Ten termin został właśnie zarezerwowany. Wybierz inny.";
const BOOKING_FORBIDDEN = "Rezerwacje treningów nie są dostępne dla Twojego trybu współpracy.";

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const AvailabilityBody = z.object({
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_RE),
  endTime: z.string().regex(TIME_RE),
  sessionMinutes: z.number().int().min(15).max(240),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
});

// ─── Trainer: availability ───────────────────────────────────────────────────

router.get("/availability", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(trainerAvailabilityTable)
    .where(eq(trainerAvailabilityTable.trainerId, req.trainer!.id))
    .orderBy(asc(trainerAvailabilityTable.weekday), asc(trainerAvailabilityTable.startTime));
  res.json(rows);
});

router.post("/availability", requireAuth, async (req, res): Promise<void> => {
  const parsed = AvailabilityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Uzupełnij lub popraw zaznaczone pola." });
    return;
  }
  const b = parsed.data;
  if (toMin(b.endTime) - toMin(b.startTime) < b.sessionMinutes) {
    res.status(400).json({ error: "Zakres godzin jest za krótki dla wybranego czasu sesji." });
    return;
  }
  const [row] = await db
    .insert(trainerAvailabilityTable)
    .values({ ...b, trainerId: req.trainer!.id })
    .returning();
  res.status(201).json(row);
});

router.patch("/availability/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Uzupełnij lub popraw zaznaczone pola." });
    return;
  }
  const [row] = await db
    .update(trainerAvailabilityTable)
    .set({ isActive: parsed.data.isActive })
    .where(and(eq(trainerAvailabilityTable.id, id), eq(trainerAvailabilityTable.trainerId, req.trainer!.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Nie znaleziono zakresu dostępności." });
    return;
  }
  res.json(row);
});

router.delete("/availability/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Nieprawidłowe dane żądania. Popraw dane i spróbuj ponownie." });
    return;
  }
  const [row] = await db
    .delete(trainerAvailabilityTable)
    .where(and(eq(trainerAvailabilityTable.id, id), eq(trainerAvailabilityTable.trainerId, req.trainer!.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Nie znaleziono zakresu dostępności." });
    return;
  }
  res.json({ ok: true });
});

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ─── Trainer: availability exceptions (Stage 4.1A) ──────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXCEPTION_RANGE_DAYS = 62;

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const ExceptionBody = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("blocked_day"),
    date: z.string(),
  }),
  z.object({
    type: z.literal("blocked_range"),
    date: z.string(),
    startTime: z.string().regex(TIME_RE),
    endTime: z.string().regex(TIME_RE),
  }),
  z.object({
    type: z.literal("extra_range"),
    date: z.string(),
    startTime: z.string().regex(TIME_RE),
    endTime: z.string().regex(TIME_RE),
    sessionDurationMinutes: z.number().int().min(15).max(240),
    breakMinutes: z.number().int().min(0).max(120),
  }),
]);

/** Validate an exception payload; returns a Polish error message or null. */
export function validateExceptionPayload(body: unknown):
  | { error: string }
  | { data: z.infer<typeof ExceptionBody> } {
  const parsed = ExceptionBody.safeParse(body);
  if (!parsed.success) {
    const raw = body as { type?: string; startTime?: unknown; endTime?: unknown } | null;
    if (raw?.type === "blocked_day" && (raw.startTime != null || raw.endTime != null)) {
      return { error: "Blokada całego dnia nie może zawierać godzin." };
    }
    return { error: "Uzupełnij lub popraw zaznaczone pola." };
  }
  const b = parsed.data;
  if (!isValidDate(b.date)) {
    return { error: "Nieprawidłowa data. Użyj formatu RRRR-MM-DD." };
  }
  if (b.type === "blocked_day") {
    const raw = body as { startTime?: unknown; endTime?: unknown };
    if (raw.startTime != null || raw.endTime != null) {
      return { error: "Blokada całego dnia nie może zawierać godzin." };
    }
    return { data: b };
  }
  if (toMin(b.endTime) <= toMin(b.startTime)) {
    return { error: "Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia." };
  }
  if (b.type === "extra_range" && toMin(b.endTime) - toMin(b.startTime) < b.sessionDurationMinutes) {
    return { error: "Zakres godzin jest za krótki dla wybranego czasu sesji." };
  }
  return { data: b };
}

// GET /availability/exceptions?from=YYYY-MM-DD&to=YYYY-MM-DD (max 62 days)
router.get("/availability/exceptions", requireAuth, async (req, res): Promise<void> => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!isValidDate(from) || !isValidDate(to)) {
    res.status(400).json({ error: "Nieprawidłowy zakres dat. Użyj formatu RRRR-MM-DD." });
    return;
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days < 0 || days > MAX_EXCEPTION_RANGE_DAYS) {
    res.status(400).json({ error: "Zakres dat może obejmować maksymalnie 62 dni." });
    return;
  }
  const rows = await db
    .select()
    .from(trainerAvailabilityExceptionsTable)
    .where(
      and(
        eq(trainerAvailabilityExceptionsTable.trainerId, req.trainer!.id),
        gte(trainerAvailabilityExceptionsTable.date, from),
        lte(trainerAvailabilityExceptionsTable.date, to),
      ),
    )
    .orderBy(asc(trainerAvailabilityExceptionsTable.date), asc(trainerAvailabilityExceptionsTable.startTime));
  res.json(rows);
});

router.post("/availability/exceptions", requireAuth, async (req, res): Promise<void> => {
  const result = validateExceptionPayload(req.body);
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  const b = result.data;
  const [row] = await db
    .insert(trainerAvailabilityExceptionsTable)
    .values({
      trainerId: req.trainer!.id,
      date: b.date,
      type: b.type,
      startTime: b.type === "blocked_day" ? null : b.startTime,
      endTime: b.type === "blocked_day" ? null : b.endTime,
      sessionDurationMinutes: b.type === "extra_range" ? b.sessionDurationMinutes : null,
      breakMinutes: b.type === "extra_range" ? b.breakMinutes : null,
    })
    .returning();
  res.status(201).json(row);
});

router.delete("/availability/exceptions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Nieprawidłowe dane żądania. Popraw dane i spróbuj ponownie." });
    return;
  }
  const [row] = await db
    .delete(trainerAvailabilityExceptionsTable)
    .where(
      and(
        eq(trainerAvailabilityExceptionsTable.id, id),
        eq(trainerAvailabilityExceptionsTable.trainerId, req.trainer!.id),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Nie znaleziono wyjątku." });
    return;
  }
  res.json({ ok: true });
});

// ─── Trainer: batch exception operations (Stage 4.1B.1) ─────────────────────

const MAX_BATCH_DATES = 31;

const BatchBody = z.object({
  action: z.enum(["block_days", "add_extra_range", "clear_exceptions"]),
  dates: z.array(z.string()).min(1).max(MAX_BATCH_DATES),
  startTime: z.string().regex(TIME_RE).optional(),
  endTime: z.string().regex(TIME_RE).optional(),
  sessionDurationMinutes: z.number().int().min(15).max(240).optional(),
  breakMinutes: z.number().int().min(0).max(120).optional(),
});

/** Today's Warsaw calendar day — the source of truth for "past". */
function todayWarsaw(): string {
  return WARSAW_DAY_FMT.format(new Date());
}

/**
 * Validate a batch payload; returns a Polish error or the normalized data.
 * Exported for unit tests.
 */
export function validateBatchPayload(body: unknown, today: string):
  | { error: string }
  | {
      data: {
        action: "block_days" | "add_extra_range" | "clear_exceptions";
        dates: string[];
        startTime?: string;
        endTime?: string;
        sessionDurationMinutes?: number;
        breakMinutes?: number;
      };
    } {
  const parsed = BatchBody.safeParse(body);
  if (!parsed.success) {
    const raw = body as { dates?: unknown } | null;
    if (Array.isArray(raw?.dates) && raw.dates.length > MAX_BATCH_DATES) {
      return { error: `Jedna operacja może objąć maksymalnie ${MAX_BATCH_DATES} dni.` };
    }
    return { error: "Uzupełnij lub popraw zaznaczone pola." };
  }
  const b = parsed.data;
  const dates = [...new Set(b.dates)];
  for (const d of dates) {
    if (!isValidDate(d)) {
      return { error: "Nieprawidłowa data. Użyj formatu RRRR-MM-DD." };
    }
    if (d < today) {
      return { error: "Nie można zmieniać dni przeszłych." };
    }
  }
  if (b.action === "add_extra_range") {
    if (!b.startTime || !b.endTime || b.sessionDurationMinutes == null || b.breakMinutes == null) {
      return { error: "Uzupełnij lub popraw zaznaczone pola." };
    }
    if (toMin(b.endTime) <= toMin(b.startTime)) {
      return { error: "Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia." };
    }
    if (toMin(b.endTime) - toMin(b.startTime) < b.sessionDurationMinutes) {
      return { error: "Zakres godzin jest za krótki dla wybranego czasu sesji." };
    }
  }
  return { data: { ...b, dates } };
}

/**
 * POST /availability/exceptions/batch — one atomic bulk operation instead of
 * many independent requests. Runs in a single transaction: on any error
 * nothing is saved. Existing identical exceptions are skipped, never
 * duplicated. Bookings are NEVER touched here.
 */
router.post("/availability/exceptions/batch", requireAuth, async (req, res): Promise<void> => {
  const result = validateBatchPayload(req.body, todayWarsaw());
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  const b = result.data;
  const trainerId = req.trainer!.id;

  try {
    const summary = await db.transaction(async (tx) => {
      let created = 0;
      let removed = 0;
      let skipped = 0;

      if (b.action === "clear_exceptions") {
        const deleted = await tx
          .delete(trainerAvailabilityExceptionsTable)
          .where(
            and(
              eq(trainerAvailabilityExceptionsTable.trainerId, trainerId),
              inArray(trainerAvailabilityExceptionsTable.date, b.dates),
            ),
          )
          .returning({ id: trainerAvailabilityExceptionsTable.id });
        removed = deleted.length;
        skipped = 0;
        return { created, removed, skipped };
      }

      const existing = await tx
        .select()
        .from(trainerAvailabilityExceptionsTable)
        .where(
          and(
            eq(trainerAvailabilityExceptionsTable.trainerId, trainerId),
            inArray(trainerAvailabilityExceptionsTable.date, b.dates),
          ),
        );

      if (b.action === "block_days") {
        const alreadyBlocked = new Set(
          existing.filter((e) => e.type === "blocked_day").map((e) => e.date),
        );
        const toInsert = b.dates.filter((d) => !alreadyBlocked.has(d));
        skipped = b.dates.length - toInsert.length;
        if (toInsert.length > 0) {
          const rows = await tx
            .insert(trainerAvailabilityExceptionsTable)
            .values(
              toInsert.map((date) => ({
                trainerId,
                date,
                type: "blocked_day" as const,
                startTime: null,
                endTime: null,
                sessionDurationMinutes: null,
                breakMinutes: null,
              })),
            )
            .returning({ id: trainerAvailabilityExceptionsTable.id });
          created = rows.length;
        }
        return { created, removed, skipped };
      }

      // add_extra_range — skip dates that already carry an identical range.
      const hhmmss = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const identical = new Set(
        existing
          .filter(
            (e) =>
              e.type === "extra_range" &&
              e.startTime === hhmmss(b.startTime!) &&
              e.endTime === hhmmss(b.endTime!) &&
              e.sessionDurationMinutes === b.sessionDurationMinutes &&
              e.breakMinutes === b.breakMinutes,
          )
          .map((e) => e.date),
      );
      const toInsert = b.dates.filter((d) => !identical.has(d));
      skipped = b.dates.length - toInsert.length;
      if (toInsert.length > 0) {
        const rows = await tx
          .insert(trainerAvailabilityExceptionsTable)
          .values(
            toInsert.map((date) => ({
              trainerId,
              date,
              type: "extra_range" as const,
              startTime: b.startTime!,
              endTime: b.endTime!,
              sessionDurationMinutes: b.sessionDurationMinutes!,
              breakMinutes: b.breakMinutes!,
            })),
          )
          .returning({ id: trainerAvailabilityExceptionsTable.id });
        created = rows.length;
      }
      return { created, removed, skipped };
    });

    res.json(summary);
  } catch (err) {
    console.error("Batch exception operation failed:", err);
    res.status(500).json({ error: GENERIC_ERROR });
  }
});

// ─── Trainer: month calendar aggregate (Stage 4.1B) ─────────────────────────

const WARSAW_DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" });

/**
 * GET /availability/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD (max 62 days).
 * Per-day aggregate for the trainer's month view. Free slots come from the
 * SAME shared generator as client booking; booked slots come straight from
 * the bookings table, so an existing booking stays visible even if the day
 * was blocked afterwards.
 */
router.get("/availability/calendar", requireAuth, async (req, res): Promise<void> => {
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!isValidDate(from) || !isValidDate(to)) {
    res.status(400).json({ error: "Nieprawidłowy zakres dat. Użyj formatu RRRR-MM-DD." });
    return;
  }
  const dayCount = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (dayCount < 1 || dayCount > MAX_EXCEPTION_RANGE_DAYS) {
    res.status(400).json({ error: "Zakres dat może obejmować maksymalnie 62 dni." });
    return;
  }
  const trainerId = req.trainer!.id;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty2, tm2, td2] = to.split("-").map(Number);
  const rangeStartUtc = wallTimeToUtc(fy, fm, fd, 0);
  const rangeEndUtc = wallTimeToUtc(ty2, tm2, td2, 24 * 60);

  const now = new Date();
  const [availability, exceptions, bookings] = await Promise.all([
    db.select().from(trainerAvailabilityTable).where(eq(trainerAvailabilityTable.trainerId, trainerId)),
    db
      .select()
      .from(trainerAvailabilityExceptionsTable)
      .where(
        and(
          eq(trainerAvailabilityExceptionsTable.trainerId, trainerId),
          gte(trainerAvailabilityExceptionsTable.date, from),
          lte(trainerAvailabilityExceptionsTable.date, to),
        ),
      ),
    db
      .select({
        id: bookingsTable.id,
        clientId: bookingsTable.clientId,
        startsAt: bookingsTable.startsAt,
        durationMinutes: bookingsTable.durationMinutes,
        clientFirstName: clientsTable.firstName,
        clientLastName: clientsTable.lastName,
      })
      .from(bookingsTable)
      .innerJoin(clientsTable, eq(bookingsTable.clientId, clientsTable.id))
      .where(
        and(
          eq(bookingsTable.trainerId, trainerId),
          eq(bookingsTable.status, "booked"),
          gte(bookingsTable.startsAt, rangeStartUtc),
          lte(bookingsTable.startsAt, rangeEndUtc),
        ),
      ),
  ]);

  // Free slots via the shared generator, widened to the requested range.
  // Booked instants are excluded from the free list exactly like in the
  // client flow.
  const freeSlots = generateSlots(
    availability,
    bookings.map((b) => b.startsAt),
    now,
    exceptions as ExceptionRow[],
    { fromDay: from, days: dayCount },
  );

  type CalendarSlot = {
    start: string;
    end: string;
    status: "free" | "booked";
    bookingId?: number;
    clientId?: number;
    clientName?: string;
  };
  const days = new Map<string, {
    date: string;
    isBlockedDay: boolean;
    hasAvailability: boolean;
    slots: CalendarSlot[];
    exceptions: Array<{ id: number; type: string; startTime: string | null; endTime: string | null }>;
  }>();
  for (let i = 0; i < dayCount; i++) {
    const date = new Date(Date.UTC(fy, fm - 1, fd + i, 12)).toISOString().slice(0, 10);
    days.set(date, { date, isBlockedDay: false, hasAvailability: false, slots: [], exceptions: [] });
  }

  const weekdayOf = (date: string): number => {
    const [y, m, d] = date.split("-").map(Number);
    return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  };
  const activeWeekdays = new Set(availability.filter((a) => a.isActive).map((a) => a.weekday));
  for (const day of days.values()) {
    day.hasAvailability = activeWeekdays.has(weekdayOf(day.date));
  }
  for (const ex of exceptions) {
    const day = days.get(ex.date.slice(0, 10));
    if (!day) continue;
    day.exceptions.push({
      id: ex.id,
      type: ex.type,
      startTime: ex.startTime ? ex.startTime.slice(0, 5) : null,
      endTime: ex.endTime ? ex.endTime.slice(0, 5) : null,
    });
    if (ex.type === "blocked_day") day.isBlockedDay = true;
    if (ex.type === "extra_range") day.hasAvailability = true;
  }
  for (const s of freeSlots) {
    const day = days.get(WARSAW_DAY_FMT.format(s.startsAt));
    if (!day) continue;
    day.slots.push({
      start: s.startsAt.toISOString(),
      end: new Date(s.startsAt.getTime() + s.durationMinutes * 60_000).toISOString(),
      status: "free",
    });
  }
  for (const b of bookings) {
    const day = days.get(WARSAW_DAY_FMT.format(b.startsAt));
    if (!day) continue;
    day.slots.push({
      start: b.startsAt.toISOString(),
      end: new Date(b.startsAt.getTime() + b.durationMinutes * 60_000).toISOString(),
      status: "booked",
      bookingId: b.id,
      clientId: b.clientId,
      clientName: `${b.clientFirstName} ${b.clientLastName}`,
    });
  }

  res.json({
    from,
    to,
    days: [...days.values()].map((d) => {
      d.slots.sort((a, b) => a.start.localeCompare(b.start));
      const freeCount = d.slots.filter((s) => s.status === "free").length;
      const bookedCount = d.slots.length - freeCount;
      return {
        date: d.date,
        totalSlots: d.slots.length,
        freeSlots: freeCount,
        bookedSlots: bookedCount,
        isBlockedDay: d.isBlockedDay,
        hasAvailability: d.hasAvailability,
        slots: d.slots,
        exceptions: d.exceptions,
      };
    }),
  });
});

/** Load exceptions covering the booking window for a trainer (shared by both slot paths). */
async function loadWindowExceptions(trainerId: number, now: Date): Promise<ExceptionRow[]> {
  // Pad both ends by a day: UTC date slicing may differ from the Warsaw day.
  const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (BOOKING_WINDOW_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(trainerAvailabilityExceptionsTable)
    .where(
      and(
        eq(trainerAvailabilityExceptionsTable.trainerId, trainerId),
        gte(trainerAvailabilityExceptionsTable.date, from),
        lte(trainerAvailabilityExceptionsTable.date, to),
      ),
    );
  return rows as ExceptionRow[];
}

// ─── Trainer: bookings ───────────────────────────────────────────────────────

router.get("/bookings/upcoming", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: bookingsTable.id,
      clientId: bookingsTable.clientId,
      startsAt: bookingsTable.startsAt,
      durationMinutes: bookingsTable.durationMinutes,
      status: bookingsTable.status,
      clientFirstName: clientsTable.firstName,
      clientLastName: clientsTable.lastName,
    })
    .from(bookingsTable)
    .innerJoin(clientsTable, eq(bookingsTable.clientId, clientsTable.id))
    .where(
      and(
        eq(bookingsTable.trainerId, req.trainer!.id),
        eq(bookingsTable.status, "booked"),
        gte(bookingsTable.startsAt, new Date()),
      ),
    )
    .orderBy(asc(bookingsTable.startsAt));
  res.json(rows);
});

router.patch("/bookings/:id/cancel", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Nieprawidłowe dane żądania. Popraw dane i spróbuj ponownie." });
    return;
  }
  const [row] = await db
    .update(bookingsTable)
    .set({ status: "cancelled_by_trainer", cancelledAt: new Date() })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.trainerId, req.trainer!.id),
        eq(bookingsTable.status, "booked"),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Nie znaleziono aktywnej rezerwacji." });
    return;
  }
  res.json(row);
});

// ─── Client portal ───────────────────────────────────────────────────────────

/** Load the client row and verify booking eligibility (in_person | hybrid). */
async function loadBookableClient(clientId: number) {
  const [client] = await db
    .select({
      id: clientsTable.id,
      trainerId: clientsTable.trainerId,
      cooperationMode: clientsTable.cooperationMode,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId))
    .limit(1);
  if (!client || !client.trainerId) return null;
  return client;
}

function isBookable(mode: string): boolean {
  return mode === "in_person" || mode === "hybrid";
}

// My upcoming booking + eligibility flag (drives the portal card).
router.get("/client-portal/booking", requireClientAuth, async (req, res): Promise<void> => {
  const client = await loadBookableClient(req.client!.id);
  if (!client) {
    res.status(404).json({ error: "Nie znaleziono Twojego profilu." });
    return;
  }
  const bookable = isBookable(client.cooperationMode);
  let booking = null;
  if (bookable) {
    const [row] = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.clientId, client.id),
          eq(bookingsTable.status, "booked"),
          gte(bookingsTable.startsAt, new Date()),
        ),
      )
      .orderBy(asc(bookingsTable.startsAt))
      .limit(1);
    booking = row ?? null;
  }
  res.json({ bookable, booking });
});

// Available slots for the next 30 days.
router.get("/client-portal/booking/slots", requireClientAuth, async (req, res): Promise<void> => {
  const client = await loadBookableClient(req.client!.id);
  if (!client) {
    res.status(404).json({ error: "Nie znaleziono Twojego profilu." });
    return;
  }
  if (!isBookable(client.cooperationMode)) {
    res.status(403).json({ error: BOOKING_FORBIDDEN });
    return;
  }
  const now = new Date();
  const [availability, activeBookings, exceptions] = await Promise.all([
    db
      .select()
      .from(trainerAvailabilityTable)
      .where(eq(trainerAvailabilityTable.trainerId, client.trainerId!)),
    db
      .select({ startsAt: bookingsTable.startsAt })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.trainerId, client.trainerId!),
          eq(bookingsTable.status, "booked"),
          gte(bookingsTable.startsAt, now),
        ),
      ),
    loadWindowExceptions(client.trainerId!, new Date()),
  ]);
  const slots = generateSlots(availability, activeBookings.map((b) => b.startsAt), now, exceptions);
  res.json({
    windowDays: BOOKING_WINDOW_DAYS,
    slots: slots.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      durationMinutes: s.durationMinutes,
    })),
  });
});

// Book a slot. startsAt must exactly match a currently available slot.
router.post("/client-portal/booking", requireClientAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ startsAt: z.string() }).safeParse(req.body);
  const startsAt = parsed.success ? new Date(parsed.data.startsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    res.status(400).json({ error: "Nieprawidłowe dane żądania. Popraw dane i spróbuj ponownie." });
    return;
  }
  const client = await loadBookableClient(req.client!.id);
  if (!client) {
    res.status(404).json({ error: "Nie znaleziono Twojego profilu." });
    return;
  }
  if (!isBookable(client.cooperationMode)) {
    res.status(403).json({ error: BOOKING_FORBIDDEN });
    return;
  }

  // One active upcoming booking per client (MVP rule).
  const existing = await db
    .select({ id: bookingsTable.id })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.clientId, client.id),
        eq(bookingsTable.status, "booked"),
        gte(bookingsTable.startsAt, new Date()),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Masz już zaplanowany trening. Anuluj go, aby wybrać inny termin." });
    return;
  }

  // Server-side re-validation: the requested instant must be a real,
  // currently free slot (never trust the client's slot list).
  const now = new Date();
  const [availability, activeBookings, exceptions] = await Promise.all([
    db
      .select()
      .from(trainerAvailabilityTable)
      .where(eq(trainerAvailabilityTable.trainerId, client.trainerId!)),
    db
      .select({ startsAt: bookingsTable.startsAt })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.trainerId, client.trainerId!),
          eq(bookingsTable.status, "booked"),
          gte(bookingsTable.startsAt, now),
        ),
      ),
    loadWindowExceptions(client.trainerId!, new Date()),
  ]);
  const slot = generateSlots(availability, activeBookings.map((b) => b.startsAt), now, exceptions).find(
    (s) => s.startsAt.getTime() === startsAt.getTime(),
  );
  if (!slot) {
    res.status(409).json({ error: SLOT_TAKEN });
    return;
  }

  try {
    const [row] = await db
      .insert(bookingsTable)
      .values({
        trainerId: client.trainerId!,
        clientId: client.id,
        startsAt: slot.startsAt,
        durationMinutes: slot.durationMinutes,
        status: "booked",
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    // Unique index race: someone booked the same instant between our check
    // and the insert. DB-level protection is the source of truth.
    if (pgErrorCode(err) === "23505") {
      res.status(409).json({ error: SLOT_TAKEN });
      return;
    }
    req.log?.error({ errMessage: err instanceof Error ? err.message : String(err) }, "booking insert failed");
    res.status(500).json({ error: GENERIC_ERROR });
  }
});

// Cancel my booking (fixed simple rule: allowed any time before start).
router.patch("/client-portal/booking/:id/cancel", requireClientAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Nieprawidłowe dane żądania. Popraw dane i spróbuj ponownie." });
    return;
  }
  const [row] = await db
    .update(bookingsTable)
    .set({ status: "cancelled_by_client", cancelledAt: new Date() })
    .where(
      and(
        eq(bookingsTable.id, id),
        eq(bookingsTable.clientId, req.client!.id),
        eq(bookingsTable.status, "booked"),
        gte(bookingsTable.startsAt, new Date()),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Nie znaleziono aktywnej rezerwacji." });
    return;
  }
  res.json(row);
});

export default router;
