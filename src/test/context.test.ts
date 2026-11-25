import { describe, expect, it } from "vitest";

import { getContextTerms } from "@/lib/context";

describe("local context search terms", () => {
  it("normalizes Unicode text, removes common words, and keeps unique terms", () => {
    expect(getContextTerms("The Amanda project needs café research and project planning")).toEqual([
      "amanda",
      "project",
      "needs",
      "café",
      "research",
    ]);
  });

  it("limits the number of search terms", () => {
    expect(getContextTerms("alpha bravo charlie delta echo foxtrot golf", 3)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("returns no terms for empty or stop-word-only input", () => {
    expect(getContextTerms("and the with")).toEqual([]);
    expect(getContextTerms("   ")).toEqual([]);
  });
});
