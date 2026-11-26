import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft, FilePlus2, FileText, ImagePlus, MessageCircle, Paperclip, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent } from "react";
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
import { createLocalAttachment, createPastedTextAttachment, formatFileSize, type LocalAttachment } from "@/lib/local-attachments";
import { executeSql, isDesktopApp, selectRows } from "@/lib/database";
import { notesQuery, workspacesQuery } from "@/lib/queries";
import { createWorkspace } from "@/lib/workspaces";
import { setPendingWorkspaceMessage } from "@/lib/pending-workspace-prompt";

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

const NOTE_HTML_PREFIX = "<!--amanda-rich-note-->";

type StoredAttachment = LocalAttachment & { noteId: string };
type Note = {
  id: string;
  title: string;
  content: string;
  project_id: string | null;
  updated_at: string;
  images: string;
  attachment_text: string;
};

function notePlainText(content: string) {
  return content
    .replace(NOTE_HTML_PREFIX, "")
    .replace(/<img[^>]*>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function NotesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: notes = [], isLoading } = useQuery(notesQuery());
  const { data: workspaces = [] } = useQuery(workspacesQuery("active"));
  const projects = workspaces.filter((workspace) => workspace.workspace_type === "project");
  const researchWorkspaces = workspaces.filter((workspace) => workspace.workspace_type === "research");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftProjectId, setDraftProjectId] = useState<string>("none");
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [draggingImages, setDraggingImages] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [noteAttachments, setNoteAttachments] = useState<StoredAttachment[]>([]);
  const [previewAttachment, setPreviewAttachment] = useState<StoredAttachment | null>(null);
  const [referenceKind, setReferenceKind] = useState<"image" | "doc">("doc");
  const desktop = isDesktopApp();
  const editorRef = useRef<HTMLDivElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const pendingRange = useRef<Range | null>(null);
  const loadedNoteId = useRef<string | null>(null);
  const editRevision = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  function markDirty() {
    editRevision.current += 1;
    setDirty(true);
  }

  const filteredNotes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    if (!normalized) return notes;
    return notes.filter(
      (note) =>
        note.title.toLocaleLowerCase().includes(normalized) ||
        notePlainText(note.content).toLocaleLowerCase().includes(normalized) ||
        note.attachment_text.toLocaleLowerCase().includes(normalized),
    );
  }, [notes, search]);
  const activeNote = notes.find((note) => note.id === selectedId) ?? null;

  useEffect(() => {
    if (!activeNote) {
      loadedNoteId.current = null;
      setDraftTitle("");
      setDraftContent("");
      setDraftProjectId("none");
      setDraftImages([]);
      setNoteAttachments([]);
      setDirty(false);
      return;
    }
    // Query-cache updates after autosave must never overwrite the live editor
    // value: doing so resets the caret and can discard characters typed meanwhile.
    if (loadedNoteId.current === activeNote.id) return;
    loadedNoteId.current = activeNote.id;
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
    setDraftProjectId(activeNote.project_id ?? "none");
    try { setDraftImages(JSON.parse(activeNote.images || "[]") as string[]); } catch { setDraftImages([]); }
    void selectRows<{ id: string; name: string; mime_type: string; size_bytes: number; kind: StoredAttachment["kind"]; data_url: string | null; extracted_text: string }>(
      "SELECT id, name, mime_type, size_bytes, kind, data_url, extracted_text FROM local_attachments WHERE note_id = $1 ORDER BY created_at ASC",
      [activeNote.id],
    ).then((rows) => {
      if (loadedNoteId.current !== activeNote.id) return;
      setNoteAttachments(rows.map((row) => ({
      id: row.id, noteId: activeNote.id, name: row.name, mimeType: row.mime_type, size: row.size_bytes,
        kind: row.kind, dataUrl: row.data_url, extractedText: row.extracted_text,
      })));
    }).catch(() => toast.error("Could not load this note's attachments"));
    editRevision.current += 1;
    setDirty(false);
  }, [activeNote]);

  useEffect(() => {
    if (!activeNote || !editorRef.current) return;
    const editor = editorRef.current;
    if (activeNote.content.startsWith(NOTE_HTML_PREFIX)) {
      editor.innerHTML = activeNote.content.slice(NOTE_HTML_PREFIX.length);
    } else {
      editor.textContent = activeNote.content;
    }
  // Depend on the note ID, not the refreshed query object: autosave cache updates must not reset the caret.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNote?.id]);

  useEffect(() => {
    if (!dirty || !activeNote || !desktop) return;
    const noteId = activeNote.id;
    const saveRevision = editRevision.current;
    const title = draftTitle.trim() || "Untitled note";
    const content = draftContent;
    const projectId = draftProjectId === "none" ? null : draftProjectId;
    const images = JSON.stringify(draftImages);
    const updatedAt = new Date().toISOString();
    const timer = window.setTimeout(() => {
      // Serialize writes so a slower older write can never land after a newer one.
      saveQueue.current = saveQueue.current.then(async () => {
        await executeSql(
          "UPDATE daily_notes SET title = $1, content = $2, project_id = $3, updated_at = $4, images = $5 WHERE id = $6",
          [title, content, projectId, updatedAt, images, noteId],
        );
        queryClient.setQueryData<Note[]>(["daily-notes", false], (current = []) =>
          current.map((note) =>
            note.id === noteId
              ? { ...note, title, content, project_id: projectId, updated_at: updatedAt, images }
              : note,
          ),
        );
        if (editRevision.current === saveRevision) setDirty(false);
      }).catch(() => toast.error("Could not save this note"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeNote, desktop, draftContent, draftImages, draftProjectId, draftTitle, dirty, queryClient]);

  async function askAmandaAboutNote() {
    if (!activeNote || !desktop) {
      toast.error("Open Amanda desktop to send this note to a workspace");
      return;
    }
    const noteTitle = draftTitle.trim() || "Untitled note";
    const editorHtml = editorRef.current?.innerHTML ?? draftContent.replace(NOTE_HTML_PREFIX, "");
    const noteText = notePlainText(NOTE_HTML_PREFIX + editorHtml);
    const inlineImageUrls = Array.from(editorRef.current?.querySelectorAll("img") ?? [])
      .map((image) => image.src)
      .filter((src) => src.startsWith("data:image/"));
    const documentAttachments = noteAttachments.map((attachment) => ({
      id: crypto.randomUUID(),
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      dataUrl: attachment.dataUrl,
      extractedText: attachment.extractedText,
    })) as LocalAttachment[];
    const imageAttachments = [...draftImages, ...inlineImageUrls].map((dataUrl, index) => ({
      id: crypto.randomUUID(),
      name: `Note image ${index + 1}`,
      mimeType: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/png",
      size: Math.floor(dataUrl.length * 0.75),
      kind: "image" as const,
      dataUrl,
      extractedText: "",
    }));
    const attachmentsForPrompt = [...documentAttachments, ...imageAttachments];
    if (!noteText && attachmentsForPrompt.length === 0) {
      toast.error("Add some note content or an image first");
      return;
    }

    try {
      await saveQueue.current;
      const now = new Date().toISOString();
      const projectId = draftProjectId === "none" ? null : draftProjectId;
      const images = JSON.stringify(draftImages);
      await executeSql(
        "UPDATE daily_notes SET title = $1, content = $2, project_id = $3, updated_at = $4, images = $5 WHERE id = $6",
        [noteTitle, draftContent, projectId, now, images, activeNote.id],
      );
      setDirty(false);

      let targetWorkspace = projectId ? workspaces.find((workspace) => workspace.id === projectId) : undefined;
      if (!targetWorkspace) targetWorkspace = researchWorkspaces[0];
      if (!targetWorkspace) {
        targetWorkspace = await createWorkspace("research", "Notes research");
        await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      }

      const attachmentNames = attachmentsForPrompt.map((attachment) => attachment.name);
      const prompt = [
        `Please review my Daily Note and help me with it. Treat this as my full request, and use the attached images and documents as part of the context.`,
        `Note: ${noteTitle}`,
        noteText,
        attachmentNames.length ? `Attached references: ${attachmentNames.join(", ")}. Please inspect the images and read the documents.` : "",
      ].filter(Boolean).join("\n\n");
      setPendingWorkspaceMessage(prompt, attachmentsForPrompt);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      await navigate({ to: "/w/$workspaceId", params: { workspaceId: targetWorkspace.id } });
      toast.success(`Opening ${targetWorkspace.workspace_type === "research" ? "Research" : "Project"} chat`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send this note to Amanda");
    }
  }

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
          attachment_text: "",
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
    markDirty();
  }

  function insertAtSavedCaret(node: Node) {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    const range = pendingRange.current ?? (selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null);
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      pendingRange.current = null;
    } else {
      editor.append(node);
    }
    editor.focus();
    setDraftContent(NOTE_HTML_PREFIX + editor.innerHTML);
    markDirty();
  }

  async function persistNoteAttachment(attachment: LocalAttachment) {
    if (!activeNote) return;
    const createdAt = new Date().toISOString();
    await executeSql(
      "INSERT INTO local_attachments (id, note_id, name, mime_type, kind, size_bytes, data_url, extracted_text, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [attachment.id, activeNote.id, attachment.name, attachment.mimeType, attachment.kind, attachment.size, attachment.dataUrl, attachment.extractedText, createdAt],
    );
    setNoteAttachments((current) => [...current, { ...attachment, noteId: activeNote.id }]);
    void queryClient.invalidateQueries({ queryKey: ["daily-notes", false] });
    const storedAttachment: StoredAttachment = { ...attachment, noteId: activeNote.id };
    const card = document.createElement("div");
    card.contentEditable = "false";
    card.dataset["amandaAttachmentId"] = attachment.id;
    card.className = "my-3 flex max-w-xl cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm transition-colors hover:bg-muted/70";
    const icon = document.createElement("span");
    icon.className = "flex size-9 shrink-0 items-center justify-center rounded-lg bg-background";
    icon.textContent = "▤";
    const details = document.createElement("span");
    details.className = "min-w-0 flex-1";
    const title = document.createElement("span");
    title.className = "block truncate font-medium";
    title.textContent = attachment.name;
    const summary = document.createElement("span");
    summary.className = "mt-0.5 block truncate text-xs text-muted-foreground";
    summary.textContent = attachment.kind === "pasted-text"
      ? `Pasted text · ${attachment.extractedText.split(/\r?\n/).length} lines · ${attachment.extractedText.slice(0, 90)}`
      : `${formatFileSize(attachment.size)} · ${attachment.extractedText.slice(0, 90)}`;
    details.append(title, summary);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `Remove ${attachment.name}`);
    removeButton.dataset["amandaRemoveAttachment"] = attachment.id;
    removeButton.className = "rounded-md px-2 py-1 text-muted-foreground hover:bg-background";
    removeButton.textContent = "×";
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      void removeNoteAttachment(storedAttachment);
    });
    card.append(icon, details, removeButton);
    card.addEventListener("click", () => setPreviewAttachment(storedAttachment));
    insertAtSavedCaret(card);
  }

  async function handleNoteFile(file: File) {
    try {
      const attachment = await createLocalAttachment(file);
      if (attachment.kind === "image" && attachment.dataUrl) {
        const image = document.createElement("img");
        image.src = attachment.dataUrl;
        image.alt = file.name || "Pasted image";
        image.className = "my-2 mr-4 inline-block h-auto max-w-[42%] rounded-lg border border-border align-top";
        image.style.cssFloat = "left";
        image.style.marginRight = "1rem";
        image.style.marginBottom = "0.75rem";
        insertAtSavedCaret(image);
        return;
      }
      await persistNoteAttachment(attachment);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this file");
    }
  }

  async function handlePastedText(value: string) {
    if (!activeNote) return;
    if (value.length > 100_000) {
      toast.error("This pasted block is too large. Split it into smaller sections.");
      return;
    }
    const attachment = createPastedTextAttachment(value);
    try {
      await persistNoteAttachment(attachment);
    } catch {
      toast.error("Could not save the pasted text block");
    }
  }

  function handleEditorInput() {
    const editor = editorRef.current;
    if (!editor) return;
    setDraftContent(NOTE_HTML_PREFIX + editor.innerHTML);
    markDirty();
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    const node = selection.anchorNode;
    if (node?.nodeType !== Node.TEXT_NODE) return;
    const beforeCaret = (node.textContent ?? "").slice(0, selection.anchorOffset);
    const match = beforeCaret.match(/@(image|doc)$/i);
    if (!match) return;
    const range = selection.getRangeAt(0).cloneRange();
    range.setStart(node, selection.anchorOffset - match[0].length);
    range.deleteContents();
    pendingRange.current = selection.getRangeAt(0).cloneRange();
    setDraftContent(NOTE_HTML_PREFIX + editor.innerHTML);
    setReferenceKind((match[1] ?? "").toLocaleLowerCase() === "image" ? "image" : "doc");
    window.setTimeout(() => attachmentInput.current?.click(), 0);
  }

  function handleEditorPaste(event: ClipboardEvent<HTMLDivElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (files.length) {
      event.preventDefault();
      const selection = window.getSelection();
      pendingRange.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      for (const file of files) void handleNoteFile(file);
      return;
    }
    const pastedText = event.clipboardData.getData("text/plain");
    if (pastedText.length > 1_800) {
      event.preventDefault();
      const selection = window.getSelection();
      pendingRange.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
      void handlePastedText(pastedText);
      return;
    }
    if (event.clipboardData.getData("text/html")) {
      event.preventDefault();
      document.execCommand("insertText", false, pastedText);
    }
  }

  function handleEditorClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const removeButton = target.closest<HTMLElement>("[data-amanda-remove-attachment]");
    if (removeButton) {
      event.preventDefault();
      const attachment = noteAttachments.find((item) => item.id === removeButton.dataset["amandaRemoveAttachment"]);
      if (attachment) void removeNoteAttachment(attachment);
      return;
    }
    const card = target.closest<HTMLElement>("[data-amanda-attachment-id]");
    if (!card) return;
    const attachment = noteAttachments.find((item) => item.id === card.dataset["amandaAttachmentId"]);
    if (attachment) setPreviewAttachment(attachment);
  }

  async function removeNoteAttachment(attachment: StoredAttachment) {
    try {
      await executeSql("DELETE FROM local_attachments WHERE id = $1 AND note_id = $2", [attachment.id, attachment.noteId]);
      setNoteAttachments((current) => current.filter((item) => item.id !== attachment.id));
      void queryClient.invalidateQueries({ queryKey: ["daily-notes", false] });
      setPreviewAttachment(null);
      const card = editorRef.current?.querySelector(`[data-amanda-attachment-id="${attachment.id}"]`);
      card?.remove();
      if (editorRef.current) {
        setDraftContent(NOTE_HTML_PREFIX + editorRef.current.innerHTML);
        markDirty();
      }
    } catch {
      toast.error("Could not remove this attachment");
    }
  }

  async function backToNotes() {
    if (activeNote && dirty && desktop) {
      await saveQueue.current;
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
      {!activeNote && (
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Notes</h1>
          <p className="mt-2 text-sm text-muted-foreground">A calm space for thoughts, drafts, and ideas.</p>
        </div>
      )}

      {!desktop && (
        <p className="mt-5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Notes are stored locally. Open the installed Amanda desktop app to create or edit them.
        </p>
      )}

      {!activeNote && <div className="mt-6 flex items-center gap-3">
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
      </div>}

      {activeNote ? (
        <section
          aria-label="Note editor"
          className={`mt-0 min-h-[calc(100vh-7rem)] w-full rounded-none border-0 bg-transparent px-0 py-5 sm:px-0 sm:py-7 ${draggingImages ? "bg-muted/30" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDraggingImages(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDraggingImages(false); }}
          onDrop={(event) => { event.preventDefault(); setDraggingImages(false); void addImages(event.dataTransfer.files); }}
        >
          <div className="mx-auto mt-0 flex max-w-3xl flex-col gap-5">
            <Input
              id="note-title"
              value={draftTitle}
              onChange={(event) => { setDraftTitle(event.target.value); markDirty(); }}
              placeholder="Untitled note"
              className="h-auto border-0 bg-transparent px-0 font-serif text-4xl tracking-tight shadow-none focus-visible:ring-0 sm:text-5xl"
              disabled={!desktop}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Select value={draftProjectId} onValueChange={(value) => { setDraftProjectId(value); markDirty(); }} disabled={!desktop}>
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
              <Button type="button" variant="outline" size="sm" onClick={() => void askAmandaAboutNote()} disabled={!desktop}>
                <MessageCircle data-icon="inline-start" /> Ask Amanda
              </Button>
            </div>
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
                      onClick={() => { setDraftImages((current) => current.filter((_, itemIndex) => itemIndex !== index)); markDirty(); }}
                    >Remove</Button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={attachmentInput}
              type="file"
              accept={referenceKind === "image" ? "image/*" : ".pdf,.docx,.txt,.md,.csv,.json,.xml,.html,.yaml,.yml"}
              className="sr-only"
              disabled={!desktop}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void handleNoteFile(file);
              }}
            />
            <div
              ref={editorRef}
              id="note-content"
              role="textbox"
              aria-label="Note content"
              aria-multiline="true"
              contentEditable={desktop}
              suppressContentEditableWarning
              data-placeholder="Start writing…"
              onInput={handleEditorInput}
              onPaste={handleEditorPaste}
              onClick={handleEditorClick}
              className="min-h-[42vh] whitespace-pre-wrap break-words rounded-md px-0 py-1 text-base leading-7 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_img]:max-h-[32rem]"
            />
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const selection = window.getSelection();
                pendingRange.current = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
                setReferenceKind("doc");
                attachmentInput.current?.click();
              }} disabled={!desktop}>
                <Paperclip data-icon="inline-start" /> Add reference
              </Button>
            </div>
            {previewAttachment && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewAttachment(null); }}>
                <section role="dialog" aria-modal="true" aria-labelledby="note-attachment-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
                  <header className="flex items-center gap-3 border-b border-border p-4">
                    <FileText className="size-5 text-muted-foreground" />
                    <h3 id="note-attachment-title" className="min-w-0 flex-1 truncate text-sm font-semibold">{previewAttachment.name}</h3>
                    <Button type="button" variant="ghost" size="icon" aria-label="Close preview" onClick={() => setPreviewAttachment(null)}><X /></Button>
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    {previewAttachment.kind === "image" && previewAttachment.dataUrl ? (
                      <img src={previewAttachment.dataUrl} alt={previewAttachment.name} className="mx-auto max-h-[65vh] max-w-full rounded-lg object-contain" />
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{previewAttachment.extractedText || "No text preview is available for this file."}</pre>
                    )}
                  </div>
                  <footer className="flex justify-end gap-2 border-t border-border p-3">
                    <Button type="button" variant="outline" onClick={() => setPreviewAttachment(null)}>Close</Button>
                    <Button type="button" variant="destructive" onClick={() => void removeNoteAttachment(previewAttachment)}>Remove attachment</Button>
                  </footer>
                </section>
              </div>
            )}
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
                  className="h-44 overflow-hidden rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="block truncate text-base font-medium">{note.title || "Untitled note"}</span>
                  <span className="mt-2 line-clamp-4 block whitespace-pre-wrap text-sm text-muted-foreground">{notePlainText(note.content) || note.attachment_text.slice(0, 240) || "No text yet"}</span>
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
