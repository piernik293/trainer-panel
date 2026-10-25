/**
 * Testy API tworzą i zmieniają rekordy, więc mogą działać wyłącznie na bazie testowej (nazwa kończy się na `_test`).
 * Używane w vitest.config.ts: przy innej bazie (np. bazie aplikacji z .env) vitest odmawia startu.
 * Prawidłowe uruchomienie: scripts/test-api.sh.
 */
export function databaseNameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

export function isTestDatabaseUrl(url: string | undefined): boolean {
  const name = databaseNameOf(url);
  return name !== null && name.endsWith("_test");
}

export function assertTestDatabase(url: string | undefined): void {
  if (isTestDatabaseUrl(url)) return;
  throw new Error(
    "Testy API odmawiają startu: DATABASE_URL nie wskazuje bazy testowej (nazwa musi kończyć się na „_test”). " +
      "Testy tworzą rekordy — nigdy nie uruchamiaj ich na bazie aplikacji. Użyj: scripts/test-api.sh [pliki…]",
  );
}
