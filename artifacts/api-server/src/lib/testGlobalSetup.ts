/**
 * Przed każdym przebiegiem testów API: usuwa z bazy TESTOWEJ profile „Mój trening” (migracja 0064 / db-setup na bazie testowej dodaje je
 * pozostałym fixturom trenerów i psuje testy, które zakładają, że trener nie ma konta podopiecznego). Testy, które ich potrzebują, tworzą je same.
 * Działa wyłącznie na bazie `*_test` (testGuard) i tylko na wierszach „Mój trening” z tym samym kontem co trener.
 */
import { pool } from "@workspace/db";
import { assertTestDatabase } from "./testGuard";

export default async function setup(): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  try {
    await pool.query(`delete from clients c using trainers t where c.clerk_user_id = t.clerk_user_id and c.first_name = 'Mój trening' and c.last_name = ''`);
  } finally { await pool.end(); }
}
