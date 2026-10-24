import { pgTable, serial, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { exercisesTable } from "./exercises";

// Drabinki progresji (docs/DRABINKI.md): uporządkowana lista ćwiczeń jednego wzorca ruchu, od najłatwiejszego.
// level: 'Brak aktywności fizycznej' | 'Początkujący' | 'Średniozaawansowany' | 'Zaawansowany'. Mirrors migration 0022.
export const exerciseLadderStepsTable = pgTable("exercise_ladder_steps", {
  id: serial("id").primaryKey(),
  pattern: text("pattern").notNull(),
  stepOrder: integer("step_order").notNull(),
  level: text("level").notNull(),
  exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("ladder_pattern_exercise_idx").on(t.pattern, t.exerciseId),
  index("ladder_pattern_order_idx").on(t.pattern, t.stepOrder),
]);

export type ExerciseLadderStep = typeof exerciseLadderStepsTable.$inferSelect;
