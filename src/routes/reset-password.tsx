import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Amanda" },
      { name: "description", content: "Choose a new password for Amanda." },
      { property: "og:title", content: "Reset password — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Recovery links arrive with #type=recovery in the URL hash.
    const hash = window.location.hash;
    setValid(hash.includes("type=recovery"));
  }, []);

  async function handleUpdate() {
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-serif text-3xl">Choose a new password</h1>
        {valid === false && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            This reset link is invalid or has expired. Request a new one from
            the sign-in page.
          </p>
        )}
        {valid && (
          <div className="mt-6 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdate();
                }}
              />
            </div>
            <Button onClick={handleUpdate} disabled={busy}>
              Update password
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
