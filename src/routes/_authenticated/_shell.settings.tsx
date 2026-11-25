import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  Brain,
  Cpu,
  Download,
  Globe,
  ExternalLink,
  LoaderCircle,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocalDataTransfer } from "@/components/local-data-transfer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isDesktopApp } from "@/lib/database";
import { useTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Amanda" },
      { name: "description", content: "Appearance, local AI model, and privacy." },
      { property: "og:title", content: "Settings — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type ModelStatus = {
  installed: boolean;
  downloading: boolean;
  downloadedBytes: number;
  totalBytes: number;
  modelPath: string;
  runtimeAvailable: boolean;
  running: boolean;
};

type ModelProgress = {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
};

type ModelConnection = { baseUrl: string; apiKey: string };
type LocalModel = { name: string; path: string; sizeBytes: number; isDefault: boolean };
type WebSearchProvider = "firecrawl" | "brave";
type WebSearchStatus = { activeProvider: WebSearchProvider; firecrawlConfigured: boolean; braveConfigured: boolean };

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const desktop = isDesktopApp();
  const [downloadProgress, setDownloadProgress] = useState<ModelProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<ModelConnection | null>(() => queryClient.getQueryData<ModelConnection>(["model-connection"]) ?? null);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [selectedModelPath, setSelectedModelPath] = useState("");
  const { data: localModels = [], refetch: refreshLocalModels } = useQuery({ queryKey: ["local-models"], queryFn: () => invoke<LocalModel[]>("list_local_models"), enabled: desktop });
  const [webProvider, setWebProvider] = useState<WebSearchProvider>("firecrawl");
  const [webApiKey, setWebApiKey] = useState("");
  const [savingWebKey, setSavingWebKey] = useState(false);
  const { data: webSearchStatus, refetch: refreshWebSearchStatus } = useQuery({ queryKey: ["web-search-status"], queryFn: () => invoke<WebSearchStatus>("get_web_search_status"), enabled: desktop });
  const {
    data: modelStatus,
    refetch: refreshModelStatus,
    isLoading: modelStatusLoading,
  } = useQuery({
    queryKey: ["model-status"],
    queryFn: () => invoke<ModelStatus>("get_model_status"),
    enabled: desktop,
  });

  useEffect(() => {
    if (webSearchStatus?.activeProvider) setWebProvider(webSearchStatus.activeProvider);
  }, [webSearchStatus?.activeProvider]);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<ModelProgress>("model-download-progress", (event) => {
      if (!disposed) setDownloadProgress(event.payload);
    }).then((unsubscribe) => {
      if (disposed) unsubscribe();
      else unlisten = unsubscribe;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  async function handleSaveWebKey() {
    const key = webApiKey.trim();
    if (!key) { toast.error("Enter your API key first"); return; }
    setSavingWebKey(true);
    try {
      await invoke("save_web_search_key", { provider: webProvider, apiKey: key });
      setWebApiKey("");
      await refreshWebSearchStatus();
      toast.success(`${webProvider === "firecrawl" ? "Firecrawl" : "Brave Search"} connected and tested successfully`);
    } catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
    finally { setSavingWebKey(false); }
  }

  async function handleDownload() {
    setBusy(true);
    setDownloadProgress({
      downloadedBytes: 0,
      totalBytes: modelStatus?.totalBytes ?? 1,
      percent: 0,
    });
    try {
      await invoke<string>("download_model");
      setDownloadProgress(null);
      await refreshModelStatus();
      toast.success("Qwen3.5-2B is verified and ready");
    } catch (error) {
      setDownloadProgress(null);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelDownload() {
    try {
      await invoke<boolean>("cancel_model_download");
      toast.message("Cancelling model download…");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (!desktop || localModels.length === 0 || selectedModelPath) return;
    let savedPath = "";
    try { savedPath = window.localStorage.getItem("amanda-selected-model-path") ?? ""; } catch {
      savedPath = "";
    }
    const preferred = localModels.find((item) => item.path === savedPath) ?? localModels.find((item) => item.isDefault) ?? localModels[0];
    if (preferred) setSelectedModelPath(preferred.path);
  }, [desktop, localModels, selectedModelPath]);

  async function handleLoadModel() {
    setBusy(true);
    try {
      if (selectedModelPath) window.localStorage.setItem("amanda-selected-model-path", selectedModelPath);
      const modelConnection = await invoke<ModelConnection>("start_local_model", { modelPath: selectedModelPath || null });
      setConnection(modelConnection);
      queryClient.setQueryData(["model-connection"], modelConnection);
      await refreshModelStatus();
      toast.success(`${localModels.find((item) => item.path === selectedModelPath)?.name ?? "Local model"} is loaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRepairModel() {
    setBusy(true);
    setTestResponse(null);
    try {
      const repaired = await invoke<ModelConnection>("repair_local_model", {
        modelPath: selectedModelPath || null,
      });
      setConnection(repaired);
      queryClient.setQueryData(["model-connection"], repaired);
      await refreshModelStatus();
      toast.success("Local model authentication repaired and verified");
    } catch (error) {
      setConnection(null);
      queryClient.setQueryData(["model-connection"], null);
      await refreshModelStatus();
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnloadModel() {
    setBusy(true);
    try {
      await invoke("stop_local_model");
      setConnection(null);
      queryClient.setQueryData(["model-connection"], null);
      setTestResponse(null);
      await refreshModelStatus();
      toast.success("The local model was unloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleTestModel() {
    if (!connection) return;
    setBusy(true);
    setTestResponse(null);
    try {
      const response = await fetch(`${connection.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${connection.apiKey}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Reply with: Amanda local model test passed." }],
          max_tokens: 40,
          temperature: 0.2,
          stream: false,
        }),
      });
      if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(
          `The local model returned HTTP ${response.status}${details ? `: ${details.slice(0, 500)}` : ""}`,
        );
      }
      const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const answer = result.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new Error("The model returned an empty test response");
      setTestResponse(answer);
      toast.success("Model test completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = !desktop
    ? "Desktop app required"
    : modelStatusLoading
      ? "Checking…"
      : modelStatus?.running
        ? "Loaded"
        : modelStatus?.installed
          ? "Installed"
          : "Not installed";
  const currentProgress = downloadProgress;
  const isDownloading = currentProgress !== null || modelStatus?.downloading === true;
  const progressBytes = currentProgress?.downloadedBytes ?? modelStatus?.downloadedBytes ?? 0;
  const progressPercent =
    currentProgress?.percent ??
    Math.min(100, Math.floor((progressBytes / (modelStatus?.totalBytes || 1)) * 100));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-3xl tracking-tight">Settings</h1>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="mt-3 flex max-w-xs flex-col gap-1.5">
          <Label>Theme</Label>
          <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="web-search-settings-heading">
        <div className="flex items-center gap-2"><Globe className="size-4 text-muted-foreground" /><h2 id="web-search-settings-heading" className="text-sm font-semibold">Web search</h2></div>
        <Card className="mt-3">
          <CardHeader><CardTitle className="text-base">Connect a search provider</CardTitle><CardDescription>Add your API key once. Amanda tests the connection before saving it securely in Windows Credential Manager.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!desktop ? <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Connect search providers in the installed Windows app.</p> : <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5"><Label htmlFor="web-provider">Provider</Label><Select value={webProvider} onValueChange={async (value) => {
                      setWebProvider(value as WebSearchProvider);
                      const configured = value === "firecrawl" ? webSearchStatus?.firecrawlConfigured : webSearchStatus?.braveConfigured;
                      if (configured) {
                        try { await invoke("set_web_search_provider", { provider: value }); await refreshWebSearchStatus(); }
                        catch (error) { toast.error(error instanceof Error ? error.message : String(error)); }
                      }
                    }}><SelectTrigger id="web-provider"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="firecrawl">Firecrawl (recommended)</SelectItem><SelectItem value="brave">Brave Search</SelectItem></SelectContent></Select></div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="web-api-key">API key</Label><Input id="web-api-key" type="password" autoComplete="off" value={webApiKey} onChange={(event) => setWebApiKey(event.target.value)} placeholder={webProvider === "firecrawl" ? "fc-…" : "Brave Search API key"} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void handleSaveWebKey()} disabled={savingWebKey || !webApiKey.trim()}>{savingWebKey ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <ShieldCheck data-icon="inline-start" />}Save key & test connection</Button>
                <Badge variant={webSearchStatus?.firecrawlConfigured ? "default" : "secondary"}>Firecrawl {webSearchStatus?.firecrawlConfigured ? "connected" : "not connected"}</Badge>
                <Badge variant={webSearchStatus?.braveConfigured ? "default" : "secondary"}>Brave {webSearchStatus?.braveConfigured ? "connected" : "not connected"}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <a href="https://www.firecrawl.dev/app/api-keys" target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">Get a Firecrawl key</a>
                <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">Get a Brave Search key</a>
              </div>
              <p className="text-xs text-muted-foreground">Your key is stored in Windows Credential Manager, not in Amanda&apos;s database or chat history. Switch providers whenever you like.</p>
            </>}
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Your data</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link to="/memory" className="rounded-lg border border-border p-4 transition-colors hover:bg-accent"><div className="flex items-center gap-2 text-sm font-medium"><Brain className="size-4" />Memory</div><p className="mt-2 text-sm text-muted-foreground">Review and manage what Amanda remembers.</p></Link>
          <Link to="/archive" className="rounded-lg border border-border p-4 transition-colors hover:bg-accent"><div className="flex items-center gap-2 text-sm font-medium"><Archive className="size-4" />Archive</div><p className="mt-2 text-sm text-muted-foreground">Restore or permanently delete archived items.</p></Link>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Local AI model</h2>
          <Badge variant={modelStatus?.running ? "default" : "secondary"}>{statusLabel}</Badge>
        </div>
        <Card className="mt-3">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Cpu aria-hidden="true" className="size-4" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base">Qwen3.5-2B · Q4_K_M</CardTitle>
                <CardDescription className="mt-1">
                  1.40 GB model download · kept separate from the Amanda installer
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <p className="text-muted-foreground">
                Model files are downloaded from Hugging Face over HTTPS and checked against a pinned
                SHA-256 digest before Amanda installs them. Inference runs on this device and the
                model is not loaded until you ask for it.
              </p>
            </div>

            {!desktop && (
              <p className="text-sm text-muted-foreground">
                The browser preview cannot install or run local files. Use Amanda&apos;s Windows
                desktop installer for local model setup.
              </p>
            )}
            {desktop && modelStatus && !modelStatus.runtimeAvailable && (
              <p className="text-sm text-destructive">
                The bundled llama.cpp runtime is missing. Reinstall the Windows desktop app before
                setting up the model.
              </p>
            )}

            {isDownloading && (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between gap-3 text-sm">
                  <span>Downloading and verifying model</span>
                  <span className="tabular-nums">{progressPercent}%</span>
                </div>
                <progress
                  aria-label="Qwen3.5-2B download progress"
                  className="h-2 w-full accent-primary"
                  max={100}
                  value={progressPercent}
                />
                <p className="text-xs text-muted-foreground">
                  {(progressBytes / 1_000_000_000).toFixed(2)} GB of 1.40 GB
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!modelStatus?.installed && !isDownloading && (
                <Button
                  onClick={() => void handleDownload()}
                  disabled={
                    !desktop || !modelStatus?.runtimeAvailable || busy || modelStatusLoading
                  }
                >
                  {busy ? (
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Download data-icon="inline-start" />
                  )}
                  Download model
                </Button>
              )}
              {isDownloading && (
                <Button variant="outline" onClick={() => void handleCancelDownload()}>
                  <Square data-icon="inline-start" />
                  Cancel download
                </Button>
              )}
              {modelStatus?.installed && !modelStatus.running && (
                <>
                  <Button
                    onClick={() => void handleLoadModel()}
                    disabled={!desktop || !modelStatus.runtimeAvailable || busy}
                  >
                    {busy ? (
                      <LoaderCircle data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <Cpu data-icon="inline-start" />
                    )}
                    Load model
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleDownload()}
                    disabled={!desktop || !modelStatus.runtimeAvailable || busy}
                  >
                    <ShieldCheck data-icon="inline-start" />
                    Verify or repair model
                  </Button>
                </>
              )}
              {modelStatus?.running && (
                <>
                  <Button onClick={() => void handleRepairModel()} disabled={busy}>
                    {busy ? (
                      <LoaderCircle data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <ShieldCheck data-icon="inline-start" />
                    )}
                    Repair & verify
                  </Button>
                  <Button onClick={() => void handleTestModel()} disabled={busy || !connection}>
                    {busy ? (
                      <LoaderCircle data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <ShieldCheck data-icon="inline-start" />
                    )}
                    Test model
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleUnloadModel()}
                    disabled={busy}
                  >
                    <Trash2 data-icon="inline-start" />
                    Unload model
                  </Button>
                </>
              )}
            </div>

            {testResponse && (
              <div className="rounded-md border border-border p-3" aria-live="polite">
                <p className="text-xs font-medium text-muted-foreground">
                  Live model test response
                </p>
                <p className="mt-1 text-sm">{testResponse}</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Q4_K_M is a community conversion by bartowski from the official Qwen checkpoint.
              Runtime: llama.cpp b9222, CPU-only, 4,096-token context, two inference threads. No
              performance claim is made for your PC until tested on that device.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="https://huggingface.co/Qwen/Qwen3.5-2B" target="_blank" rel="noreferrer">
                  Official Qwen source
                  <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://huggingface.co/bartowski/Qwen_Qwen3.5-2B-GGUF/tree/7d26695454df6de5fbcce2e58681e62dae06ce43"
                  target="_blank"
                  rel="noreferrer"
                >
                  Quantized model source
                  <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Models already on this PC</CardTitle><CardDescription>Amanda scans its model folder, Downloads, Documents, Models, Hugging Face cache and Ollama blob storage for compatible GGUF files. Existing model files stay where they are.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{localModels.length} compatible model{localModels.length === 1 ? "" : "s"} detected</span><Button variant="outline" size="sm" onClick={() => void refreshLocalModels()}>Scan again</Button></div>
          {localModels.length > 0 ? <>
            <Select value={selectedModelPath} onValueChange={(path) => { setSelectedModelPath(path); try { window.localStorage.setItem("amanda-selected-model-path", path); } catch (error) {
                  console.warn("Could not persist the selected model path", error);
                } }}>
              <SelectTrigger><SelectValue placeholder="Choose an installed model" /></SelectTrigger>
              <SelectContent>{localModels.map((item) => <SelectItem key={item.path} value={item.path}>{item.name} · {(item.sizeBytes / 1_000_000_000).toFixed(2)} GB</SelectItem>)}</SelectContent>
            </Select>
            <p className="break-all text-xs text-muted-foreground">{localModels.find((item) => item.path === selectedModelPath)?.path}</p>
            <Button onClick={() => void handleLoadModel()} disabled={!desktop || !modelStatus?.runtimeAvailable || busy || !selectedModelPath || modelStatus?.running}><Cpu data-icon="inline-start" />Load selected model</Button>
          </> : <p className="text-sm text-muted-foreground">No compatible GGUF files found in the standard model folders. You can download Amanda&apos;s Qwen model above.</p>}
        </CardContent>
      </Card>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Backup and restore</h2>
        <LocalDataTransfer />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Local data and privacy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Amanda stores project data in a local SQLite database and does not require an account. The
          model runs on this device. The browser preview is interface-only and cannot access the
          desktop model runtime.
        </p>
      </section>
    </div>
  );
}
