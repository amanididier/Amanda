import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArchiveRestore, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { executeSql, selectRows } from "@/lib/database";
import { notesQuery, workspacesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/archive")({
  head: () => ({
    meta: [
      { title: "Archive — Amanda" },
      { name: "description", content: "Archived workspaces, notes, and research sources." },
      { property: "og:title", content: "Archive — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArchivePage,
});

type ArchivedResearch = {
  id: string;
  title: string;
  url: string;
  retrieved_at: string;
};

function ArchivePage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<ArchivedResearch | null>(null);
  const { data: archived } = useQuery(workspacesQuery("archived"));
  const { data: archivedNotes } = useQuery(notesQuery(true));
  const { data: archivedResearch = [] } = useQuery({
    queryKey: ["research-sources", "archived"],
    queryFn: () =>
      selectRows<ArchivedResearch>(
        "SELECT id, title, url, retrieved_at FROM research_sources WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 200",
      ),
  });

  async function handleRestoreNote(id: string) {
    try {
      await executeSql("UPDATE daily_notes SET archived_at = NULL, updated_at = $1 WHERE id = $2", [
        new Date().toISOString(),
        id,
      ]);
      toast.success("Note restored");
      queryClient.invalidateQueries({ queryKey: ["daily-notes"] });
    } catch {
      toast.error("Could not restore note");
    }
  }

  async function handleRestoreResearch(id: string) {
    try {
      await executeSql("UPDATE research_sources SET archived_at = NULL WHERE id = $1", [id]);
      await queryClient.invalidateQueries({ queryKey: ["research-sources"] });
      toast.success("Research source restored");
    } catch {
      toast.error("Could not restore this research source");
    }
  }

  async function handleDeleteResearch() {
    if (!deleteTarget) return;
    try {
      await executeSql("DELETE FROM research_sources WHERE id = $1", [deleteTarget.id]);
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["research-sources"] });
      toast.success("Research source permanently deleted");
    } catch {
      toast.error("Could not delete this research source");
    }
  }

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
      <section className="mt-8">
        <h2 className="text-sm font-semibold">Workspaces</h2>
        <div className="mt-2 flex flex-col divide-y divide-border">
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
          {archived?.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No archived workspaces.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Daily notes</h2>
        <div className="mt-2 flex flex-col divide-y divide-border">
          {archivedNotes?.map((note) => (
            <div key={note.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{note.title}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {note.content || "No additional text"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleRestoreNote(note.id)}>
                <ArchiveRestore className="h-3.5 w-3.5" />
                Restore
              </Button>
            </div>
          ))}
          {archivedNotes?.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No archived notes.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Research sources</h2>
        <div className="mt-2 flex flex-col divide-y divide-border">
          {archivedResearch.map((source) => (
            <div key={source.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {source.title}
                </a>
                <p className="text-xs text-muted-foreground">
                  Retrieved {new Date(source.retrieved_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRestoreResearch(source.id)}
              >
                <ArchiveRestore data-icon="inline-start" />
                Restore
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(source)}>
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </div>
          ))}
          {archivedResearch.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No archived research sources.</p>
          )}
        </div>
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this source permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Amanda will remove “{deleteTarget?.title}” from saved research. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep source</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteResearch()}>
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
