let pendingWorkspacePrompt: string | null = null;

export function setPendingWorkspacePrompt(prompt: string | null) {
  pendingWorkspacePrompt = prompt;
}

export function takePendingWorkspacePrompt() {
  const prompt = pendingWorkspacePrompt;
  pendingWorkspacePrompt = null;
  return prompt;
}
