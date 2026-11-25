import { describe, expect, it } from "vitest";

import { readModelStream } from "@/lib/local-model-stream";

function streamFrom(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("local model stream parsing", () => {
  it("joins SSE chunks split across network reads and stops at DONE", async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    const stream = streamFrom([
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" world"}}]}\r\n\r\ndata: [DONE]\r\n\r\n',
    ]);

    const result = await readModelStream(stream, controller.signal, (text) => seen.push(text));

    expect(result.text).toBe("Hello world");
    expect(result.toolCalls).toEqual([]);
    expect(seen).toEqual(["Hello", "Hello world"]);
  });

  it("keeps partial text when generation is cancelled", async () => {
    const controller = new AbortController();
    const stream = streamFrom(['data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\n']);

    const result = await readModelStream(stream, controller.signal, () => controller.abort());

    expect(result.text).toBe("Partial answer");
    expect(result.toolCalls).toEqual([]);
  });

  it("reassembles streamed function names and arguments", async () => {
    const controller = new AbortController();
    const result = await readModelStream(
      streamFrom([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"propose_","arguments":"{\\"title\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"roadmap","arguments":"\\"Roadmap\\"}"}}]}}]}\n\ndata: [DONE]\n\n',
      ]),
      controller.signal,
      () => undefined,
    );

    expect(result.toolCalls).toEqual([
      { index: 0, name: "propose_roadmap", arguments: '{"title":"Roadmap"}' },
    ]);
  });
});
