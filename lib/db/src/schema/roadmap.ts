import { pgTable, serial, text, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

/** Migracja 0075: „Wkrótce w Optimatren” — pozycje i głosy „Chcę to” (jeden głos na konto na pozycję). */
export const roadmapItemsTable = pgTable("roadmap_items", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  blurb: text("blurb").notNull(),
  icon: text("icon").notNull().default("star"),
  status: text("status").notNull().default("soon"), // 'soon' | 'in_progress' | 'done'
  hidden: boolean("hidden").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(100),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("roadmap_items_slug_idx").on(t.slug)]);

export const roadmapVotesTable = pgTable("roadmap_votes", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => roadmapItemsTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role").notNull(), // 'trener' | 'solo' | 'podopieczny'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("roadmap_votes_item_user_idx").on(t.itemId, t.clerkUserId)]);
export type RoadmapItem = typeof roadmapItemsTable.$inferSelect;
