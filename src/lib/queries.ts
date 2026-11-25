import { queryOptions } from "@tanstack/react-query";

import { selectRows } from "@/lib/database";
import type { LocalWorkspace } from "@/lib/workspaces";

type LocalPlan = {
  id: string;
  workspace_id: string;
  version: number;
  title: string;
  summary: string;
  created_at: string;
  updated_at: string;
};

type LocalPlanStep = {
  id: string;
  plan_id: string;
  workspace_id: string;
  position: number;
  title: string;
  status: "pending" | "done";
};

type LocalConversation = {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type LocalMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type LocalNote = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  archived_at: string | null;
};

export const workspacesQuery = (status: "active" | "archived" = "active") =>
  queryOptions({
    queryKey: ["workspaces", status],
    queryFn: () =>
      selectRows<LocalWorkspace>(
        "SELECT * FROM workspaces WHERE status = $1 ORDER BY updated_at DESC",
        [status],
      ),
  });

export const workspaceQuery = (id: string) =>
  queryOptions({
    queryKey: ["workspace", id],
    queryFn: async () => {
      const rows = await selectRows<LocalWorkspace>(
        "SELECT * FROM workspaces WHERE id = $1 LIMIT 1",
        [id],
      );
      return rows[0] ?? null;
    },
  });

export const allPlanStepsQuery = queryOptions({
  queryKey: ["plan-steps"],
  queryFn: () => selectRows<LocalPlanStep>("SELECT * FROM plan_steps ORDER BY position ASC"),
});

export const workspacePlanQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["plan", workspaceId],
    queryFn: async () => {
      const plans = await selectRows<LocalPlan>(
        "SELECT * FROM execution_plans WHERE workspace_id = $1 ORDER BY version DESC LIMIT 1",
        [workspaceId],
      );
      const plan = plans[0] ?? null;
      if (!plan) return { plan: null, steps: [] };
      const steps = await selectRows<LocalPlanStep>(
        "SELECT * FROM plan_steps WHERE plan_id = $1 ORDER BY position ASC",
        [plan.id],
      );
      return { plan, steps };
    },
  });

export const conversationQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["conversation", workspaceId],
    queryFn: async () => {
      const conversations = await selectRows<LocalConversation>(
        "SELECT * FROM conversations WHERE workspace_id = $1 ORDER BY created_at ASC LIMIT 1",
        [workspaceId],
      );
      return conversations[0] ?? null;
    },
  });

export const messagesQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["messages", conversationId],
    queryFn: () =>
      selectRows<LocalMessage>(
        "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
        [conversationId],
      ),
  });

export const notesQuery = (archived = false) =>
  queryOptions({
    queryKey: ["daily-notes", archived],
    queryFn: () =>
      selectRows<LocalNote>(
        `SELECT * FROM daily_notes WHERE archived_at ${archived ? "IS NOT NULL" : "IS NULL"} ORDER BY updated_at DESC`,
      ),
  });
