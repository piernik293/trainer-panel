# Schema conventions

## Append-only per-parent history tables

Tables that record an append-only history for a parent entity (e.g. `surveys` and
`trainer_notes` keyed by `client_id`) must add a composite index on
`(parent_id, created_at desc)` at creation time — don't wait for a slowdown to
notice it's missing.

```ts
export const someHistoryTable = pgTable("some_history", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  // ...other columns
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("some_history_client_id_created_at_idx").on(table.clientId, table.createdAt.desc()),
]);
```

This keeps "latest N for this client/trainer" and "most recent first" queries
fast (dashboard, client detail views, `DISTINCT ON` latest-record lookups)
without a table scan. See `surveys.ts` (`surveys_client_id_created_at_idx`) and
`notes.ts` (`trainer_notes_client_id_created_at_idx`) for existing examples.

Apply the same pattern for any new per-trainer append-only tables, indexing on
`trainer_id` instead.
