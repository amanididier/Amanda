import type { ReactNode } from "react";

type AssistantMarkdownProps = {
  content: string;
};

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className="min-w-0 max-w-full break-words text-sm leading-7 text-foreground">
      {renderBlocks(content)}
    </div>
  );
}

function renderBlocks(content: string): ReactNode[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let index = 0;
  const tick = String.fromCharCode(96);

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const value = paragraph.join(" ").trim();
    if (value) {
      blocks.push(
        <p key={"p-" + blocks.length} className="mb-3 last:mb-0 whitespace-pre-wrap">
          {renderInline(value)}
        </p>,
      );
    }
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (trimmed.startsWith(tick + tick + tick)) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith(tick + tick + tick)) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre key={"code-" + blocks.length} className="mb-4 max-w-full overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 text-[13px] leading-6">
          <code className="font-mono">{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1]?.length ?? 2;
      const className = level === 1
        ? "mb-3 mt-6 first:mt-0 text-xl font-semibold tracking-tight"
        : level === 2
          ? "mb-2 mt-5 first:mt-0 text-lg font-semibold tracking-tight"
          : "mb-2 mt-4 first:mt-0 text-base font-semibold";
      blocks.push(<h2 key={"h-" + blocks.length} className={className}>{renderInline(heading[2] ?? "")}</h2>);
      index += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushParagraph();
      blocks.push(<hr key={"hr-" + blocks.length} className="my-4 border-border" />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={"quote-" + blocks.length} className="mb-4 border-l-2 border-border pl-4 text-muted-foreground">
          {renderBlocks(quote.join("\n"))}
        </blockquote>,
      );
      continue;
    }

    const listMatch = trimmed.match(/^([-*+] |\d+[.)] )/);
    if (listMatch) {
      flushParagraph();
      const ordered = /^\d/.test(listMatch[1] ?? "");
      const items: string[] = [];
      while (index < lines.length) {
        const current = (lines[index] ?? "").trim();
        const match = current.match(/^([-*+] |\d+[.)] )(.*)$/);
        if (!match || /^\d/.test(match[1] ?? "") !== ordered) break;
        items.push(match[2] ?? "");
        index += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={"list-" + blocks.length}
          className={ordered
            ? "mb-4 list-decimal space-y-1 pl-6 marker:text-muted-foreground"
            : "mb-4 list-disc space-y-1 pl-6 marker:text-muted-foreground"}
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="pl-1">{renderInline(item)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    if (trimmed.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) {
      flushParagraph();
      const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const headers = cells(trimmed);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").trim().includes("|")) {
        rows.push(cells(lines[index] ?? ""));
        index += 1;
      }
      blocks.push(
        <div key={"table-" + blocks.length} className="mb-4 max-w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-muted/60">
              <tr>{headers.map((cell, cellIndex) => <th key={cellIndex} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold">{renderInline(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border last:border-0">
                  {headers.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{renderInline(row[cellIndex] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function renderInline(value: string): ReactNode[] {
  const tick = String.fromCharCode(96);
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\x60[^\x60]+\x60|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    if (token.startsWith("[") && token.includes("](")) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      nodes.push(
        link
          ? <a key={"a-" + start} href={link[2]} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-4">{link[1]}</a>
          : token,
      );
    } else if (token.startsWith(tick)) {
      nodes.push(<code key={"c-" + start} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={"b-" + start} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={"d-" + start}>{token.slice(2, -2)}</del>);
    } else {
      nodes.push(<em key={"i-" + start}>{token.slice(1, -1)}</em>);
    }
    cursor = start + token.length;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}
