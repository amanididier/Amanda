import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isDesktopApp } from "@/lib/database";

type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

export function UpdateNotice() {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;

    let active = true;
    let checking = false;

    const checkForUpdate = async () => {
      if (checking) return;
      checking = true;
      try {
        const update = await check();
        if (active) setAvailableUpdate(update);
      } catch (error) {
        // Update checks are intentionally quiet when offline or when no release is published.
        console.debug("Amanda update check unavailable", error);
      } finally {
        checking = false;
      }
    };

    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), 6 * 60 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  async function installUpdate() {
    if (!availableUpdate || installing) return;
    setInstalling(true);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Amanda could not install the update.");
      setInstalling(false);
    }
  }

  if (!availableUpdate) return null;

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => void installUpdate()}
      disabled={installing}
      className="fixed right-4 top-4 z-[100] rounded-full bg-blue-600 px-4 text-white shadow-lg hover:bg-blue-700"
      aria-live="polite"
    >
      {installing ? (
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {installing ? "Installing update…" : `Update available · v${availableUpdate.version}`}
    </Button>
  );
}
