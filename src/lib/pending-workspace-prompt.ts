let pendingWorkspacePrompt: string | null = null;

export function setPendingWorkspacePrompt(prompt: string | null) {
  pendingWorkspacePrompt = prompt;
}

export function takePendingWorkspacePrompt() {
  const prompt = pendingWorkspacePrompt;
  pendingWorkspacePrompt = null;
  return prompt;
}


import type { LocalAttachment } from "@/lib/local-attachments";

let pendingWorkspaceMessage: { prompt: string; attachments: LocalAttachment[] } | null = null;

export function setPendingWorkspaceMessage(prompt: string, attachments: LocalAttachment[]) {
  pendingWorkspaceMessage = { prompt, attachments };
}

export function takePendingWorkspaceMessage() {
  const message = pendingWorkspaceMessage;
  pendingWorkspaceMessage = null;
  return message;
}
