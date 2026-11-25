export type LocalModelToolCall = {
  index: number;
  name: string;
  arguments: string;
};

type ChatChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

export async function readModelStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onText: (text: string) => void,
) {
  const reader = body.getReader();
  const cancelPendingRead = () => void reader.cancel().catch(() => undefined);
  signal.addEventListener("abort", cancelPendingRead, { once: true });
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, LocalModelToolCall>();
  let pending = "";
  let eventData: string[] = [];
  let responseText = "";

  const handleEvent = () => {
    const data = eventData.join("\n");
    eventData = [];
    if (!data || data === "[DONE]") return;
    try {
      const chunk = JSON.parse(data) as ChatChunk;
      const delta = chunk.choices?.[0]?.delta;
      if (typeof delta?.content === "string") {
        responseText += delta.content;
        onText(responseText);
      }
      for (const update of delta?.tool_calls ?? []) {
        const index = update.index ?? 0;
        const previous = toolCalls.get(index) ?? { index, name: "", arguments: "" };
        toolCalls.set(index, {
          index,
          name: previous.name + (update.function?.name ?? ""),
          arguments: previous.arguments + (update.function?.arguments ?? ""),
        });
      }
    } catch {
      throw new Error("The local model sent an invalid streaming response");
    }
  };

  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) handleEvent();
        else if (line.startsWith("data:")) eventData.push(line.slice(5).trimStart());
      }
    }
    pending += decoder.decode();
    if (pending.startsWith("data:")) eventData.push(pending.slice(5).trimStart());
    if (eventData.length) handleEvent();
    return {
      text: responseText,
      toolCalls: [...toolCalls.values()].sort((left, right) => left.index - right.index),
    };
  } catch (error) {
    if (signal.aborted) {
      return {
        text: responseText,
        toolCalls: [],
      };
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", cancelPendingRead);
    if (signal.aborted) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
