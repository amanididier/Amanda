import { createFileRoute } from "@tanstack/react-router";

import { LocalMemoryManager } from "@/components/local-memory-manager";

export const Route = createFileRoute("/_authenticated/_shell/memory")({
  head: () => ({
    meta: [
      { title: "Memory — Amanda" },
      { name: "description", content: "Review and manage the memories Amanda may use." },
    ],
  }),
  component: MemoryPage,
});

function MemoryPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs tracking-wider text-muted-foreground uppercase">Personal memory</p>
      <h1 className="mt-1 font-serif text-3xl tracking-tight">Memory</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Keep Amanda&apos;s context useful and under your control. Nothing is saved automatically.
      </p>
      <div className="mt-8">
        <LocalMemoryManager />
      </div>
    </div>
  );
}
