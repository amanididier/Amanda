import { supabase } from "@/integrations/supabase/client";

export type WorkspaceType = "project" | "research";

/** Creates a workspace together with its default conversation. */
export async function createWorkspace(
  type: WorkspaceType,
  name: string,
  description = "",
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not signed in");

  const { data: workspace, error } = await supabase
    .from("workspaces")
    .insert({
      user_id: userData.user.id,
      name: name.trim() || "Untitled project",
      description,
      workspace_type: type,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: convError } = await supabase.from("conversations").insert({
    workspace_id: workspace.id,
    user_id: userData.user.id,
    title: "Amanda",
  });
  if (convError) throw convError;

  await supabase.from("workspace_activity").insert({
    workspace_id: workspace.id,
    user_id: userData.user.id,
    activity_type: "workspace_created",
    description: `Created ${type} “${workspace.name}”`,
  });

  return workspace;
}

/** Returns the workspace's first conversation, creating one if missing. */
export async function ensureConversation(workspaceId: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Not signed in");

  const { data: existing, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const conversation = existing?.[0];
  if (conversation) return conversation;

  const { data: created, error: insertError } = await supabase
    .from("conversations")
    .insert({
      workspace_id: workspaceId,
      user_id: userData.user.id,
      title: "Amanda",
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

/** Sends note content into a workspace conversation as a user message. */
export async function sendNoteToWorkspace(
  workspaceId: string,
  noteContent: string,
) {
  const conversation = await ensureConversation(workspaceId);
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: noteContent,
  });
  if (error) throw error;
  return conversation;
}
