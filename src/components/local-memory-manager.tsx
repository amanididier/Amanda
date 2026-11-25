import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Brain, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { executeSql, isDesktopApp, selectRows } from "@/lib/database";
import { workspacesQuery } from "@/lib/queries";

const NO_PROJECT = "__none__";

type MemoryItem = {
  id: string;
  content: string;
  category: string;
  source: string;
  project_id: string | null;
  confidence: number;
  archived: number;
  created_at: string;
  updated_at: string;
};

type MemoryDraft = Pick<MemoryItem, "id" | "content" | "category" | "project_id">;

export function LocalMemoryManager() {
  const queryClient = useQueryClient();
  const desktop = isDesktopApp();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [projectId, setProjectId] = useState(NO_PROJECT);
  const [editing, setEditing] = useState<MemoryDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null);
  const { data: projects = [] } = useQuery(workspacesQuery("active"));
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["memory-items", showArchived, search],
    queryFn: async () => {
      const trimmed = search.trim();
      const visibility = showArchived ? "archived = 1" : "archived = 0";
      if (!trimmed) {
        return selectRows<MemoryItem>(
          `SELECT * FROM memory_items WHERE ${visibility} ORDER BY updated_at DESC LIMIT 300`,
        );
      }
      const pattern = `%${trimmed}%`;
      return selectRows<MemoryItem>(
        `SELECT * FROM memory_items WHERE ${visibility} AND (content LIKE $1 OR category LIKE $1) ORDER BY updated_at DESC LIMIT 300`,
        [pattern],
      );
    },
  });

  function clearDraft() {
    setEditing(null);
    setContent("");
    setCategory("general");
    setProjectId(NO_PROJECT);
  }

  function beginEdit(memory: MemoryItem) {
    setEditing({
      id: memory.id,
      content: memory.content,
      category: memory.category,
      project_id: memory.project_id,
    });
    setContent(memory.content);
    setCategory(memory.category);
    setProjectId(memory.project_id ?? NO_PROJECT);
  }

  async function saveMemory() {
    const value = content.trim();
    const normalizedCategory = category.trim() || "general";
    if (!value) {
      toast.error("Add a detail before saving this memory");
      return;
    }
    if (value.length > 2_000 || normalizedCategory.length > 80) {
      toast.error("Keep memories under 2,000 characters and categories under 80 characters");
      return;
    }
    if (!desktop) {
      toast.error("Open Amanda desktop to save memories on this device");
      return;
    }

    try {
      const now = new Date().toISOString();
      const linkedProject = projectId === NO_PROJECT ? null : projectId;
      if (editing) {
        await executeSql(
          "UPDATE memory_items SET content = $1, category = $2, project_id = $3, updated_at = $4 WHERE id = $5",
          [value, normalizedCategory, linkedProject, now, editing.id],
        );
        toast.success("Memory updated");
      } else {
        await executeSql(
          "INSERT INTO memory_items (id, content, category, source, project_id, confidence, archived, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
          [crypto.randomUUID(), value, normalizedCategory, "user", linkedProject, 1, 0, now, now],
        );
        toast.success("Memory saved on this device");
      }
      clearDraft();
      await queryClient.invalidateQueries({ queryKey: ["memory-items"] });
    } catch {
      toast.error("Could not save this memory");
    }
  }

  async function toggleArchived(memory: MemoryItem) {
    try {
      await executeSql("UPDATE memory_items SET archived = $1, updated_at = $2 WHERE id = $3", [
        memory.archived ? 0 : 1,
        new Date().toISOString(),
        memory.id,
      ]);
      await queryClient.invalidateQueries({ queryKey: ["memory-items"] });
      toast.success(memory.archived ? "Memory restored" : "Memory archived");
    } catch {
      toast.error("Could not update this memory");
    }
  }

  async function deleteMemory() {
    if (!deleteTarget) return;
    try {
      await executeSql("DELETE FROM memory_items WHERE id = $1", [deleteTarget.id]);
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["memory-items"] });
      toast.success("Memory permanently deleted");
    } catch {
      toast.error("Could not delete this memory");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-lg border border-border p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Brain aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Save a memory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Amanda only keeps details you choose to save. Memories stay on this device and can be
              edited, archived, or deleted at any time.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memory-content">What should Amanda remember?</Label>
            <Textarea
              id="memory-content"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="A preference, important detail, or fact you want to reuse…"
              maxLength={2_000}
              className="min-h-24"
              disabled={!desktop}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memory-category">Category</Label>
              <Input
                id="memory-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                maxLength={80}
                placeholder="general"
                disabled={!desktop}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Project (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={!desktop}>
                <SelectTrigger aria-label="Associate memory with a project">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_PROJECT}>All projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveMemory()} disabled={!desktop || !content.trim()}>
              {editing ? "Save changes" : "Save memory"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={clearDraft}>
                Cancel edit
              </Button>
            )}
          </div>
        </div>
        {!desktop && (
          <p className="mt-4 text-xs text-muted-foreground">
            Memory storage is available in the installed Amanda desktop app.
          </p>
        )}
      </section>

      <section aria-labelledby="saved-memories-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="saved-memories-heading" className="text-lg font-semibold">
              {showArchived ? "Archived memories" : "Saved memories"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {memories.length} {memories.length === 1 ? "memory" : "memories"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived((archived) => !archived)}
          >
            {showArchived ? "Show active" : "Show archived"}
          </Button>
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="memory-search">Search saved memories</Label>
          <Input
            id="memory-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value.slice(0, 120))}
            placeholder="Search by detail or category"
          />
        </div>
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {isLoading && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading memories…</p>
          )}
          {!isLoading && memories.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {search ? "No memories match your search." : "No memories saved yet."}
            </p>
          )}
          {memories.map((memory) => (
            <article
              key={memory.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words text-sm">{memory.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {memory.category} ·{" "}
                  {memory.project_id ? "Project memory" : "Available across projects"} · Updated{" "}
                  {new Date(memory.updated_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {!memory.archived && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit memory"
                    onClick={() => beginEdit(memory)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={memory.archived ? "Restore memory" : "Archive memory"}
                  onClick={() => void toggleArchived(memory)}
                >
                  <ArchiveRestore aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete memory permanently"
                  onClick={() => setDeleteTarget(memory)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this memory permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              Amanda will no longer retrieve this saved detail. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep memory</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteMemory()}>Delete memory</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
