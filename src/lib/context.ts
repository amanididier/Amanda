import { selectRows } from "@/lib/database";

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "can",
  "for",
  "from",
  "have",
  "help",
  "into",
  "just",
  "that",
  "the",
  "then",
  "this",
  "with",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "would",
]);

export type RelatedContext = {
  notes: Array<{ title: string; content: string; attachmentText: string }>;
  memories: Array<{ content: string; category: string; project_id: string | null }>;
  research: Array<{
    title: string;
    url: string;
    summary: string;
    publication_date: string | null;
    retrieved_at: string;
  }>;
};

type SearchRow = { title: string; content: string; attachment_text: string };

export function getContextTerms(query: string, limit = 5) {
  const terms = query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return [...new Set(terms)].filter((term) => !STOP_WORDS.has(term)).slice(0, limit);
}

export async function retrieveRelatedContext(
  query: string,
  workspaceId: string,
): Promise<RelatedContext> {
  const terms = getContextTerms(query);
  if (terms.length === 0) return { notes: [], memories: [], research: [] };

  const patterns = terms.map((term) => `%${term}%`);
  const whereClause = (columns: string[]) =>
    terms
      .map(
        (_, index) => `(${columns.map((column) => `${column} LIKE $${index + 2}`).join(" OR ")})`,
      )
      .join(" OR ");
  const parameters = [workspaceId, ...patterns];

  const [notes, memories, research] = await Promise.all([
    selectRows<SearchRow>(
      `SELECT title, content, COALESCE((SELECT group_concat(name || ': ' || substr(extracted_text, 1, 6000), char(10) || char(10)) FROM local_attachments WHERE note_id = daily_notes.id AND extracted_text != ''), '') AS attachment_text FROM daily_notes WHERE archived_at IS NULL AND (project_id IS NULL OR project_id = $1) AND (${whereClause(["title", "content"])}) ORDER BY updated_at DESC LIMIT 4`,
      parameters,
    ),
    selectRows<RelatedContext["memories"][number]>(
      `SELECT content, category, project_id FROM memory_items WHERE archived = 0 AND (project_id IS NULL OR project_id = $1) AND (${whereClause(["content", "category"])}) ORDER BY confidence DESC, updated_at DESC LIMIT 4`,
      parameters,
    ),
    selectRows<RelatedContext["research"][number]>(
      `SELECT title, url, summary, publication_date, retrieved_at FROM research_sources WHERE archived_at IS NULL AND (project_id IS NULL OR project_id = $1) AND (${whereClause(["title", "summary"])}) ORDER BY retrieved_at DESC LIMIT 3`,
      parameters,
    ),
  ]);

  return {
    notes: notes.map((note) => ({
      title: note.title,
      content: note.content.replace(/<!--amanda-rich-note-->/, "").replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim(),
      attachmentText: note.attachment_text,
    })),
    memories,
    research,
  };
}
