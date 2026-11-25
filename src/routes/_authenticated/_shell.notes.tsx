import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, FilePlus2, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { executeSql, isDesktopApp } from "@/lib/database";
import { notesQuery, workspacesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/notes")({
  head: () => ({
    meta: [
      { title: "Daily Notes — Amanda" },
      { name: "description", content: "Capture ideas and daily thoughts." },
      { property: "og:title", content: "Daily Notes — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotesPage,
});

type Note = {
  id: string;
  title: string;
  content: string;
  project_id: string | null;
  updated_at: string;
};

function NotesPage() {
  const queryClient = useQueryClient();
  const { data: notes = [], isLoading } = useQuery(notesQuery());
  const { data: workspaces = [] } = useQuery(workspacesQuery("active"));
  const projects = workspaces.filter((workspace) => workspace.workspace_type === "project");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftProjectId, setDraftProjectId] = useState<string>("none");
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const desktop = isDesktopApp();

  const filteredNotes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    if (!normalized) return notes;
    return notes.filter(
      (note) =>
        note.title.toLocaleLowerCase().includes(normalized) ||
        note.content.toLocaleLowerCase().includes(normalized),
    );
  }, [notes, search]);
  const activeNote = notes.find((note) => note.id === selectedId) ?? filteredNotes[0] ?? null;

  useEffect(() => {
    if (!activeNote) {
      setDraftTitle("");
      setDraftContent("");
      setDraftProjectId("none");
      setDirty(false);
      return;
    }
    setSelectedId(activeNote.id);
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
    setDraftProjectId(activeNote.project_id ?? "none");
    setDirty(false);
  }, [activeNote]);

  useEffect(() => {
    if (!dirty || !activeNote || !desktop) return;
    const noteId = activeNote.id;
    const title = draftTitle.trim() || "Untitled note";
    const content = draftContent;
    const projectId = draftProjectId === "none" ? null : draftProjectId;
    const updatedAt = new Date().toISOString();
    const timer = window.setTimeout(() => {
      void executeSql(
        "UPDATE daily_notes SET title = $1, content = $2, project_id = $3, updated_at = $4 WHERE id = $5",
        [title, content, projectId, updatedAt, noteId],
      )
        .then(() => {
          queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) =>
            current.map((note) =>
              note.id === noteId
                ? { ...note, title, content, project_id: projectId, updated_at: updatedAt }
                : note,
            ),
          );
          setDirty(false);
        })
        .catch(() => toast.error("Could not save this note"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeNote, desktop, draftContent, draftProjectId, draftTitle, dirty, queryClient]);

  async function createNote() {
    if (!desktop) {
      toast.error("Open Amanda desktop to save notes on this device");
      return;
    }
    const id = crypto.randomUUID();
    try {
      await executeSql(
        "INSERT INTO daily_notes (id, title, content, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)",
        [id, "Untitled note", "", new Date().toISOString(), new Date().toISOString()],
      );
      queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) => [
        {
          id,
          title: "Untitled note",
          content: "",
          project_id: null,
          updated_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setSearch("");
      setSelectedId(id);
      toast.success("Note created");
    } catch {
      toast.error("Could not create a note");
    }
  }

  async function archiveNote() {
    if (!activeNote) return;
    try {
      const archivedAt = new Date().toISOString();
      await executeSql("UPDATE daily_notes SET archived_at = $1 WHERE id = $2", [
        archivedAt,
        activeNote.id,
      ]);
      queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) =>
        current.filter((note) => note.id !== activeNote.id),
      );
      queryClient.invalidateQueries({ queryKey: ["daily-notes", true] });
      setSelectedId(null);
      toast.success("Note archived");
    } catch {
      toast.error("Could not archive this note");
    }
  }

  async function deleteNote() {
    if (!activeNote) return;
    try {
      await executeSql("DELETE FROM daily_notes WHERE id = $1", [activeNote.id]);
      queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) =>
        current.filter((note) => note.id !== activeNote.id),
      );
      setSelectedId(null);
      setDeleteOpen(false);
      toast.success("Note deleted");
    } catch {
      toast.error("Could not delete this note");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Daily Notes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A quiet place to capture and revisit ideas.
          </p>
        </div>
        <Button onClick={() => void createNote()} disabled={!desktop}>
          <FilePlus2 data-icon="inline-start" />
          New note
        </Button>
      </div>

      {!desktop && (
        <p className="mt-5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Notes are stored in Amanda&apos;s local database. Open the installed desktop app to create
          or edit them.
        </p>
      )}

      <div className="mt-7 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section aria-label="Your notes" className="min-w-0">
          <Label htmlFor="notes-search" className="sr-only">
            Search notes
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute top-2.5 left-3 size-4 text-muted-foreground"
            />
            <Input
              id="notes-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search notes"
              className="pl-9"
            />
          </div>
          <div className="mt-3 flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {isLoading && <p className="px-3 py-6 text-sm text-muted-foreground">Loading notes…</p>}
            {!isLoading && filteredNotes.length === 0 && (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                {search
                  ? "No notes match your search."
                  : "No notes yet. Create one to get started."}
              </p>
            )}
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setSelectedId(note.id)}
                aria-current={activeNote?.id === note.id ? "true" : undefined}
                className={`rounded-md px-3 py-2 text-left transition-colors hover:bg-accent ${activeNote?.id === note.id ? "bg-accent" : ""}`}
              >
                <span className="block truncate text-sm font-medium">
                  {note.title || "Untitled note"}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {note.content || "No additional text"}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {new Date(note.updated_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section
          aria-label="Note editor"
          className="min-w-0 rounded-lg border border-border p-4 sm:p-6"
        >
          {activeNote ? (
            <>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">
                  {dirty ? "Saving…" : "Saved on this device"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void archiveNote()}
                  disabled={!desktop}
                >
                  <Archive data-icon="inline-start" /> Archive
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete note"
                  onClick={() => setDeleteOpen(true)}
                  disabled={!desktop}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <div className="mt-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="note-title">Title</Label>
                  <Input
                    id="note-title"
                    value={draftTitle}
                    onChange={(event) => {
                      setDraftTitle(event.target.value);
                      setDirty(true);
                    }}
                    placeholder="Untitled note"
                    disabled={!desktop}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="note-project">Project</Label>
                  <Select
                    value={draftProjectId}
                    onValueChange={(value) => {
                      setDraftProjectId(value);
                      setDirty(true);
                    }}
                    disabled={!desktop}
                  >
                    <SelectTrigger id="note-project">
                      <SelectValue placeholder="No project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="note-content">Note</Label>
                  <Textarea
                    id="note-content"
                    value={draftContent}
                    onChange={(event) => {
                      setDraftContent(event.target.value);
                      setDirty(true);
                    }}
                    placeholder="Write down what you want to remember…"
                    className="min-h-[280px] resize-y"
                    disabled={!desktop}
                  />
                </div>
              </div>
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes “{activeNote.title || "Untitled note"}”. This cannot
                      be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep note</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void deleteNote()}>
                      Delete note
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <div className="flex min-h-64 items-center justify-center text-center text-sm text-muted-foreground">
              Select a note or create a new one.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
