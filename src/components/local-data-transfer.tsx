import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
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
import { isDesktopApp } from "@/lib/database";
import {
  createLocalBackup,
  parseLocalBackup,
  restoreLocalBackup,
  type LocalBackup,
} from "@/lib/local-backup";

const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

export function LocalDataTransfer() {
  const queryClient = useQueryClient();
  const desktop = isDesktopApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<LocalBackup | null>(null);

  async function exportBackup() {
    setBusy(true);
    try {
      const backup = await createLocalBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `amanda-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success("Local backup exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function selectBackup(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      toast.error("Backup files must be under 100 MB");
      return;
    }
    try {
      const backup = parseLocalBackup(await file.text());
      setPendingBackup(backup);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function restoreBackup() {
    if (!pendingBackup) return;
    setBusy(true);
    try {
      await restoreLocalBackup(pendingBackup);
      await queryClient.invalidateQueries();
      setPendingBackup(null);
      toast.success("Backup merged into Amanda’s local database");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-3 flex flex-col gap-4 rounded-lg border border-border p-4">
        <p className="text-sm text-muted-foreground">
          Export your projects, conversations, notes, tasks, plans, memories, and research sources
          to a JSON file. Restoring merges records by ID and never deletes records that are not in
          the backup. Model weights are not included.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportBackup()} disabled={!desktop || busy}>
            <Download data-icon="inline-start" />
            Export backup
          </Button>
          <Button onClick={() => fileInput.current?.click()} disabled={!desktop || busy}>
            <Upload data-icon="inline-start" />
            Restore backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose an Amanda backup file"
            disabled={!desktop || busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void selectBackup(file);
            }}
          />
        </div>
        {!desktop && (
          <p className="text-xs text-muted-foreground">
            Backup and restore are available in the installed desktop app, where Amanda can access
            its local database.
          </p>
        )}
      </div>

      <AlertDialog
        open={pendingBackup !== null}
        onOpenChange={(open) => !open && setPendingBackup(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge this Amanda backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Records with matching IDs will be updated. Records that only exist on this device will
              be kept. The import is validated and applied as one database transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restoreBackup()} disabled={busy}>
              Merge backup
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
