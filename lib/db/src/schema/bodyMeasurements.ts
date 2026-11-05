import { pgTable, serial, integer, numeric, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

/** Migracja 0077: masa ciała i obwody wpisywane przez osobę (jeden wpis na dzień). Tylko dla niej; bez ocen i celów. */
export const bodyMeasurementsTable = pgTable("body_measurements", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  measuredOn: date("measured_on").notNull(),
  weightKg: numeric("weight_kg", { precision: 5, scale: 1 }),
  waistCm: numeric("waist_cm", { precision: 4, scale: 1 }),
  hipsCm: numeric("hips_cm", { precision: 4, scale: 1 }),
  chestCm: numeric("chest_cm", { precision: 4, scale: 1 }),
  armCm: numeric("arm_cm", { precision: 4, scale: 1 }),
  thighCm: numeric("thigh_cm", { precision: 4, scale: 1 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("body_measurements_client_day_idx").on(t.clientId, t.measuredOn)]);
