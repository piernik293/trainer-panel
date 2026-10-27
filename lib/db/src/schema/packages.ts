import { pgTable, serial, integer, text, numeric, date, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { trainersTable } from "./trainers";
import { clientsTable } from "./clients";

// Pakiety sesji podopiecznego (migration 0051). Bez płatności online; cena opcjonalna i widoczna tylko dla trenera.
export const clientPackagesTable = pgTable("client_packages", {
  id: serial("id").primaryKey(),
  trainerId: integer("trainer_id").notNull().references(() => trainersTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Pakiet sesji"),
  totalSessions: integer("total_sessions").notNull(),
  pricePln: numeric("price_pln", { precision: 8, scale: 2 }),
  validUntil: date("valid_until"),
  showToClient: boolean("show_to_client").notNull().default(false),
  status: text("status").notNull().default("active"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("client_packages_one_active_idx").on(t.clientId).where(sql`${t.status} = 'active'`),
  index("client_packages_trainer_idx").on(t.trainerId, t.status),
]);

export const packageSessionsTable = pgTable("package_sessions", {
  id: serial("id").primaryKey(),
  packageId: integer("package_id").notNull().references(() => clientPackagesTable.id, { onDelete: "cascade" }),
  heldOn: date("held_on").notNull().defaultNow(),
  note: text("note"),
  voidedAt: timestamp("voided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("package_sessions_package_idx").on(t.packageId)]);

export type ClientPackage = typeof clientPackagesTable.$inferSelect;
export type PackageSession = typeof packageSessionsTable.$inferSelect;
