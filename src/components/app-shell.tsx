import { invoke } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  FlaskConical,
  FolderKanban,
  Home,
  Menu,
  Moon,
  MoreHorizontal,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { executeSql, isDesktopApp } from "@/lib/database";
import { workspacesQuery } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { createWorkspace, type WorkspaceType } from "@/lib/workspaces";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/notes", label: "Daily Notes", icon: NotebookPen },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/research", label: "Research", icon: FlaskConical },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const startupAttempted = useRef(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isDesktopApp() || startupAttempted.current) return;
    startupAttempted.current = true;
    queryClient.setQueryData(["model-boot-state"], "starting");
    void (async () => {
      const cached = queryClient.getQueryData<{ baseUrl: string; apiKey: string }>(["model-connection"]);
      if (cached) { queryClient.setQueryData(["model-boot-state"], "ready"); return; }
      const status = await invoke<{ installed: boolean; modelPath: string }>("get_model_status");
      let selectedPath = "";
      try { selectedPath = window.localStorage.getItem("amanda-selected-model-path") ?? ""; } catch { selectedPath = ""; }
      if (!selectedPath && status.installed) selectedPath = status.modelPath;
      if (!selectedPath) {
        const models = await invoke<Array<{ path: string; isDefault: boolean }>>("list_local_models");
        selectedPath = models.find((model) => model.isDefault)?.path ?? models[0]?.path ?? "";
      }
      if (!selectedPath) { queryClient.setQueryData(["model-boot-state"], "missing"); return; }
      const connection = await invoke<{ baseUrl: string; apiKey: string }>("start_local_model", { modelPath: selectedPath });
      const testResponse = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connection.apiKey}`,
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          messages: [{ role: "user", content: "Reply with exactly: Amanda is ready." }],
          max_tokens: 24,
          temperature: 0.1,
          stream: false,
        }),
      });
      if (!testResponse.ok) throw new Error(`The local model test returned HTTP ${testResponse.status}`);
      const testResult = (await testResponse.json()) as { choices?: Array<{ message?: { content?: string } }> };
      if (!testResult.choices?.[0]?.message?.content?.trim()) throw new Error("The model started but did not return a chat response.");
      queryClient.setQueryData(["model-connection"], connection);
      queryClient.setQueryData(["model-boot-state"], "ready");
      void queryClient.invalidateQueries({ queryKey: ["model-status"] });
    })().catch((error: unknown) => {
      queryClient.setQueryData(["model-boot-state"], "error");
      queryClient.setQueryData(["model-boot-error"], error instanceof Error ? error.message : String(error));
    });
  }, [queryClient]);

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden overscroll-none bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-serif text-lg">Amanda</span>
        </div>

        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: workspaces } = useQuery(workspacesQuery("active"));

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  async function handleArchive(id: string) {
    try {
      await executeSql("UPDATE workspaces SET status = $1, updated_at = $2 WHERE id = $3", [
        "archived",
        new Date().toISOString(),
        id,
      ]);
      toast.success("Workspace archived");
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      if (pathname === `/w/${id}`) navigate({ to: "/" });
    } catch {
      toast.error("Could not archive workspace");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await executeSql("DELETE FROM workspaces WHERE id = $1", [deleteTarget.id]);
      toast.success("Workspace deleted");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      if (pathname === `/w/${deleteTarget.id}`) navigate({ to: "/" });
    } catch {
      toast.error("Could not delete workspace");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Wordmark */}
      <div className={cn("flex items-center gap-2 px-3 py-3", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <Link to="/" className="font-serif text-xl tracking-tight">
            Amanda
          </Link>
        )}
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7", !collapsed && "ml-auto")}
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                active && "bg-sidebar-accent font-medium",
                collapsed && "justify-center px-0",
              )}
              title={label}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Workspaces */}
      {!collapsed && (
        <div className="mt-6 flex min-h-0 flex-1 flex-col px-2">
          <div className="flex items-center justify-between px-2.5 pb-1">
            <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Workspaces
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setCreateOpen(true)}
              aria-label="Create workspace"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {workspaces?.length === 0 && (
              <p className="px-2.5 py-2 text-xs text-muted-foreground">No workspaces yet.</p>
            )}
            {workspaces?.map((ws) => {
              const active = pathname === `/w/${ws.id}`;
              const Icon = ws.workspace_type === "research" ? FlaskConical : FolderKanban;
              return (
                <div
                  key={ws.id}
                  className={cn(
                    "group flex items-center rounded-md text-sm transition-colors hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent font-medium",
                  )}
                >
                  <Link
                    to="/w/$workspaceId"
                    params={{ workspaceId: ws.id }}
                    onClick={onNavigate}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{ws.name}</span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                        aria-label={`Options for ${ws.name}`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onClick={() => setRenameTarget({ id: ws.id, name: ws.name })}
                      >
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(ws.id)}>
                        Archive
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTarget({ id: ws.id, name: ws.name })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      {/* Bottom section */}
      <div className="flex flex-col gap-0.5 border-t border-sidebar-border px-2 py-2">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
            collapsed && "justify-center px-0",
          )}
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          {!collapsed && (theme === "dark" ? "Light mode" : "Dark mode")}
        </button>
        <Link
          to="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-sidebar-accent",
            pathname === "/settings" && "bg-sidebar-accent font-medium",
            collapsed && "justify-center px-0",
          )}
          title="Settings"
        >
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
          {!collapsed && "Settings"}
        </Link>
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground",
            collapsed && "justify-center px-0",
          )}
          title="Your data stays on this device"
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            A
          </span>
          {!collapsed && <span className="truncate">Local workspace</span>}
        </div>
      </div>

      {/* Create workspace dialog */}
      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
          onNavigate?.();
          navigate({ to: "/w/$workspaceId", params: { workspaceId: id } });
        }}
      />

      {/* Rename dialog */}
      <RenameWorkspaceDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRenamed={() => {
          setRenameTarget(null);
          queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the workspace, its conversations, notes, and execution plan.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete workspace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
  defaultType = "project",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
  defaultType?: WorkspaceType;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<WorkspaceType>(defaultType);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Give the workspace a name");
      return;
    }
    setBusy(true);
    try {
      const workspace = await createWorkspace(type, name);
      toast.success(type === "research" ? "Research hub created" : "Project created");
      setName("");
      onCreated(workspace.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create workspace");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
          <DialogDescription>
            A workspace has its own conversation with Amanda, execution plan, and notes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research assistant app"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as WorkspaceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project">Project</SelectItem>
                <SelectItem value="research">Research hub</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameWorkspaceDialog({
  target,
  onClose,
  onRenamed,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    setName(target?.name ?? "");
  }, [target]);

  async function handleRename() {
    if (!target || !name.trim()) return;
    try {
      await executeSql("UPDATE workspaces SET name = $1, updated_at = $2 WHERE id = $3", [
        name.trim(),
        new Date().toISOString(),
        target.id,
      ]);
      toast.success("Workspace renamed");
      onRenamed();
    } catch {
      toast.error("Could not rename workspace");
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleRename}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
