import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArrowLeft, FilePlus2, ImagePlus, Search, Trash2 } from "lucide-react";
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
  images: string;
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
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [draggingImages, setDraggingImages] = useState(false);
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
  const activeNote = notes.find((note) => note.id === selectedId) ?? null;

  useEffect(() => {
    if (!activeNote) {
      setDraftTitle("");
      setDraftContent("");
      setDraftProjectId("none");
      setDraftImages([]);
      setDirty(false);
      return;
    }
    setSelectedId(activeNote.id);
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
    setDraftProjectId(activeNote.project_id ?? "none");
    try { setDraftImages(JSON.parse(activeNote.images || "[]") as string[]); } catch { setDraftImages([]); }
    setDirty(false);
  }, [activeNote]);

  useEffect(() => {
    if (!dirty || !activeNote || !desktop) return;
    const noteId = activeNote.id;
    const title = draftTitle.trim() || "Untitled note";
    const content = draftContent;
    const projectId = draftProjectId === "none" ? null : draftProjectId;
    const images = JSON.stringify(draftImages);
    const updatedAt = new Date().toISOString();
    const timer = window.setTimeout(() => {
      void executeSql(
        "UPDATE daily_notes SET title = $1, content = $2, project_id = $3, updated_at = $4, images = $5 WHERE id = $6",
        [title, content, projectId, updatedAt, images, noteId],
      )
        .then(() => {
          queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) =>
            current.map((note) =>
              note.id === noteId
                ? { ...note, title, content, project_id: projectId, updated_at: updatedAt, images }
                : note,
            ),
          );
          setDirty(false);
        })
        .catch(() => toast.error("Could not save this note"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeNote, desktop, draftContent, draftImages, draftProjectId, draftTitle, dirty, queryClient]);

  async function createNote() {
    if (!desktop) {
      toast.error("Open Amanda desktop to save notes on this device");
      return;
    }
    const id = crypto.randomUUID();
    try {
      await executeSql(
        "INSERT INTO daily_notes (id, title, content, created_at, updated_at, images) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, "Untitled note", "", new Date().toISOString(), new Date().toISOString(), "[]"],
      );
      queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) => [
        {
          id,
          title: "Untitled note",
          content: "",
          project_id: null,
          updated_at: new Date().toISOString(),
          images: "[]",
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


  async function addImages(files: FileList | File[]) {
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!selected.length) return;
    if (selected.some((file) => file.size > 5 * 1024 * 1024)) {
      toast.error("Each image must be 5 MB or smaller");
      return;
    }
    if (draftImages.length + selected.length > 8) {
      toast.error("A note can contain up to 8 images");
      return;
    }
    const encoded = await Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image"));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    })));
    setDraftImages((current) => [...current, ...encoded]);
    setDirty(true);
  }

  async function backToNotes() {
    if (activeNote && dirty && desktop) {
      const title = draftTitle.trim() || "Untitled note";
      const projectId = draftProjectId === "none" ? null : draftProjectId;
      const images = JSON.stringify(draftImages);
      const updatedAt = new Date().toISOString();
      try {
        await executeSql(
          "UPDATE daily_notes SET title = $1, content = $2, project_id = $3, updated_at = $4, images = $5 WHERE id = $6",
          [title, draftContent, projectId, updatedAt, images, activeNote.id],
        );
        queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) =>
          current.map((note) =>
            note.id === activeNote.id
              ? { ...note, title, content: draftContent, project_id: projectId, updated_at: updatedAt, images }
              : note,
          ),
        );
        setDirty(false);
      } catch {
        toast.error("Could not save this note");
        return;
      }
    }
    setSelectedId(null);
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
    <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Notes</h1>
        <p className="mt-2 text-sm text-muted-foreground">A calm space for thoughts, drafts, and ideas.</p>
      </div>

      {!desktop && (
        <p className="mt-5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Notes are stored locally. Open the installed Amanda desktop app to create or edit them.
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor="notes-search" className="sr-only">Search notes</Label>
          <Search aria-hidden="true" className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            id="notes-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your notes"
            className="h-10 w-full pl-9"
          />
        </div>
        {!activeNote && (
          <Button onClick={() => void createNote()} disabled={!desktop} className="shrink-0">
            <FilePlus2 data-icon="inline-start" /> Create note
          </Button>
        )}
      </div>

      {activeNote ? (
        <section
          aria-label="Note editor"
          className={`mt-6 min-h-[65vh] rounded-lg border border-border bg-card px-5 py-5 sm:px-10 sm:py-8 ${draggingImages ? "border-primary bg-muted/30" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDraggingImages(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImages(false); }}
          onDrop={(event) => { event.preventDefault(); setDraggingImages(false); void addImages(event.dataTransfer.files); }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <Button variant="ghost" size="sm" onClick={() => void backToNotes()}>
              <ArrowLeft data-icon="inline-start" /> All notes
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground" aria-live="polite">{dirty ? "Saving…" : "Saved on this device"}</span>
              <Button variant="outline" size="sm" onClick={() => void archiveNote()} disabled={!desktop}>
                <Archive data-icon="inline-start" /> Archive
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete note" onClick={() => setDeleteOpen(true)} disabled={!desktop}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-5">
            <Input
              id="note-title"
              value={draftTitle}
              onChange={(event) => { setDraftTitle(event.target.value); setDirty(true); }}
              placeholder="Untitled note"
              className="h-auto border-0 bg-transparent px-0 font-serif text-3xl shadow-none focus-visible:ring-0 sm:text-4xl"
              disabled={!desktop}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Select value={draftProjectId} onValueChange={(value) => { setDraftProjectId(value); setDirty(true); }} disabled={!desktop}>
                <SelectTrigger id="note-project" className="w-48 border-0 bg-muted/50">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
                <ImagePlus className="size-4" /> Add images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  disabled={!desktop}
                  onChange={(event) => { if (event.target.files) void addImages(event.target.files); event.currentTarget.value = ""; }}
                />
              </label>
            </div>
            {draftImages.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {draftImages.map((image, index) => (
                  <div key={index} className="group relative overflow-hidden rounded-md border border-border">
                    <img src={image} alt={`Note attachment ${index + 1}`} className="max-h-64 w-full object-cover" />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      onClick={() => { setDraftImages((current) => current.filter((_, itemIndex) => itemIndex !== index)); setDirty(true); }}
                    >Remove</Button>
                  </div>
                ))}
              </div>
            )}
            <Textarea
              id="note-content"
              value={draftContent}
              onChange={(event) => { setDraftContent(event.target.value); setDirty(true); }}
              placeholder="Start writing…"
              className="min-h-[42vh] resize-y border-0 bg-transparent px-0 text-base leading-7 shadow-none focus-visible:ring-0"
              disabled={!desktop}
            />
            <p className="text-xs text-muted-foreground">Drop images anywhere on this page, or use Add images. Images are saved with this note on your device.</p>
          </div>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes “{activeNote.title || "Untitled note"}”. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep note</AlertDialogCancel>
                <AlertDialogAction onClick={() => void deleteNote()}>Delete note</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      ) : (
        <section aria-label="Your notes" className="mt-6">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading notes…</p>
          ) : filteredNotes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
              <p className="font-serif text-2xl">Your notes will live here.</p>
              <p className="mt-2 text-sm text-muted-foreground">{search ? "No notes match your search." : "Create your first note whenever an idea arrives."}</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => setSelectedId(note.id)}
                  className="min-h-36 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="block truncate text-base font-medium">{note.title || "Untitled note"}</span>
                  <span className="mt-2 line-clamp-4 block whitespace-pre-wrap text-sm text-muted-foreground">{note.content || "No text yet"}</span>
                  <span className="mt-4 block text-xs text-muted-foreground">{new Date(note.updated_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
