import { describe, expect, it } from "vitest";

import {
  buildResearchQueries,
  countRelevantResearchResults,
  mergeResearchResults,
  scoreResearchResult,
  shouldResearchWeb,
} from "@/lib/research-agent";

describe("domain-independent web research routing", () => {
  it.each([
    "What is photosynthesis?",
    "Tell me about quantum computing.",
    "Latest developments in renewable energy.",
    "How does Rwanda's education system work?",
    "Compare the economic effects of tourism and agriculture.",
    "Explain the history of the printing press.",
    "What are the health risks of prolonged sleep deprivation?",
  ])("routes factual questions to web research: %s", (prompt) => {
    expect(shouldResearchWeb(prompt)).toBe(true);
  });

  it.each([
    "Hello Amanda!",
    "Rewrite this paragraph in a friendlier tone.",
    "Translate this sentence into French.",
    "Write a short fictional story about a dragon.",
    "Calculate 125 + 375.",
    "Create a task to review my notes.",
  ])("keeps non-research requests local: %s", (prompt) => {
    expect(shouldResearchWeb(prompt)).toBe(false);
  });
});

describe("research query planning and result ranking", () => {
  it("creates a focused fallback query without losing the subject", () => {
    const queries = buildResearchQueries(
      "Search the web for three significant AI developments announced between November 20 and November 27, 2026. Include original source URLs.",
    );

    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("AI developments");
    expect(queries[1]?.toLocaleLowerCase()).toContain("ai");
    expect(queries[1]?.toLocaleLowerCase()).toContain("developments");
  });

  it("ranks relevant results and removes duplicate URLs", () => {
    const relevant = {
      title: "Climate change impacts in Rwanda",
      url: "https://example.com/rwanda-climate",
      description: "Research on rainfall, agriculture and climate risks.",
      content: "The report examines climate change effects in Rwanda.",
      provider: "Firecrawl",
    };
    const irrelevant = {
      title: "A history of ancient Roman roads",
      url: "https://example.com/roman-roads",
      description: "Historical transport infrastructure.",
      content: "A review of Roman engineering.",
      provider: "Firecrawl",
    };

    expect(scoreResearchResult("What are the effects of climate change in Rwanda?", relevant)).toBeGreaterThan(0);
    expect(scoreResearchResult("What are the effects of climate change in Rwanda?", irrelevant)).toBe(0);
    const merged = mergeResearchResults(
      "What are the effects of climate change in Rwanda?",
      [irrelevant, relevant],
      [{ ...relevant, title: "Duplicate result" }],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]?.url).toBe(relevant.url);
    expect(countRelevantResearchResults("What are the effects of climate change in Rwanda?", merged)).toBe(1);
  });
});
