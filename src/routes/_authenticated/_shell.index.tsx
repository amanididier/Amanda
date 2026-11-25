import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Circle, FolderKanban, NotebookPen } from "lucide-react";

import { LocalWorkspaceChat } from "@/components/local-workspace-chat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  activeTasksQuery,
  generalAssistantWorkspaceQuery,
  notesQuery,
  workspacesQuery,
} from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/")({
  head: () => ({
    meta: [
      { title: "Home — Amanda" },
      {
        name: "description",
        content: "Your Amanda dashboard: projects, tasks, and ideas.",
      },
      { property: "og:title", content: "Home — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  const { data: workspaces = [] } = useQuery(workspacesQuery());
  const { data: notes = [] } = useQuery(notesQuery());
  const { data: tasks = [] } = useQuery(activeTasksQuery);
  const { data: generalAssistantWorkspace, isLoading: loadingAssistant } = useQuery(
    generalAssistantWorkspaceQuery,
  );
  const projects = workspaces.filter((workspace) => workspace.workspace_type === "project");
  const recentProjects = projects.slice(0, 3);
  const recentNotes = notes.slice(0, 3);
  const activeTasks = tasks.slice(0, 5);
  const projectsById = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-wider text-muted-foreground uppercase">
            Your local workspace
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">{greeting}</h1>
          <p className="mt-3 text-muted-foreground">
            What would you like to make progress on today?
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/notes">
              <NotebookPen data-icon="inline-start" />
              New note
            </Link>
          </Button>
          <Button asChild>
            <Link to="/projects">
              <FolderKanban data-icon="inline-start" />
              Projects
            </Link>
          </Button>
        </div>
      </div>

      {generalAssistantWorkspace ? (
        <LocalWorkspaceChat workspace={generalAssistantWorkspace} tasks={[]} />
      ) : !loadingAssistant ? (
        <p className="mt-8 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          General local chat is available in the installed Amanda desktop app.
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-3xl">{projects.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Stored on this device</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-3xl">{tasks.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Across active projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-serif text-3xl">{notes.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ideas saved locally</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Recent projects</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/projects">
                View all
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recentProjects.length === 0 && (
              <p className="py-5 text-sm text-muted-foreground">
                Your projects will appear here when you create one.
              </p>
            )}
            {recentProjects.map((project) => (
              <Link
                key={project.id}
                to="/w/$workspaceId"
                params={{ workspaceId: project.id }}
                className="rounded-md px-3 py-2 transition-colors hover:bg-accent"
              >
                <span className="block truncate text-sm font-medium">{project.name}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {project.description || "No project description yet"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Recent notes</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/notes">
                View all
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recentNotes.length === 0 && (
              <p className="py-5 text-sm text-muted-foreground">
                Your latest saved thoughts will appear here.
              </p>
            )}
            {recentNotes.map((note) => (
              <Link
                key={note.id}
                to="/notes"
                className="rounded-md px-3 py-2 transition-colors hover:bg-accent"
              >
                <span className="block truncate text-sm font-medium">{note.title}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {note.content || "No additional text"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Next up</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/projects">
                Open tasks
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {activeTasks.length === 0 && (
              <p className="py-5 text-sm text-muted-foreground">
                No open tasks. Create a task inside a project when you are ready.
              </p>
            )}
            {activeTasks.map((task) => (
              <Link
                key={task.id}
                to="/w/$workspaceId"
                params={{ workspaceId: task.project_id }}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <Circle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                <span className="max-w-32 truncate text-xs text-muted-foreground">
                  {projectsById.get(task.project_id)}
                </span>
                {task.due_date && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(`${task.due_date}T00:00:00`).toLocaleDateString()}
                  </span>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
