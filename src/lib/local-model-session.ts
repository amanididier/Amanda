import { invoke } from "@tauri-apps/api/core";
import type { QueryClient } from "@tanstack/react-query";

export type LocalModelConnection = {
  baseUrl: string;
  apiKey: string;
};

let startupPromise: Promise<LocalModelConnection> | null = null;

export async function ensureLocalModelConnection(
  queryClient: QueryClient,
): Promise<LocalModelConnection> {
  const cached = queryClient.getQueryData<LocalModelConnection | null>(["model-connection"]);
  if (cached) return cached;
  if (startupPromise) return startupPromise;

  const pending = (async () => {
    queryClient.setQueryData(["model-boot-state"], "starting");
    queryClient.setQueryData(["model-boot-error"], undefined);

    const status = await invoke<{ installed: boolean; modelPath: string }>("get_model_status");
    let selectedPath = "";
    try {
      selectedPath = window.localStorage.getItem("amanda-selected-model-path") ?? "";
    } catch {
      selectedPath = "";
    }

    if (!selectedPath && status.installed) selectedPath = status.modelPath;
    if (!selectedPath) {
      const models = await invoke<Array<{ path: string; isDefault: boolean }>>("list_local_models");
      selectedPath = models.find((model) => model.isDefault)?.path ?? models[0]?.path ?? "";
    }

    if (!selectedPath) {
      queryClient.setQueryData(["model-boot-state"], "missing");
      throw new Error("No local model is installed. Download a compatible model in Settings before sending a message.");
    }

    const connection = await invoke<LocalModelConnection>("start_local_model", {
      modelPath: selectedPath,
    });
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

    if (!testResponse.ok) {
      throw new Error(`The local model test returned HTTP ${testResponse.status}`);
    }

    const testResult = (await testResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!testResult.choices?.[0]?.message?.content?.trim()) {
      throw new Error("The model started but did not return a chat response.");
    }

    queryClient.setQueryData(["model-connection"], connection);
    queryClient.setQueryData(["model-boot-state"], "ready");
    void queryClient.invalidateQueries({ queryKey: ["model-status"] });
    return connection;
  })()
    .catch((error: unknown) => {
      queryClient.setQueryData(["model-boot-state"], "error");
      queryClient.setQueryData(
        ["model-boot-error"],
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    })
    .finally(() => {
      startupPromise = null;
    });

  startupPromise = pending;
  return pending;
}

export async function stopLocalModel(queryClient: QueryClient): Promise<void> {
  await invoke("stop_local_model");
  queryClient.setQueryData(["model-connection"], null);
  queryClient.setQueryData(["model-boot-state"], "idle");
  queryClient.setQueryData(["model-boot-error"], undefined);
  void queryClient.invalidateQueries({ queryKey: ["model-status"] });
}
