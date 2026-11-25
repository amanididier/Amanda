import { executeSql, selectRows } from "@/lib/database";

export type WorkspaceType = "project" | "research";

export type LocalWorkspace = {
  id: string;
  name: string;
  description: string;
  workspace_type: WorkspaceType;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

type LocalConversation = {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

/** Creates a workspace with its initial conversation and activity record. */
export async function createWorkspace(type: WorkspaceType, name: string, description = "") {
  const now = new Date().toISOString();
  const workspace: LocalWorkspace = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled project",
    description,
    workspace_type: type,
    status: "active",
    created_at: now,
    updated_at: now,
  };
  const conversationId = crypto.randomUUID();

  await executeSql(
    "INSERT INTO workspaces (id, name, description, workspace_type, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      workspace.id,
      workspace.name,
      workspace.description,
      workspace.workspace_type,
      workspace.status,
      now,
      now,
    ],
  );
  await executeSql(
    "INSERT INTO conversations (id, workspace_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
    [conversationId, workspace.id, "Amanda", now, now],
  );
  await executeSql(
    "INSERT INTO workspace_activity (id, workspace_id, activity_type, description, created_at) VALUES ($1, $2, $3, $4, $5)",
    [
      crypto.randomUUID(),
      workspace.id,
      "workspace_created",
      `Created ${type} “${workspace.name}”`,
      now,
    ],
  );

  return workspace;
}

/** Returns the workspace's first conversation, creating one if missing. */
export async function ensureConversation(workspaceId: string) {
  const existing = await selectRows<LocalConversation>(
    "SELECT * FROM conversations WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1",
    [workspaceId],
  );
  if (existing[0]) return existing[0];

  const conversation: LocalConversation = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    title: "Amanda",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await executeSql(
    "INSERT INTO conversations (id, workspace_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
    [
      conversation.id,
      conversation.workspace_id,
      conversation.title,
      conversation.created_at,
      conversation.updated_at,
    ],
  );
  return conversation;
}

/** Sends note content into a workspace conversation as a user message. */
export async function sendNoteToWorkspace(workspaceId: string, noteContent: string) {
  const conversation = await ensureConversation(workspaceId);
  await executeSql(
    "INSERT INTO messages (id, conversation_id, role, content) VALUES ($1, $2, $3, $4)",
    [crypto.randomUUID(), conversation.id, "user", noteContent],
  );
  return conversation;
}
