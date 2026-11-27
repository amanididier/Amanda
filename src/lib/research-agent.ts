export type ResearchSearchResult = {
  title: string;
  url: string;
  description: string;
  content: string;
  provider: string;
  sourceType?: string;
  publishedDate?: string | null;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "before",
  "between",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "for",
  "from",
  "give",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "include",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "please",
  "provide",
  "show",
  "some",
  "tell",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "this",
  "those",
  "to",
  "use",
  "was",
  "we",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "would",
  "you",
  "your",
  "search",
  "web",
  "internet",
  "online",
  "find",
  "look",
  "research",
  "latest",
  "recent",
  "current",
  "new",
  "news",
  "information",
  "sources",
  "source",
  "articles",
  "article",
  "results",
  "result",
  "explain",
  "describe",
  "summarize",
  "summary",
  "each",
  "one",
  "three",
  "five",
  "top",
  "best",
  "during",
  "happened",
  "happening",
]);

function words(value: string) {
  return (value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])
    .filter((word) => !STOP_WORDS.has(word) && !/^\d+$/.test(word));
}

export function shouldResearchWeb(prompt: string) {
  const value = prompt.trim();
  if (value.length < 12) return false;

  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|okay|ok|goodbye)[!.\s]*$/i.test(
      value,
    )
  ) {
    return false;
  }

  // Keep questions about Amanda's private workspace and conversation context local.
  if (
    /\b(?:my|our|this|these)\s+(?:(?:open|recent|completed|upcoming|saved|current|latest|active|last)\s+)?(?:tasks?|notes?|projects?|workspace|conversation|messages?|files?|attachments?|memories|roadmaps?|plans?)\b/i.test(
      value,
    ) ||
    /\bwhat did we discuss\b/i.test(value)
  ) {
    return false;
  }

  // Editing user-provided material, creative writing, and simple calculations do not need live search.
  if (
    /^\s*(rewrite|rephrase|translate|proofread|polish|correct the grammar|summarize this|shorten this)\b/i.test(
      value,
    )
  ) {
    return false;
  }
  if (
    /^\s*(write|create|compose)\s+(?:me\s+)?(?:a\s+)?(?:poem|song|fictional story|short story|bedtime story)\b/i.test(
      value,
    )
  ) {
    return false;
  }
  if (/^\s*(what is|calculate|compute)\s+\d+(?:\.\d+)?\s*[+*/-]\s*\d/i.test(value)) {
    return false;
  }
  if (/^\s*(create|add|mark|complete|update|delete)\s+(?:a\s+)?(task|note|memory|roadmap)\b/i.test(value)) {
    return false;
  }

  // Explicit requests and time-sensitive questions always search.
  if (
    /\b(search|look up|find sources|browse|on the web|online|internet|fact[- ]?check|verify with sources|latest|recent|current|today|yesterday|this week|news|weather|forecast|exchange rate|price|pricing|statistics|regulations?|best|top|ranked|ranking|costs?|salaries|jobs|universities|colleges|scholarships|admission|deadline|20\d{2})\b/i.test(
      value,
    )
  ) {
    return true;
  }

  // Route substantive knowledge questions across domains, not just technology and news.
  return /\b(what|who|when|where|why|how|explain|define|describe|tell me about|overview of|guide to|learn about|understand|compare|difference|versus|vs\.?|history|causes|effects|impact|benefits|risks|examples|recommend|recommendations|review|evaluate|is it true|does|did|will|should|can i|which|list|identify|investigate|research|how to)\b/i.test(
    value,
  );
}

export function buildResearchQueries(prompt: string): string[] {
  const cleaned = prompt
    .replace(/\b(?:please\s+)?(?:search|look)\s+(?:the\s+)?(?:internet|web|online)\s+for\s+/gi, "")
    .replace(/\b(?:do not|don't) answer from (?:your )?(?:existing )?knowledge\b/gi, "")
    .replace(/\b(?:give|provide|include|show) (?:me )?(?:the )?(?:original )?source urls?\b/gi, "")
    .replace(/\b(?:explain|describe) each (?:one|development|result)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[.?!,;:]+$/g, "")
    .trim()
    .slice(0, 500);

  const primary = cleaned || prompt.replace(/\s+/g, " ").trim().slice(0, 500);
  const focusedWords = [...new Set(words(primary))].slice(0, 12);
  const focused = focusedWords.join(" ").slice(0, 300);

  return focused.length >= 8 && focused.toLocaleLowerCase() !== primary.toLocaleLowerCase()
    ? [primary, focused]
    : [primary];
}

export function scoreResearchResult(prompt: string, result: ResearchSearchResult) {
  const queryWords = [...new Set(words(prompt))].slice(0, 24);
  if (queryWords.length === 0) return 0;

  const title = words(result.title);
  const description = words(result.description);
  const content = words(result.content.slice(0, 6_000));
  let score = 0;
  let matches = 0;

  for (const word of queryWords) {
    const inTitle = title.includes(word);
    const inDescription = description.includes(word);
    const inContent = content.includes(word);

    if (inTitle || inDescription || inContent) matches += 1;
    if (inTitle) score += 3;
    if (inDescription) score += 2;
    if (inContent) score += 1;
  }

  return matches >= Math.min(2, queryWords.length) ? score : 0;
}

export function mergeResearchResults(
  prompt: string,
  ...groups: ResearchSearchResult[][]
): ResearchSearchResult[] {
  const unique = new Map<string, ResearchSearchResult>();

  for (const result of groups.flat()) {
    if (!result.url.startsWith("https://")) continue;

    const key = result.url.replace(/#.*$/, "").replace(/\/$/, "").toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, result);
  }

  return [...unique.values()]
    .map((result) => ({ result, score: scoreResearchResult(prompt, result) }))
    .sort((left, right) => right.score - left.score)
    .map(({ result }) => result)
    .slice(0, 8);
}

export function countRelevantResearchResults(prompt: string, results: ResearchSearchResult[]) {
  return results.filter((result) => scoreResearchResult(prompt, result) > 0).length;
}
