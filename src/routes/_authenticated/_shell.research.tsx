import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

import { workspacesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/research")({
  head: () => ({
    meta: [
      { title: "Research — Amanda" },
      { name: "description", content: "Your active research workspaces." },
      { property: "og:title", content: "Research — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  const { data: workspaces } = useQuery(workspacesQuery("active"));
  const research = workspaces?.filter((workspace) => workspace.workspace_type === "research");

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-3xl tracking-tight">Research</h1>
      <div className="mt-8 flex flex-col divide-y divide-border">
        {research?.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">
            No research yet. Create a workspace and choose Research as its type to begin.
          </p>
        )}
        {research?.map((workspace) => (
          <Link
            key={workspace.id}
            to="/w/$workspaceId"
            params={{ workspaceId: workspace.id }}
            className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent"
          >
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{workspace.name}</p>
              {workspace.description && (
                <p className="truncate text-sm text-muted-foreground">{workspace.description}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
