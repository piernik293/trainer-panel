import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const trainerNotesTable = pgTable("trainer_notes", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTrainerNoteSchema = createInsertSchema(trainerNotesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrainerNote = z.infer<typeof insertTrainerNoteSchema>;
export type TrainerNote = typeof trainerNotesTable.$inferSelect;
