import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Circle, ListTodo, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LocalRoadmapBoard } from "@/components/local-roadmap-board";
import { LocalWorkspaceChat } from "@/components/local-workspace-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { executeSql, isDesktopApp } from "@/lib/database";
import { workspaceQuery, workspaceTasksQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/w/$workspaceId")({
  head: () => ({
    meta: [
      { title: "Workspace — Amanda" },
      {
        name: "description",
        content: "Your project workspace with Amanda.",
      },
      { property: "og:title", content: "Workspace — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspacePage,
});

type WorkspaceTask = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

function WorkspacePage() {
  const { workspaceId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: workspace, isLoading } = useQuery(workspaceQuery(workspaceId));
  const { data: tasks = [] } = useQuery(workspaceTasksQuery(workspaceId));
  const [activeTab, setActiveTab] = useState<"chat" | "tasks" | "roadmap">("chat");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceTask | null>(null);
  const desktop = isDesktopApp();

  useEffect(() => {
    setDescriptionDraft(workspace?.description ?? "");
  }, [workspace?.description]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-sm text-muted-foreground">
        Workspace not found.
      </div>
    );
  }

  const completedCount = tasks.filter((task) => task.status === "done").length;

  async function addTask() {
    const title = taskTitle.trim();
    if (!title) {
      toast.error("Give the task a title");
      return;
    }
    if (!desktop) {
      toast.error("Open Amanda desktop to save tasks on this device");
      return;
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const position = tasks.reduce((highest, task) => Math.max(highest, task.position), 0) + 1;
    try {
      await executeSql(
        "INSERT INTO tasks (id, project_id, title, status, due_date, position, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [id, workspaceId, title, "todo", taskDueDate || null, position, now, now],
      );
      setTaskTitle("");
      setTaskDueDate("");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task added");
    } catch {
      toast.error("Could not add this task");
    }
  }

  async function toggleTask(task: WorkspaceTask) {
    const status = task.status === "done" ? "todo" : "done";
    try {
      await executeSql("UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3", [
        status,
        new Date().toISOString(),
        task.id,
      ]);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch {
      toast.error("Could not update this task");
    }
  }

  async function deleteTask() {
    if (!deleteTarget) return;
    try {
      await executeSql("DELETE FROM tasks WHERE id = $1", [deleteTarget.id]);
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setDeleteTarget(null);
      toast.success("Task deleted");
    } catch {
      toast.error("Could not delete this task");
    }
  }

  async function saveDescription() {
    try {
      await executeSql("UPDATE workspaces SET description = $1, updated_at = $2 WHERE id = $3", [
        descriptionDraft.trim(),
        new Date().toISOString(),
        workspaceId,
      ]);
      queryClient.setQueryData(["workspace", workspaceId], {
        ...workspace,
        description: descriptionDraft.trim(),
        updated_at: new Date().toISOString(),
      });
      setEditingDescription(false);
      toast.success("Project details saved");
    } catch {
      toast.error("Could not save project details");
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-6 py-5">
      <p className="text-xs tracking-wider text-muted-foreground uppercase">
        {workspace.workspace_type === "research" ? "Research hub" : "Project"}
      </p>
      <h1 className="mt-1 font-serif text-3xl tracking-tight">{workspace.name}</h1>

      <div className="mt-2 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingDescription ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="workspace-description">Workspace objective</Label>
              <Textarea id="workspace-description" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} placeholder="What are you trying to achieve?" className="min-h-20" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void saveDescription()}>Save details</Button>
                <Button size="sm" variant="ghost" onClick={() => { setDescriptionDraft(workspace.description); setEditingDescription(false); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <p className="line-clamp-2 text-sm text-muted-foreground">{workspace.description || "Your goal, conversations, tasks and roadmap in one place."}</p>
          )}
        </div>
        {!editingDescription && <Button variant="ghost" size="sm" onClick={() => setEditingDescription(true)} disabled={!desktop}><Pencil data-icon="inline-start" /> Edit details</Button>}
      </div>
      <nav className="mt-5 flex shrink-0 items-center gap-8 border-b border-border" role="tablist" aria-label="Workspace sections">
        {([["chat", "Chat"], ["tasks", "Tasks"], ["roadmap", "Roadmap"]] as const).map(([tab, label]) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={"relative -mb-px border-b-2 px-0 pb-3 text-sm transition-colors hover:text-foreground " + (activeTab === tab ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground")}>
            {label}{tab === "tasks" && tasks.length > 0 && <span className="ml-2 text-xs text-muted-foreground">{tasks.length}</span>}
          </button>
        ))}
      </nav>

      {activeTab === "tasks" && (
        <div className="min-h-0 flex-1 overflow-y-auto py-5">
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ListTodo aria-hidden="true" className="size-5 text-muted-foreground" />
              Tasks
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {completedCount} of {tasks.length} complete
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor="new-task-title">New task</Label>
            <Input
              id="new-task-title"
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                if (event.nativeEvent.isComposing || event.keyCode === 229) {
                  event.preventDefault();
                  return;
                }
                event.preventDefault();
                void addTask();
              }}
              placeholder="What needs to get done?"
              disabled={!desktop}
            />
          </div>
          <div className="w-40">
            <Label htmlFor="new-task-due">Due date</Label>
            <Input
              id="new-task-due"
              type="date"
              value={taskDueDate}
              onChange={(event) => setTaskDueDate(event.target.value)}
              disabled={!desktop}
            />
          </div>
          <Button onClick={() => void addTask()} disabled={!desktop}>
            <Plus data-icon="inline-start" /> Add task
          </Button>
        </div>

        {!desktop && (
          <p className="mt-3 text-sm text-muted-foreground">
            Project tasks are stored locally. Open the installed Amanda desktop app to add or update
            them.
          </p>
        )}

        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={
                  task.status === "done"
                    ? `Mark ${task.title} incomplete`
                    : `Mark ${task.title} complete`
                }
                aria-pressed={task.status === "done"}
                disabled={!desktop}
                onClick={() => void toggleTask(task)}
              >
                {task.status === "done" ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Circle aria-hidden="true" className="text-muted-foreground" />
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm ${task.status === "done" ? "text-muted-foreground line-through" : "font-medium"}`}
                >
                  {task.title}
                </p>
                {task.due_date && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Due {new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${task.title}`}
                disabled={!desktop}
                onClick={() => setDeleteTarget(task)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          {tasks.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No tasks yet. Add one above to start making progress.
            </p>
          )}
        </div>
      </section>
        </div>
      )}

      {activeTab === "roadmap" && (
        <div className="min-h-0 flex-1 overflow-y-auto py-5">
          {workspace.workspace_type === "project" ? <LocalRoadmapBoard workspaceId={workspace.id} /> : <p className="py-10 text-center text-sm text-muted-foreground">Roadmaps are available in project workspaces.</p>}
        </div>
      )}

      {activeTab === "chat" && (
        <div className="min-h-0 flex-1 overflow-hidden pt-2">
          <LocalWorkspaceChat workspace={workspace} tasks={tasks} landing workspaceLayout />
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{deleteTarget?.title}”. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep task</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteTask()}>Delete task</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
