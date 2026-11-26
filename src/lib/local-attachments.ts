export type LocalAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "document" | "text" | "pasted-text";
  dataUrl: string | null;
  extractedText: string;
};

const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 24_000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this file."));
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

function cleanExtractedText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_EXTRACTED_CHARS);
}

function decodeXmlText(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("This Word document could not be read.");
  return cleanExtractedText(
    Array.from(document.getElementsByTagName("w:t")).map((node) => node.textContent ?? "").join(" "),
  );
}

async function inflate(bytes: Uint8Array, format: "deflate" | "deflate-raw") {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot extract compressed document text.");
  const stream = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractDocxText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let offset = Math.max(0, bytes.length - 65_557); offset <= bytes.length - 4; offset += 1) {
    if (view.getUint32(offset, true) === 0x06054b50) end = offset;
  }
  if (end < 0) throw new Error("This .docx file is not a readable Word document.");
  const entryCount = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (name === "word/document.xml") {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      const xmlBytes = method === 0 ? compressed : method === 8 ? await inflate(compressed, "deflate-raw") : null;
      if (!xmlBytes) throw new Error("This Word document uses an unsupported compression method.");
      return decodeXmlText(new TextDecoder().decode(xmlBytes));
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("No readable document text was found in this Word file.");
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, char: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[char] ?? char)
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\\r?\n/g, "");
}

async function extractPdfText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const source = new TextDecoder("latin1").decode(bytes);
  const streams: string[] = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n/gs;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(source))) {
    const start = streamPattern.lastIndex;
    const end = source.indexOf("endstream", start);
    if (end < 0) break;
    if (/\/FlateDecode/.test(match[1] ?? "")) {
      try {
        const raw = bytes.slice(start, end).subarray(0, end - start - (source.slice(start, end).endsWith("\r\n") ? 2 : 1));
        streams.push(new TextDecoder("latin1").decode(await inflate(raw, "deflate")));
      } catch {
        // A damaged or unsupported stream should not prevent extraction from other pages.
      }
    } else {
      streams.push(source.slice(start, end));
    }
    streamPattern.lastIndex = end + 9;
  }
  const searchable = streams.length ? streams.join("\n") : source;
  const output: string[] = [];
  for (const block of searchable.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = block[1] ?? "";
    for (const token of body.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:[\s\S]*?))\]\s*TJ/g)) {
      if (token[1] !== undefined) output.push(decodePdfLiteral(token[1]));
      else {
        for (const part of (token[2] ?? "").matchAll(/\(((?:\\.|[^\\)])*)\)/g)) output.push(decodePdfLiteral(part[1] ?? ""));
      }
    }
  }
  const text = cleanExtractedText(output.join(" "));
  if (!text) throw new Error("No selectable text was found. This PDF may be scanned; Amanda cannot OCR scanned pages yet.");
  return text;
}

export async function createLocalAttachment(file: File): Promise<LocalAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Choose a file smaller than 12 MB.");
  const id = crypto.randomUUID();
  if (file.type.startsWith("image/")) {
    return { id, name: file.name, mimeType: file.type, size: file.size, kind: "image", dataUrl: await readAsDataUrl(file), extractedText: "" };
  }
  const extension = file.name.split(".").pop()?.toLocaleLowerCase() ?? "";
  let extractedText = "";
  if (file.type === "application/pdf" || extension === "pdf") {
    extractedText = await extractPdfText(await file.arrayBuffer());
  } else if (extension === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    extractedText = await extractDocxText(await file.arrayBuffer());
  } else if (["txt", "md", "csv", "json", "xml", "html", "yaml", "yml"].includes(extension) || file.type.startsWith("text/") || file.type === "application/json") {
    extractedText = cleanExtractedText(await file.text());
    if (extension === "html" || extension === "xml") extractedText = cleanExtractedText(extractedText.replace(/<[^>]*>/g, " "));
  } else {
    throw new Error("Amanda can read images, PDF, Word (.docx), and text-based files. Legacy .doc files are not supported yet.");
  }
  if (!extractedText) throw new Error("No readable text was found in this file.");
  return { id, name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, kind: extension === "txt" || extension === "md" ? "text" : "document", dataUrl: null, extractedText };
}

export function createPastedTextAttachment(text: string): LocalAttachment {
  const lines = text.split(/\r?\n/).length;
  return {
    id: crypto.randomUUID(),
    name: `Pasted text · ${lines} lines`,
    mimeType: "text/plain",
    size: new Blob([text]).size,
    kind: "pasted-text",
    dataUrl: null,
    extractedText: cleanExtractedText(text),
  };
}

export function attachmentPromptContext(attachments: LocalAttachment[]) {
  const textAttachments = attachments.filter((attachment) => attachment.extractedText);
  if (!textAttachments.length) return "";
  return textAttachments
    .map((attachment) => `<attached_file name="${attachment.name.replace(/[<>"]/g, "")}">\n${attachment.extractedText.slice(0, MAX_EXTRACTED_CHARS)}\n</attached_file>`)
    .join("\n\n")
    .slice(0, 12_000);
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
