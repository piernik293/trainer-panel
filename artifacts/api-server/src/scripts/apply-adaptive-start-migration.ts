import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(
    sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS adaptive_start_decision TEXT`,
  );
  console.log("adaptive_start_decision column ensured on clients table");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
