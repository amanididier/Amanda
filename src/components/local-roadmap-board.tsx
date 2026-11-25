import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { Check, Circle, ListOrdered } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isDesktopApp } from "@/lib/database";
import { workspacePlanQuery } from "@/lib/queries";

export function LocalRoadmapBoard({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const desktop = isDesktopApp();
  const { data, isLoading } = useQuery(workspacePlanQuery(workspaceId));
  const plan = data?.plan;
  const steps = data?.steps ?? [];
  const completedCount = steps.filter((step) => step.status === "done").length;

  async function toggleStep(stepId: string, completed: boolean) {
    if (!desktop) return;
    try {
      await invoke("update_roadmap_step", {
        workspaceId,
        stepId,
        completed,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["plan", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["tasks", "active"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the roadmap step");
    }
  }

  return (
    <section className="mt-8" aria-labelledby="roadmap-heading">
      <div className="flex items-start gap-3">
        <ListOrdered aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 id="roadmap-heading" className="text-lg font-semibold">
            Roadmap
          </h2>
          {isLoading ? (
            <p className="mt-1 text-sm text-muted-foreground">Loading roadmap…</p>
          ) : plan ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Version {plan.version} · {completedCount} of {steps.length} steps complete
              </p>
              <div className="mt-4 rounded-lg border border-border">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="font-medium">{plan.title}</h3>
                  {plan.summary && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {plan.summary}
                    </p>
                  )}
                </div>
                <ol className="divide-y divide-border">
                  {steps.map((step) => (
                    <li key={step.id} className="flex items-start gap-3 px-3 py-3 sm:px-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-0.5 shrink-0"
                        aria-label={
                          step.status === "done"
                            ? `Mark ${step.title} incomplete`
                            : `Mark ${step.title} complete`
                        }
                        aria-pressed={step.status === "done"}
                        disabled={!desktop}
                        onClick={() => void toggleStep(step.id, step.status !== "done")}
                      >
                        {step.status === "done" ? (
                          <Check aria-hidden="true" />
                        ) : (
                          <Circle aria-hidden="true" className="text-muted-foreground" />
                        )}
                      </Button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {step.phase}
                        </p>
                        <p
                          className={`mt-1 text-sm ${step.status === "done" ? "text-muted-foreground line-through" : "font-medium"}`}
                        >
                          {step.title}
                        </p>
                        {step.details && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                            {step.details}
                          </p>
                        )}
                        {step.verification_criteria && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Complete when: {step.verification_criteria}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              No approved roadmap yet. Ask Amanda in the project conversation to draft one; review
              and approve the proposal before it creates steps and tasks.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
