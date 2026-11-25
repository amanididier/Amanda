import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

// Auth gate for the whole protected subtree. Client-only because the session
// lives in browser storage; server functions are protected separately by
// requireSupabaseAuth middleware.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
