export type LocalModelToolCall = {
  id: string;
  index: number;
  name: string;
  arguments: string;
};

type ChatChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        id?: string;
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
  let contentBuffer = "";
  let insideThinking = false;
  let lastEmittedText = "";

  const emitVisibleText = () => {
    if (responseText === lastEmittedText) return;
    lastEmittedText = responseText;
    onText(responseText);
  };

  const appendVisibleContent = (chunk: string) => {
    contentBuffer += chunk;
    while (true) {
      if (insideThinking) {
        const closingTag = contentBuffer.toLocaleLowerCase().indexOf("</think>");
        if (closingTag < 0) {
          contentBuffer = contentBuffer.slice(-7);
          break;
        }
        contentBuffer = contentBuffer.slice(closingTag + 8);
        insideThinking = false;
        continue;
      }

      const openingTag = contentBuffer.toLocaleLowerCase().indexOf("<think>");
      if (openingTag >= 0) {
        responseText += contentBuffer.slice(0, openingTag);
        contentBuffer = contentBuffer.slice(openingTag + 7);
        insideThinking = true;
        continue;
      }

      let partialTagLength = 0;
      const openingToken = "<think>";
      for (let length = 1; length < openingToken.length; length += 1) {
        if (contentBuffer.toLocaleLowerCase().endsWith(openingToken.slice(0, length))) {
          partialTagLength = length;
        }
      }
      if (contentBuffer.length > partialTagLength) {
        responseText += contentBuffer.slice(0, contentBuffer.length - partialTagLength);
        contentBuffer = contentBuffer.slice(contentBuffer.length - partialTagLength);
      }
      break;
    }
    emitVisibleText();
  };

  const handleEvent = () => {
    const data = eventData.join("\n");
    eventData = [];
    if (!data || data === "[DONE]") return;
    try {
      const chunk = JSON.parse(data) as ChatChunk;
      const delta = chunk.choices?.[0]?.delta;
      if (typeof delta?.content === "string") appendVisibleContent(delta.content);
      for (const update of delta?.tool_calls ?? []) {
        const index = update.index ?? 0;
        const previous = toolCalls.get(index) ?? { id: "", index, name: "", arguments: "" };
        toolCalls.set(index, {
          id: previous.id || update.id || `call_${index}`,
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
    if (!insideThinking) {
      responseText += contentBuffer.replace(/<\/?think>/gi, "").replace(/<think>?$/i, "");
    }
    emitVisibleText();
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
