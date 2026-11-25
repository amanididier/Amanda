const databasePath = "sqlite:amanda.db";

export type SqlBindings = unknown[];

let databasePromise: ReturnType<typeof loadDatabase> | undefined;

function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadDatabase() {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load(databasePath);
}

async function getDatabase() {
  if (!isDesktopRuntime()) {
    throw new Error("Local data is available in the Amanda desktop app.");
  }

  databasePromise ??= loadDatabase();
  return databasePromise;
}

export async function selectRows<Row>(query: string, bindings: SqlBindings = []): Promise<Row[]> {
  if (!isDesktopRuntime()) return [];
  const database = await getDatabase();
  return database.select<Row[]>(query, bindings);
}

export async function executeSql(query: string, bindings: SqlBindings = []) {
  const database = await getDatabase();
  return database.execute(query, bindings);
}

export function isDesktopApp() {
  return isDesktopRuntime();
}
