import { invoke } from "@tauri-apps/api/core";

import { executeSql, selectRows } from "@/lib/database";
import type { LocalModelToolCall } from "@/lib/local-model-stream";

type RoadmapStep = {
  phase: string;
  title: string;
  details: string;
  verificationCriteria: string;
};

export type LocalAction =
  | { name: "propose_task"; title: string; description: string; dueDate: string | null }
  | { name: "propose_note"; title: string; content: string }
  | { name: "propose_memory"; content: string; category: string }
  | { name: "complete_task"; taskId: string }
  | { name: "propose_roadmap"; title: string; summary: string; steps: RoadmapStep[] };

export const LOCAL_ACTION_TOOLS = [
  {
    type: "function",
    function: {
      name: "propose_task",
      description:
        "Propose a project task only when the user explicitly asks to add or create a task. The user must confirm before it is saved.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 160 },
          description: { type: "string", maxLength: 1200 },
          dueDate: { type: ["string", "null"], description: "Optional ISO date, YYYY-MM-DD" },
        },
        required: ["title", "description", "dueDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_note",
      description:
        "Propose a project note only when the user explicitly asks to create or save a note. The user must confirm before it is saved.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 120 },
          content: { type: "string", maxLength: 6000 },
        },
        required: ["title", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_memory",
      description:
        "Propose a reusable memory only when the user explicitly says to remember or save this detail. The user must confirm before it is saved.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", maxLength: 2000 },
          category: { type: "string", maxLength: 80 },
        },
        required: ["content", "category"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Propose marking an existing task complete only when the user explicitly asks. Use an exact task ID from the supplied project context. The user must confirm.",
      parameters: {
        type: "object",
        properties: { taskId: { type: "string", maxLength: 120 } },
        required: ["taskId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_roadmap",
      description:
        "Propose a project roadmap only when the user explicitly asks for a roadmap or plan and enough details are known. Ask one focused clarification question in ordinary text first if key details are missing. The user must approve before the roadmap and generated tasks are saved.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 120 },
          summary: { type: "string", maxLength: 2000 },
          steps: {
            type: "array",
            minItems: 3,
            maxItems: 10,
            items: {
              type: "object",
              properties: {
                phase: { type: "string", maxLength: 80 },
                title: { type: "string", maxLength: 160 },
                details: { type: "string", maxLength: 1200 },
                verificationCriteria: { type: "string", maxLength: 800 },
              },
              required: ["phase", "title", "details", "verificationCriteria"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "summary", "steps"],
        additionalProperties: false,
      },
    },
  },
] as const;

export function parseLocalAction(call: LocalModelToolCall): LocalAction {
  let value: unknown;
  try {
    value = JSON.parse(call.arguments);
  } catch {
    throw new Error("Amanda proposed an action with invalid structured data");
  }
  if (!isRecord(value)) throw new Error("Amanda proposed an invalid action");

  switch (call.name) {
    case "propose_task":
      assertKeys(value, ["title", "description", "dueDate"]);
      return {
        name: call.name,
        title: readString(value["title"], "task title", 160),
        description: readString(value["description"], "task description", 1200, true),
        dueDate: readOptionalDate(value["dueDate"]),
      };
    case "propose_note":
      assertKeys(value, ["title", "content"]);
      return {
        name: call.name,
        title: readString(value["title"], "note title", 120),
        content: readString(value["content"], "note content", 6000),
      };
    case "propose_memory":
      assertKeys(value, ["content", "category"]);
      return {
        name: call.name,
        content: readString(value["content"], "memory", 2000),
        category: readString(value["category"], "memory category", 80, true) || "general",
      };
    case "complete_task":
      assertKeys(value, ["taskId"]);
      return { name: call.name, taskId: readString(value["taskId"], "task ID", 120) };
    case "propose_roadmap":
      assertKeys(value, ["title", "summary", "steps"]);
      if (
        !Array.isArray(value["steps"]) ||
        value["steps"].length < 3 ||
        value["steps"].length > 10
      ) {
        throw new Error("A roadmap must contain between 3 and 10 steps");
      }
      return {
        name: call.name,
        title: readString(value["title"], "roadmap title", 120),
        summary: readString(value["summary"], "roadmap summary", 2000, true),
        steps: value["steps"].map((step, index) => parseRoadmapStep(step, index)),
      };
    default:
      throw new Error("Amanda proposed an unsupported action");
  }
}

function parseRoadmapStep(value: unknown, index: number): RoadmapStep {
  if (!isRecord(value)) throw new Error(`Roadmap step ${index + 1} is invalid`);
  assertKeys(value, ["phase", "title", "details", "verificationCriteria"]);
  return {
    phase: readString(value["phase"], `phase for step ${index + 1}`, 80),
    title: readString(value["title"], `title for step ${index + 1}`, 160),
    details: readString(value["details"], `details for step ${index + 1}`, 1200, true),
    verificationCriteria: readString(
      value["verificationCriteria"],
      `completion criteria for step ${index + 1}`,
      800,
      true,
    ),
  };
}

export async function executeApprovedLocalAction(action: LocalAction, workspaceId: string) {
  const workspaces = await selectRows<{
    workspace_type: string;
    status: string;
    is_system: number;
  }>("SELECT workspace_type, status, is_system FROM workspaces WHERE id = $1 LIMIT 1", [
    workspaceId,
  ]);
  if (
    workspaces[0]?.workspace_type !== "project" ||
    workspaces[0]?.status !== "active" ||
    workspaces[0]?.is_system !== 0
  ) {
    throw new Error("Actions can only be approved inside an active project workspace");
  }

  const now = new Date().toISOString();
  if (action.name === "propose_roadmap") {
    const saved = await invoke<{ planId: string; version: number; taskCount: number }>(
      "save_approved_roadmap",
      {
        roadmap: {
          workspaceId,
          title: action.title,
          summary: action.summary,
          steps: action.steps,
        },
      },
    );
    return `Roadmap saved as version ${saved.version}; ${saved.taskCount} tasks were added to this project.`;
  }

  if (action.name === "propose_task") {
    await executeSql(
      "INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, position, created_at, updated_at) VALUES ($1, $2, $3, $4, 'todo', 'normal', $5, (SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE project_id = $2), $6, $6)",
      [crypto.randomUUID(), workspaceId, action.title, action.description, action.dueDate, now],
    );
    return `Task “${action.title}” was added to this project.`;
  }

  if (action.name === "propose_note") {
    await executeSql(
      "INSERT INTO daily_notes (id, title, content, project_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)",
      [crypto.randomUUID(), action.title, action.content, workspaceId, now],
    );
    return `Note “${action.title}” was saved to this project.`;
  }

  if (action.name === "propose_memory") {
    await executeSql(
      "INSERT INTO memory_items (id, content, category, source, project_id, confidence, archived, created_at, updated_at) VALUES ($1, $2, $3, 'assistant', $4, 0.8, 0, $5, $5)",
      [crypto.randomUUID(), action.content, action.category, workspaceId, now],
    );
    return "The memory was saved for this project.";
  }

  const tasks = await selectRows<{ id: string }>(
    "SELECT id FROM tasks WHERE id = $1 AND project_id = $2 AND status != 'done' LIMIT 1",
    [action.taskId, workspaceId],
  );
  if (tasks.length === 0) throw new Error("That open task could not be found in this project");
  await executeSql(
    "UPDATE tasks SET status = 'done', updated_at = $1 WHERE id = $2 AND project_id = $3",
    [now, action.taskId, workspaceId],
  );
  return "The project task was marked complete.";
}

function readString(value: unknown, label: string, maxLength: number, allowEmpty = false) {
  if (typeof value !== "string") throw new Error(`The ${label} must be text`);
  const trimmed = value.trim();
  if ((!allowEmpty && !trimmed) || trimmed.length > maxLength) {
    throw new Error(
      `The ${label} must be ${allowEmpty ? "at most" : "between 1 and"} ${maxLength} characters`,
    );
  }
  return trimmed;
}

function readOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const date = readString(value, "due date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("The task due date must be a valid YYYY-MM-DD date");
  }
  const dateValue = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== date) {
    throw new Error("The task due date must be a valid YYYY-MM-DD date");
  }
  return date;
}

function assertKeys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error("Amanda proposed an action with unsupported fields");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
