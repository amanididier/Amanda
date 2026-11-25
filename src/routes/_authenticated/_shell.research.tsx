import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical } from "lucide-react";

import { workspacesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/research")({
  head: () => ({
    meta: [
      { title: "Research — Amanda" },
      { name: "description", content: "Your research hubs and inquiries." },
      { property: "og:title", content: "Research — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  const { data: workspaces } = useQuery(workspacesQuery("active"));
  const hubs = workspaces?.filter((w) => w.workspace_type === "research");

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-3xl tracking-tight">Research</h1>
      <div className="mt-8 flex flex-col divide-y divide-border">
        {hubs?.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">
            No research hubs yet. Create one from the sidebar to start an
            inquiry.
          </p>
        )}
        {hubs?.map((ws) => (
          <Link
            key={ws.id}
            to="/w/$workspaceId"
            params={{ workspaceId: ws.id }}
            className="flex items-center gap-3 py-3 transition-colors hover:bg-accent -mx-2 px-2 rounded-md"
          >
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{ws.name}</p>
              {ws.description && (
                <p className="truncate text-sm text-muted-foreground">
                  {ws.description}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
