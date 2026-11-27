import { describe, expect, it } from "vitest";

import { parseLocalAction } from "@/lib/local-actions";

function call(name: string, value: unknown) {
  return { id: "test-call-0", index: 0, name, arguments: JSON.stringify(value) };
}

describe("approved local action validation", () => {
  it("accepts bounded project task proposals and normalizes optional dates", () => {
    expect(
      parseLocalAction(
        call("propose_task", {
          title: "Review interview notes",
          description: "List the recurring themes.",
          dueDate: "2026-12-01",
        }),
      ),
    ).toEqual({
      name: "propose_task",
      title: "Review interview notes",
      description: "List the recurring themes.",
      dueDate: "2026-12-01",
    });
    expect(
      parseLocalAction(
        call("propose_task", { title: "Follow up", description: "", dueDate: null }),
      ),
    ).toMatchObject({ dueDate: null });
  });

  it("rejects malformed, oversized, unknown, and invalid-date proposals", () => {
    expect(() =>
      parseLocalAction({ id: "malformed-call", index: 0, name: "propose_task", arguments: "{" }),
    ).toThrow("invalid structured data");
    expect(() =>
      parseLocalAction(call("propose_task", { title: "", description: "", dueDate: null })),
    ).toThrow("task title");
    expect(() =>
      parseLocalAction(
        call("propose_task", {
          title: "Task",
          description: "",
          dueDate: "2026-02-31",
        }),
      ),
    ).toThrow("valid YYYY-MM-DD");
    expect(() => parseLocalAction(call("delete_all", {}))).toThrow("unsupported action");
    expect(() =>
      parseLocalAction(call("propose_note", { title: "Note", content: "ok", path: "C:\\" })),
    ).toThrow("unsupported fields");
  });

  it("requires an approved roadmap to have three to ten complete steps", () => {
    const steps = [
      {
        phase: "Prepare",
        title: "Define scope",
        details: "List the outcomes.",
        verificationCriteria: "Three outcomes are recorded.",
      },
      {
        phase: "Build",
        title: "Create a draft",
        details: "Implement the first version.",
        verificationCriteria: "The draft can be reviewed.",
      },
      {
        phase: "Review",
        title: "Validate results",
        details: "Check the criteria.",
        verificationCriteria: "Each outcome passes.",
      },
    ];
    expect(
      parseLocalAction(call("propose_roadmap", { title: "Roadmap", summary: "Plan", steps })).name,
    ).toBe("propose_roadmap");
    expect(() =>
      parseLocalAction(
        call("propose_roadmap", { title: "Roadmap", summary: "Plan", steps: steps.slice(0, 2) }),
      ),
    ).toThrow("between 3 and 10 steps");
  });
});
