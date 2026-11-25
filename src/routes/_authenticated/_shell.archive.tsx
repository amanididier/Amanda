import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { executeSql } from "@/lib/database";
import { workspacesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/archive")({
  head: () => ({
    meta: [
      { title: "Archive — Amanda" },
      { name: "description", content: "Archived workspaces and notes." },
      { property: "og:title", content: "Archive — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const queryClient = useQueryClient();
  const { data: archived } = useQuery(workspacesQuery("archived"));

  async function handleRestore(id: string) {
    try {
      await executeSql("UPDATE workspaces SET status = $1, updated_at = $2 WHERE id = $3", [
        "active",
        new Date().toISOString(),
        id,
      ]);
      toast.success("Workspace restored");
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    } catch {
      toast.error("Could not restore workspace");
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-3xl tracking-tight">Archive</h1>
      <div className="mt-8 flex flex-col divide-y divide-border">
        {archived?.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">Nothing archived yet.</p>
        )}
        {archived?.map((ws) => (
          <div key={ws.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{ws.name}</p>
              <p className="text-xs text-muted-foreground">
                {ws.workspace_type === "research" ? "Research hub" : "Project"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleRestore(ws.id)}>
              <ArchiveRestore className="h-3.5 w-3.5" />
              Restore
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
