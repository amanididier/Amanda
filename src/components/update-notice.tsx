import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { isDesktopApp } from "@/lib/database";

type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;
type UpdateCheckStatus = {
  status: "checking" | "available" | "current" | "error";
  version?: string;
  message?: string;
};
type InstallPhase = "idle" | "downloading" | "installing";

function publishUpdateStatus(detail: UpdateCheckStatus) {
  window.dispatchEvent(new CustomEvent<UpdateCheckStatus>("amanda:update-check-status", { detail }));
}

export function UpdateNotice() {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);
  const updateRef = useRef<AvailableUpdate | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;

    let active = true;
    let checking = false;
    let lastCheckedAt = 0;

    const checkForUpdate = async () => {
      if (checking || !active) return;
      checking = true;
      publishUpdateStatus({ status: "checking" });

      try {
        const update = await check({ timeout: 30_000 });
        if (!active) {
          await update?.close();
          return;
        }

        if (updateRef.current && updateRef.current !== update) {
          await updateRef.current.close();
        }
        updateRef.current = update;
        setAvailableUpdate(update);

        publishUpdateStatus(
          update
            ? { status: "available", version: update.version }
            : { status: "current" },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.debug("Amanda update check unavailable", error);
        publishUpdateStatus({ status: "error", message });
      } finally {
        checking = false;
        lastCheckedAt = Date.now();
      }
    };

    const requestManualCheck = () => void checkForUpdate();
    const checkWhenReturning = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheckedAt > 30 * 60 * 1000) {
        void checkForUpdate();
      }
    };

    void checkForUpdate();
    const interval = window.setInterval(() => void checkForUpdate(), 6 * 60 * 60 * 1000);
    window.addEventListener("amanda:check-for-updates", requestManualCheck);
    window.addEventListener("focus", checkWhenReturning);
    document.addEventListener("visibilitychange", checkWhenReturning);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("amanda:check-for-updates", requestManualCheck);
      window.removeEventListener("focus", checkWhenReturning);
      document.removeEventListener("visibilitychange", checkWhenReturning);
      const pending = updateRef.current;
      updateRef.current = null;
      if (pending) void pending.close();
    };
  }, []);

  async function installUpdate() {
    const update = updateRef.current;
    if (!update || phase !== "idle") return;

    setPhase("downloading");
    setDownloadedBytes(0);
    setContentLength(null);

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setContentLength(event.data.contentLength ?? null);
        } else if (event.event === "Progress") {
          setDownloadedBytes((current) => current + event.data.chunkLength);
        } else if (event.event === "Finished") {
          setPhase("installing");
        }
      }, { restartAfterInstall: true });
      // On Windows the NSIS updater launches the installer and restarts Amanda.
      // This fallback covers platforms where the updater returns without restarting.
      await relaunch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Amanda update installation failed", error);
      try {
        await update.close();
      } catch {
        // The updater may already have released the resource.
      }
      updateRef.current = null;
      setAvailableUpdate(null);
      setPhase("idle");
      publishUpdateStatus({ status: "error", message });
    }
  }

  if (!availableUpdate) return null;

  const progressPercent =
    contentLength && contentLength > 0
      ? Math.min(100, Math.floor((downloadedBytes / contentLength) * 100))
      : null;
  const buttonLabel =
    phase === "installing"
      ? "Installing update…"
      : phase === "downloading"
        ? progressPercent === null
          ? "Downloading update…"
          : `Downloading update · ${progressPercent}%`
        : `Update available · v${availableUpdate.version}`;

  return (
    <div className="fixed right-4 top-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        onClick={() => void installUpdate()}
        disabled={phase !== "idle"}
        className="rounded-full border border-border bg-foreground px-4 text-background shadow-lg hover:bg-foreground/90"
        aria-live="polite"
      >
        {phase !== "idle" ? (
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        {buttonLabel}
      </Button>
      {phase !== "idle" && (
        <div
          className="w-full rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium">
              {phase === "installing" ? "Finishing installation" : "Downloading Amanda update"}
            </span>
            {phase === "downloading" && progressPercent !== null && (
              <span className="tabular-nums text-muted-foreground">{progressPercent}%</span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={
                "h-full rounded-full bg-foreground transition-[width] duration-200 " +
                (progressPercent === null && phase === "downloading" ? "w-1/3 animate-pulse" : "")
              }
              style={{ width: phase === "installing" ? "100%" : progressPercent === null ? undefined : `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Keep Amanda open while the update is prepared. Your local data and AI model are kept separately from the app update.
          </p>
        </div>
      )}
    </div>
  );
}
