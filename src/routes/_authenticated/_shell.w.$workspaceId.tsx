import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Circle, ListTodo, Plus, Trash2, MessageSquare, Map } from "lucide-react";
import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { executeSql, isDesktopApp } from "@/lib/database";
import { workspaceQuery, workspaceTasksQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/w/$workspaceId")({
  head: () => ({
    meta: [
      { title: "Workspace — Amanda" },
      {
        name: "description",
        content: "Your focused workspace with Amanda.",
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
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceTask | null>(null);
  const desktop = isDesktopApp();


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
        [id, workspaceId, title, "todo", null, position, now, now],
      );
      setTaskTitle("");
      setAddTaskOpen(false);
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



  return (
    <div className="flex h-full min-h-0 flex-col px-6 py-5">
      <nav className="flex shrink-0 items-center justify-center gap-12 border-b border-border" role="tablist" aria-label="Workspace sections">
        {([
          ["chat", "Chat", MessageSquare],
          ["tasks", "Tasks", ListTodo],
          ["roadmap", "Roadmap", Map],
        ] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={"relative -mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm transition-colors hover:text-foreground " + (activeTab === tab ? "border-foreground font-semibold text-foreground" : "border-transparent text-muted-foreground")}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
            {tab === "tasks" && tasks.length > 0 && <span className="text-xs text-muted-foreground">{tasks.length}</span>}
          </button>
        ))}
      </nav>

      {activeTab === "tasks" && (
        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-5 flex items-center justify-end">
              <Button onClick={() => setAddTaskOpen(true)} disabled={!desktop}>
                <Plus data-icon="inline-start" /> Add task
              </Button>
            </div>

            {tasks.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">There are no tasks yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {tasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 shrink-0"
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
                        className={`break-words whitespace-normal text-sm ${task.status === "done" ? "text-muted-foreground line-through" : "font-medium"}`}
                      >
                        {task.title}
                      </p>
                      {task.description?.trim() && (
                        <p className="mt-1 break-words whitespace-normal text-sm text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                      {task.due_date && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due {new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-2 mt-0.5 h-8 w-8 min-w-8 max-w-8 shrink-0 self-start px-0"
                      aria-label={`Delete ${task.title}`}
                      disabled={!desktop}
                      onClick={() => setDeleteTarget(task)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a task</DialogTitle>
            <DialogDescription>Add a clear next action to this project. You can add more details later.</DialogDescription>
          </DialogHeader>
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
            placeholder="What needs to be done?"
            autoFocus
            disabled={!desktop}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaskOpen(false)}>Cancel</Button>
            <Button onClick={() => void addTask()} disabled={!desktop || !taskTitle.trim()}>Add task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeTab === "roadmap" && (
        <div className="min-h-0 flex-1 overflow-y-auto py-5">
          {workspace.workspace_type === "project" ? <LocalRoadmapBoard workspaceId={workspace.id} /> : <p className="py-10 text-center text-sm text-muted-foreground">Roadmaps are available in project workspaces.</p>}
        </div>
      )}

      {activeTab === "chat" && (
        <div className="min-h-0 flex-1 overflow-hidden pt-2">
          <LocalWorkspaceChat
            workspace={workspace}
            tasks={tasks}
            landing
            workspaceLayout
            onRoadmapSaved={() => setActiveTab("roadmap")}
          />
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
