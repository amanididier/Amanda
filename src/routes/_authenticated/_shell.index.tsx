import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EyeOff } from "lucide-react";

import { CreateWorkspaceDialog } from "@/components/app-shell";
import { LocalWorkspaceChat } from "@/components/local-workspace-chat";
import { TemporaryChat } from "@/components/temporary-chat";
import { Button } from "@/components/ui/button";
import { generalAssistantWorkspaceQuery } from "@/lib/queries";
import { setPendingWorkspacePrompt } from "@/lib/pending-workspace-prompt";

export const Route = createFileRoute("/_authenticated/_shell/")({
  head: () => ({
    meta: [
      { title: "Amanda — Your workspace" },
      { name: "description", content: "A private place to think, research, and make progress." },
      { property: "og:title", content: "Amanda — Your workspace" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkspaceHomePage,
});

function WorkspaceHomePage() {
  const navigate = useNavigate();
  const { data: workspace, isLoading } = useQuery(generalAssistantWorkspaceQuery);
  const [temporary, setTemporary] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="relative flex min-h-full flex-col">
      <div className="absolute top-5 right-6 z-10">
        <Button
          type="button"
          variant={temporary ? "secondary" : "ghost"}
          size="icon"
          aria-label={temporary ? "Exit temporary chat" : "Start temporary chat"}
          title={temporary ? "Temporary chat is on" : "Temporary chat"}
          onClick={() => setTemporary((value) => !value)}
        >
          <EyeOff aria-hidden="true" />
        </Button>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-16 sm:px-10">
        {temporary ? (
          <TemporaryChat onClose={() => setTemporary(false)} />
        ) : workspace ? (
          <LocalWorkspaceChat
            workspace={workspace}
            tasks={[]}
            landing
            onBeginWorkspace={(prompt) => {
              setPendingWorkspacePrompt(prompt);
              setCreateOpen(true);
            }}
          />
        ) : (
          <div className="py-16 text-center">
            <h1 className="font-serif text-4xl tracking-tight">What’s on your mind?</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {isLoading ? "Preparing your workspace…" : "Open Amanda desktop to start a local conversation."}
            </p>
          </div>
        )}
      </div>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setPendingWorkspacePrompt(null);
        }}
        onCreated={(id) => {
          setCreateOpen(false);
          void navigate({ to: "/w/$workspaceId", params: { workspaceId: id } });
        }}
      />
    </div>
  );
}
