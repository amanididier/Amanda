import { describe, expect, it } from "vitest";

import { readModelStream } from "@/lib/local-model-stream";

function createEventStream(parts: string[]) {
  const events = [
    ...parts.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(events));
      controller.close();
    },
  });
}

describe("local model stream", () => {
  it("hides think-tagged reasoning even when tags are split across stream chunks", async () => {
    const result = await readModelStream(
      createEventStream(["Hello<thin", "k>private reasoning</thi", "nk> world"]),
      new AbortController().signal,
      () => undefined,
    );

    expect(result.text).toBe("Hello world");
  });

  it("does not expose an unfinished hidden reasoning block", async () => {
    const result = await readModelStream(
      createEventStream(["Visible answer", "<think>private reasoning"]),
      new AbortController().signal,
      () => undefined,
    );

    expect(result.text).toBe("Visible answer");
  });
});
