import { invoke } from "@tauri-apps/api/core";

import { selectRows } from "@/lib/database";

const TABLES = [
  {
    name: "local_profile",
    primaryKey: "id",
    columns: ["id", "display_name", "preferred_theme", "created_at"],
  },
  {
    name: "workspaces",
    primaryKey: "id",
    columns: [
      "id",
      "name",
      "description",
      "workspace_type",
      "status",
      "is_system",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "conversations",
    primaryKey: "id",
    columns: ["id", "workspace_id", "title", "created_at", "updated_at"],
  },
  {
    name: "messages",
    primaryKey: "id",
    columns: ["id", "conversation_id", "role", "content", "metadata", "created_at"],
  },
  {
    name: "daily_notes",
    primaryKey: "id",
    columns: ["id", "title", "content", "project_id", "created_at", "updated_at", "archived_at"],
  },
  {
    name: "execution_plans",
    primaryKey: "id",
    columns: ["id", "workspace_id", "version", "title", "summary", "created_at", "updated_at"],
  },
  {
    name: "plan_steps",
    primaryKey: "id",
    columns: [
      "id",
      "plan_id",
      "workspace_id",
      "phase",
      "title",
      "details",
      "verification_criteria",
      "status",
      "position",
      "due_date",
      "completed_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "tasks",
    primaryKey: "id",
    columns: [
      "id",
      "project_id",
      "title",
      "description",
      "status",
      "priority",
      "due_date",
      "position",
      "plan_step_id",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "memory_items",
    primaryKey: "id",
    columns: [
      "id",
      "content",
      "category",
      "source",
      "project_id",
      "confidence",
      "archived",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "research_sources",
    primaryKey: "id",
    columns: [
      "id",
      "project_id",
      "title",
      "url",
      "publisher",
      "publication_date",
      "retrieved_at",
      "summary",
      "citation_metadata",
      "archived_at",
    ],
  },
  {
    name: "workspace_activity",
    primaryKey: "id",
    columns: ["id", "workspace_id", "activity_type", "description", "metadata", "created_at"],
  },
  {
    name: "ai_preferences",
    primaryKey: "id",
    columns: [
      "id",
      "provider",
      "model",
      "model_path",
      "context_length",
      "created_at",
      "updated_at",
    ],
  },
] as const;

export type BackupValue = string | number | boolean | null;
type BackupRow = Record<string, BackupValue>;
type TableName = (typeof TABLES)[number]["name"];

export type LocalBackup = {
  formatVersion: 1;
  exportedAt: string;
  tables: Record<TableName, BackupRow[]>;
};

export async function createLocalBackup(): Promise<LocalBackup> {
  const tables = {} as Record<TableName, BackupRow[]>;
  for (const table of TABLES) {
    tables[table.name] = await selectRows<BackupRow>(`SELECT * FROM ${table.name}`);
  }
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function parseLocalBackup(json: string): LocalBackup {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("This file is not valid JSON");
  }

  if (!isRecord(value) || value["formatVersion"] !== 1 || !isRecord(value["tables"])) {
    throw new Error("This is not a supported Amanda backup");
  }
  const backupTables = value["tables"];

  const expectedTableNames = TABLES.map((table) => table.name).sort();
  const actualTableNames = Object.keys(backupTables).sort();
  if (
    expectedTableNames.length !== actualTableNames.length ||
    expectedTableNames.some((name, index) => name !== actualTableNames[index])
  ) {
    throw new Error("The backup does not contain the expected Amanda data tables");
  }

  const tables = {} as Record<TableName, BackupRow[]>;
  for (const table of TABLES) {
    const rows = backupTables[table.name];
    if (!Array.isArray(rows)) throw new Error(`The ${table.name} backup data is invalid`);
    if (rows.length > 100_000) throw new Error(`The ${table.name} table contains too many rows`);
    tables[table.name] = rows.map((row, index) => validateRow(row, table, index));
  }

  return {
    formatVersion: 1,
    exportedAt: typeof value["exportedAt"] === "string" ? value["exportedAt"] : "",
    tables,
  };
}

export async function restoreLocalBackup(backup: LocalBackup) {
  await invoke("restore_local_backup", { backup });
}

function validateRow(value: unknown, table: (typeof TABLES)[number], index: number): BackupRow {
  if (!isRecord(value)) throw new Error(`The ${table.name} row ${index + 1} is invalid`);
  const allowedColumns = new Set<string>(table.columns);
  for (const [column, item] of Object.entries(value)) {
    if (!allowedColumns.has(column)) {
      throw new Error(`The backup contains an unsupported ${table.name}.${column} field`);
    }
    if (item !== null && !["string", "number", "boolean"].includes(typeof item)) {
      throw new Error(`The backup contains an invalid value in ${table.name}.${column}`);
    }
  }
  if (!Object.hasOwn(value, table.primaryKey)) {
    throw new Error(`The ${table.name} row ${index + 1} is missing its ID`);
  }
  return value as BackupRow;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
