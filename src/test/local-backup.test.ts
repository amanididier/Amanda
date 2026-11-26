import { describe, expect, it } from "vitest";

import { parseLocalBackup } from "@/lib/local-backup";

const tableNames = [
  "local_profile",
  "workspaces",
  "conversations",
  "messages",
  "daily_notes",
  "execution_plans",
  "plan_steps",
  "tasks",
  "memory_items",
  "research_sources",
  "workspace_activity",
  "ai_preferences",
];

function backupWith(tables: Record<string, unknown[]>) {
  return JSON.stringify({ formatVersion: 1, exportedAt: "2026-01-01T00:00:00.000Z", tables });
}

function emptyBackup(): Record<string, unknown[]> {
  return Object.fromEntries(tableNames.map((name) => [name, []]));
}

describe("local backup validation", () => {
  it("accepts a complete empty backup", () => {
    const backup = parseLocalBackup(backupWith(emptyBackup()));
    expect(backup.formatVersion).toBe(2);
    expect(Object.keys(backup.tables)).toHaveLength(tableNames.length + 1);
    expect(backup.tables["local_attachments"]).toEqual([]);
  });

  it("accepts version 2 backups containing note and conversation attachments", () => {
    const tables = {
      ...emptyBackup(),
      daily_notes: [{ id: "note-1", images: '["data:image/png;base64,AA=="]' }],
      local_attachments: [
        {
          id: "attachment-1",
          note_id: "note-1",
          message_id: null,
          name: "notes.pdf",
          mime_type: "application/pdf",
          kind: "document",
          size_bytes: 120,
          data_url: null,
          extracted_text: "Readable document text",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const backup = parseLocalBackup(
      JSON.stringify({ formatVersion: 2, exportedAt: "2026-01-01T00:00:00.000Z", tables }),
    );
    expect(backup.tables["local_attachments"]).toHaveLength(1);
  });

  it("rejects incomplete backups and unsupported database columns", () => {
    expect(() => parseLocalBackup(backupWith({}))).toThrow("expected Amanda data tables");

    const tables = emptyBackup();
    tables["workspaces"] = [{ id: "workspace-1", name: "Projects", unexpected: "value" }];
    expect(() => parseLocalBackup(backupWith(tables))).toThrow(
      "unsupported workspaces.unexpected field",
    );
  });

  it("rejects nested values and rows without their primary key", () => {
    const nestedTables = emptyBackup();
    nestedTables["messages"] = [
      {
        id: "message-1",
        conversation_id: "conversation-1",
        role: "user",
        content: { unsafe: true },
      },
    ];
    expect(() => parseLocalBackup(backupWith(nestedTables))).toThrow(
      "invalid value in messages.content",
    );

    const missingIdTables = emptyBackup();
    missingIdTables["workspaces"] = [{ name: "Projects" }];
    expect(() => parseLocalBackup(backupWith(missingIdTables))).toThrow("missing its ID");
  });
});
