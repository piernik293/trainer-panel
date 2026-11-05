import { pgTable, serial, integer, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { exercisesTable } from "./exercises";

/** Migracja 0081: animacja ćwiczenia (dane: kąty stawów w klatkach kluczowych) + status szkic / do sprawdzenia / zatwierdzona (kto i kiedy). W aplikacji widać tylko zatwierdzone. */
export const exerciseAnimationsTable = pgTable("exercise_animations", {
  id: serial("id").primaryKey(),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "cascade" }),
  spec: jsonb("spec").notNull(),
  status: text("status").notNull().default("review"), // 'draft' | 'review' | 'approved'
  reviewNote: text("review_note"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("exercise_animations_exercise_idx").on(t.exerciseId)]);
