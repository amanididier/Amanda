import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { workspaceQuery } from "@/lib/queries";

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

function WorkspacePage() {
  const { workspaceId } = Route.useParams();
  const { data: workspace, isLoading } = useQuery(workspaceQuery(workspaceId));

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-muted-foreground">
        Workspace not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-xs tracking-wider text-muted-foreground uppercase">
        {workspace.workspace_type === "research" ? "Research hub" : "Project"}
      </p>
      <h1 className="mt-1 font-serif text-3xl tracking-tight">{workspace.name}</h1>
      {workspace.description && (
        <p className="mt-2 text-sm text-muted-foreground">{workspace.description}</p>
      )}
      <div className="mt-10 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        The conversation with Amanda and the live execution plan are being built next.
      </div>
    </div>
  );
}
