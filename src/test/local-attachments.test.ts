import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachmentPromptContext,
  createLocalAttachment,
  createPastedTextAttachment,
  formatFileSize,
} from "@/lib/local-attachments";

describe("local attachment helpers", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("turns long pasted text into a compact local attachment with a line count", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-attachment-id" });
    const attachment = createPastedTextAttachment("First line\nSecond line\nThird line");
    expect(attachment.kind).toBe("pasted-text");
    expect(attachment.name).toBe("Pasted text · 3 lines");
    expect(attachment.extractedText).toBe("First line\nSecond line\nThird line");
    expect(attachment.dataUrl).toBeNull();
  });

  it("extracts selectable text from a text-based PDF", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "pdf-attachment-id" });
    const pdf = new File(
      ["%PDF-1.4\n1 0 obj\n<< /Length 24 >>\nstream\nBT (Hello from PDF) Tj ET\nendstream\nendobj\n%%EOF"],
      "sample.pdf",
      { type: "application/pdf" },
    );
    const attachment = await createLocalAttachment(pdf);
    expect(attachment.kind).toBe("document");
    expect(attachment.extractedText).toContain("Hello from PDF");
  });

  it("includes extracted document text in the prompt without including binary data", () => {
    const context = attachmentPromptContext([
      {
        id: "doc-1",
        name: "research.pdf",
        mimeType: "application/pdf",
        size: 100,
        kind: "document",
        dataUrl: null,
        extractedText: "The study reports three findings.",
      },
      {
        id: "image-1",
        name: "diagram.png",
        mimeType: "image/png",
        size: 200,
        kind: "image",
        dataUrl: "data:image/png;base64,AA==",
        extractedText: "",
      },
    ]);
    expect(context).toContain('<attached_file name="research.pdf">');
    expect(context).toContain("The study reports three findings.");
    expect(context).not.toContain("AA==");
  });

  it("formats file sizes for compact attachment cards", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
  });
});
