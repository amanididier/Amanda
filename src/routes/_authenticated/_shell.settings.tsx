import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  BookOpen,
  Brain,
  Cpu,
  Download,
  Globe,
  ExternalLink,
  HardDrive,
  Laptop,
  Palette,
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
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [guideTopic, setGuideTopic] = useState("getting-started");
  const [guideImages, setGuideImages] = useState<Record<string, string[]>>({});
  const [guideImagesLoaded, setGuideImagesLoaded] = useState(false);
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
    try {
      const saved = window.localStorage.getItem("amanda-guide-reference-images");
      if (saved) setGuideImages(JSON.parse(saved) as Record<string, string[]>);
    } catch {
      setGuideImages([]);
    } finally {
      setGuideImagesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!guideImagesLoaded) return;
    try {
      if (Object.keys(guideImages).length) window.localStorage.setItem("amanda-guide-reference-images", JSON.stringify(guideImages));
      else window.localStorage.removeItem("amanda-guide-reference-images");
    } catch {
      toast.error("Guide images could not be saved. Try smaller images.");
    }
  }, [guideImages, guideImagesLoaded]);

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
          max_tokens: 128,
          temperature: 0.0,
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
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string; reasoning_content?: string };
        }>;
        usage?: unknown;
      };
      const choice = result.choices?.[0];
      const answer = choice?.message?.content?.trim();
      if (!answer) {
        const reasoning = choice?.message?.reasoning_content?.trim();
        const reasoningInfo = reasoning
          ? ` The model returned ${reasoning.length} reasoning characters but no visible answer.`
          : " The server returned neither visible answer text nor reasoning text.";
        throw new Error(
          `The model returned an empty test response (finish reason: ${choice?.finish_reason ?? "unknown"}).${reasoningInfo} Usage: ${JSON.stringify(result.usage ?? null)}`,
        );
      }
      setTestResponse(answer);
      toast.success("Model test completed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const settingSections = [
    { id: "appearance", label: "Appearance", description: "Theme and display", icon: Palette },
    { id: "web-search", label: "Web search", description: "Firecrawl and Brave", icon: Globe },
    { id: "data", label: "Your data", description: "Memory and archive", icon: Brain },
    { id: "local-ai", label: "Local AI model", description: "Install and manage Amanda's model", icon: Cpu },
    { id: "models", label: "Models on this PC", description: "Use an existing GGUF model", icon: Laptop },
    { id: "backup", label: "Backup and restore", description: "Move or restore your data", icon: HardDrive },
    { id: "privacy", label: "Privacy", description: "Local storage and data controls", icon: ShieldCheck },
    { id: "guide", label: "Manual guide", description: "Learn every part of Amanda", icon: BookOpen },
  ];

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
    <div className="mx-auto max-w-6xl px-6 py-10">
      {activeSection === null ? (
        <>
          <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {settingSections.map(({ id, label, description, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setActiveSection(id)} className="flex min-h-28 items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon aria-hidden="true" className="size-4 text-muted-foreground" /></span>
                <span className="min-w-0"><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-8 md:grid-cols-[210px_minmax(0,1fr)]">
          <aside className="md:sticky md:top-6 md:self-start">
            <button type="button" onClick={() => setActiveSection(null)} className="mb-4 text-sm text-muted-foreground transition-colors hover:text-foreground">← All settings</button>
            <nav aria-label="Settings sections" className="flex flex-col gap-1">
              {settingSections.map(({ id, label, icon: Icon }) => (
                <button key={id} type="button" onClick={() => setActiveSection(id)} aria-current={activeSection === id ? "page" : undefined} className={"flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors " + (activeSection === id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                  <Icon aria-hidden="true" className="size-4 shrink-0" />{label}
                </button>
              ))}
            </nav>
          </aside>
          <main className="min-w-0">
            <h1 className="mb-7 font-serif text-3xl tracking-tight">{settingSections.find((item) => item.id === activeSection)?.label ?? "Settings"}</h1>

      <section hidden={activeSection !== "appearance"} className="mt-2">
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

      <section hidden={activeSection !== "web-search"} className="mt-2" aria-labelledby="web-search-settings-heading">
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

      <section hidden={activeSection !== "data"} className="mt-2">
        <h2 className="text-sm font-semibold">Your data</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Link to="/memory" className="rounded-lg border border-border p-4 transition-colors hover:bg-accent"><div className="flex items-center gap-2 text-sm font-medium"><Brain className="size-4" />Memory</div><p className="mt-2 text-sm text-muted-foreground">Review and manage what Amanda remembers.</p></Link>
          <Link to="/archive" className="rounded-lg border border-border p-4 transition-colors hover:bg-accent"><div className="flex items-center gap-2 text-sm font-medium"><Archive className="size-4" />Archive</div><p className="mt-2 text-sm text-muted-foreground">Restore or permanently delete archived items.</p></Link>
        </div>
      </section>

      <section hidden={activeSection !== "local-ai"} className="mt-2">
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
              {modelStatus?.installed && (
                <Button onClick={() => void handleRepairModel()} disabled={busy || !desktop || !modelStatus.runtimeAvailable}>
                  {busy ? (
                    <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <ShieldCheck data-icon="inline-start" />
                  )}
                  Repair & verify
                </Button>
              )}
              {modelStatus?.running && (
                <>
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

      <Card hidden={activeSection !== "models"} className="mt-2">
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

      <section hidden={activeSection !== "backup"} className="mt-2">
        <h2 className="text-sm font-semibold">Backup and restore</h2>
        <LocalDataTransfer />
      </section>

      <section hidden={activeSection !== "guide"} className="mt-2">
        <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
          <nav aria-label="Amanda manual contents" className="flex flex-col gap-1">
            {[
              ["getting-started", "Getting started"], ["home", "Home and chat"],
              ["projects", "Projects"], ["research", "Research"],
              ["workspace", "Workspace chat"], ["tasks-roadmap", "Tasks and roadmap"],
              ["notes", "Daily Notes"], ["settings", "Settings"],
              ["memory-archive", "Memory and archive"], ["backup", "Backup and restore"],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setGuideTopic(id)} aria-current={guideTopic === id ? "page" : undefined} className={"rounded-md px-3 py-2 text-left text-sm " + (guideTopic === id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/60")}>{label}</button>
            ))}
          </nav>
          <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">
            {(() => { const currentGuideImages = guideImages[guideTopic] ?? []; return null; })()}
            {(() => {
              const articles = [
                { id: "getting-started", title: "Getting started", intro: "Amanda keeps your work on this device and gives each project or research topic its own focused workspace.", steps: ["Open Settings and choose Local AI model.", "Download or select a compatible GGUF model, then choose Load model.", "Wait until the model is shown as Loaded.", "Return to Home and start a conversation with Amanda.", "When you are ready to organise the work, create a workspace and choose Project or Research."] },
                { id: "home", title: "Home and chat", intro: "Use Home for quick questions, early ideas, and conversations that do not yet need their own workspace.", steps: ["Type what you want help with in the composer.", "Use the plus button to attach supported images or documents.", "Press Send and let Amanda respond.", "When a conversation grows into a longer effort, create a workspace and choose its type."] },
                { id: "projects", title: "Projects", intro: "Projects hold work where you are trying to build, organise, or complete something.", steps: ["Open Projects from the main navigation.", "Select a project to open its workspace.", "Use Chat to discuss the work and ask Amanda to help with project actions.", "Use Tasks to track concrete work and due dates.", "Use Roadmap to review the project plan and its steps."] },
                { id: "research", title: "Research", intro: "Research holds inquiries where the main goal is to investigate a question, topic, or evidence.", steps: ["Open Research from the main navigation.", "Create a workspace and choose Research as its type.", "Open the research workspace and use Chat to explore the topic.", "Attach source documents or images when they help explain the question.", "Keep research work in this workspace rather than mixing it with a build project."] },
                { id: "workspace", title: "Workspace chat", intro: "Every workspace has a conversation that uses relevant context from that workspace.", steps: ["Open a workspace from Projects or Research.", "Choose Chat in the centered workspace navigation.", "Ask focused questions and attach relevant files with the plus button.", "Use the conversation selector to return to another chat when several are available.", "Use Stop if you need to interrupt a response."] },
                { id: "tasks-roadmap", title: "Tasks and roadmap", intro: "Tasks track individual actions; the roadmap gives the larger sequence of work.", steps: ["Open a Project workspace and choose Tasks to add or complete tasks.", "Give tasks clear titles and optional due dates.", "Choose Roadmap to review the larger project plan.", "Update progress as you complete steps; keep research-only work in Research workspaces."] },
                { id: "notes", title: "Daily Notes", intro: "Daily Notes is a flexible space for writing, collecting screenshots, and keeping reference material.", steps: ["Open Daily Notes and create a note.", "Write in the page or paste a screenshot at the cursor.", "Use Add images for a small gallery or Add reference to attach a document.", "Choose a project when the note belongs to a project; leave it unassigned for general research notes.", "Use Ask Amanda beside Add images to send the note and its references into the relevant workspace conversation."] },
                { id: "settings", title: "Settings", intro: "Settings contains the controls for how Amanda looks and how local services work.", steps: ["Open Settings from the main navigation.", "Choose a category from the overview cards.", "Use the left-hand list to move between categories.", "Return to All settings to see the overview again."] },
                { id: "memory-archive", title: "Memory and archive", intro: "Memory and Archive are separate spaces for reviewing saved context and archived work.", steps: ["Open Settings and choose Your data.", "Choose Memory to review saved context.", "Choose Archive to revisit archived items.", "Restore an item when you need it again, or delete it when you are sure it is no longer needed."] },
                { id: "backup", title: "Backup and restore", intro: "Backups help you move your local Amanda data or recover it later.", steps: ["Open Settings and choose Backup and restore.", "Create a backup before reinstalling or moving to another device.", "Keep the backup file somewhere safe outside the Amanda installation folder.", "Use Restore only after selecting the backup you intend to recover."] },
              ];
              const article = articles.find((item) => item.id === guideTopic) ?? articles[0]!;
              return (
                <>
                  <h2 className="font-serif text-2xl tracking-tight">{article.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{article.intro}</p>
                  <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-6">{article.steps.map((step) => <li key={step} className="pl-1">{step}</li>)}</ol>
                </>
              );
            })()}
            <div className="mt-8 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="text-sm font-semibold">Reference images</h3><p className="mt-1 text-xs text-muted-foreground">Add screenshots for this guide section. Images are saved in this browser profile.</p></div>
                <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Add images
                  <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length + currentGuideImages.length > 4 || files.some((file) => file.size > 750_000)) { toast.error("Add up to 4 images for this section, each smaller than 750 KB."); return; }
                    void Promise.all(files.map((file) => new Promise<string>((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read image"));
                      reader.onerror = () => reject(new Error("Could not read image"));
                      reader.readAsDataURL(file);
                    }))).then((images) => setGuideImages((current) => ({ ...current, [guideTopic]: [...(current[guideTopic] ?? []), ...images] }))).catch(() => toast.error("Could not add those images."));
                  }} />
                </label>
              </div>
              {currentGuideImages.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{currentGuideImages.map((image, index) => <div key={index} className="group relative overflow-hidden rounded-lg border border-border"><img src={image} alt={`Amanda guide reference ${index + 1}`} className="max-h-48 w-full object-contain" /><button type="button" onClick={() => setGuideImages((current) => ({ ...current, [guideTopic]: currentGuideImages.filter((_, itemIndex) => itemIndex !== index) }))} className="absolute right-2 top-2 rounded-md bg-background/90 px-2 py-1 text-xs opacity-0 shadow group-hover:opacity-100 focus:opacity-100">Remove</button></div>)}</div>}
            </div>
          </article>
        </div>
      </section>

      <section hidden={activeSection !== "privacy"} className="mt-2">
        <h2 className="text-sm font-semibold">Local data and privacy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Amanda stores project data in a local SQLite database and does not require an account. The
          model runs on this device. The browser preview is interface-only and cannot access the
          desktop model runtime.
        </p>
      </section>
          </main>
        </div>
      )}
    </div>
  );
}
