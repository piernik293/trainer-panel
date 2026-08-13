import {
  pgTable,
  serial,
  integer,
  text,
  time,
  timestamp,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { date, index } from "drizzle-orm/pg-core";
import { trainersTable } from "./trainers";
import { clientsTable } from "./clients";

/**
 * Weekly trainer availability — one row per weekday time range.
 * Slots are generated on the fly from these rows; they are never stored.
 */
export const trainerAvailabilityTable = pgTable("trainer_availability", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id")
    .notNull()
    .references(() => trainersTable.id, { onDelete: "cascade" }),
  /** 0 = Monday … 6 = Sunday (ISO weekday order shown in the UI). */
  weekday: integer("weekday").notNull(),
  /** Range start/end, e.g. 16:00–20:00. */
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  /** Session length in minutes (a slot occupies session + buffer). */
  sessionMinutes: integer("session_minutes").notNull().default(60),
  /** Break between sessions in minutes. */
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Bookings — never hard-deleted; cancellation flips status.
 * status: 'booked' | 'cancelled_by_client' | 'cancelled_by_trainer' | 'completed'
 */
export const bookingsTable = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    trainerId: integer("trainer_id")
      .notNull()
      .references(() => trainersTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status").notNull().default("booked"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Double-booking protection: only one ACTIVE booking per trainer+start.
    // Cancelled rows fall out of the index, so the slot frees up again.
    uniqueIndex("bookings_trainer_start_active_idx")
      .on(t.trainerId, t.startsAt)
      .where(sql`status = 'booked'`),
  ],
);

/**
 * One-off exceptions to the weekly availability.
 * type: 'blocked_day' (no times) | 'blocked_range' (start+end)
 *     | 'extra_range' (start+end+session+break)
 * `date` is a calendar day in Europe/Warsaw.
 * Exceptions only affect FREE slot generation — existing bookings are never
 * cancelled or hidden by a later block.
 */
export const trainerAvailabilityExceptionsTable = pgTable(
  "trainer_availability_exceptions",
  {
    id: serial("id").primaryKey(),
    trainerId: integer("trainer_id")
      .notNull()
      .references(() => trainersTable.id, { onDelete: "cascade" }),
    /** Warsaw calendar day (YYYY-MM-DD). */
    date: date("date").notNull(),
    type: text("type").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    sessionDurationMinutes: integer("session_duration_minutes"),
    breakMinutes: integer("break_minutes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("availability_exceptions_trainer_date_idx").on(t.trainerId, t.date)],
);

export type TrainerAvailability = typeof trainerAvailabilityTable.$inferSelect;
export type Booking = typeof bookingsTable.$inferSelect;
export type TrainerAvailabilityException = typeof trainerAvailabilityExceptionsTable.$inferSelect;
