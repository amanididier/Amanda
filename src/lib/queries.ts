import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const workspacesQuery = (status: "active" | "archived" = "active") =>
  queryOptions({
    queryKey: ["workspaces", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("status", status)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const workspaceQuery = (id: string) =>
  queryOptions({
    queryKey: ["workspace", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

export const allPlanStepsQuery = queryOptions({
  queryKey: ["plan-steps"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("plan_steps")
      .select("*")
      .order("position", { ascending: true });
    if (error) throw error;
    return data;
  },
});

export const workspacePlanQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["plan", workspaceId],
    queryFn: async () => {
      const { data: plans, error } = await supabase
        .from("execution_plans")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("version", { ascending: false })
        .limit(1);
      if (error) throw error;
      const plan = plans?.[0] ?? null;
      if (!plan) return { plan: null, steps: [] };
      const { data: steps, error: stepsError } = await supabase
        .from("plan_steps")
        .select("*")
        .eq("plan_id", plan.id)
        .order("position", { ascending: true });
      if (stepsError) throw stepsError;
      return { plan, steps };
    },
  });

export const conversationQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ["conversation", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

export const messagesQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

export const notesQuery = (archived = false) =>
  queryOptions({
    queryKey: ["daily-notes", archived],
    queryFn: async () => {
      const base = supabase
        .from("daily_notes")
        .select("*")
        .order("updated_at", { ascending: false });
      const { data, error } = archived
        ? await base.not("archived_at", "is", null)
        : await base.is("archived_at", null);
      if (error) throw error;
      return data;
    },
  });
