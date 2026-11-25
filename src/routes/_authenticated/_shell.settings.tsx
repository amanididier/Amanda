import { createFileRoute } from "@tanstack/react-router";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme, type Theme } from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Amanda" },
      { name: "description", content: "Appearance, AI provider, and account." },
      { property: "og:title", content: "Settings — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-3xl tracking-tight">Settings</h1>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="mt-3 flex max-w-xs flex-col gap-1.5">
          <Label>Theme</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">AI Provider</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Amanda is powered by the built-in Lovable AI — no API key required.
          Bringing your own Google Gemini or OpenAI key is planned; secure
          per-user key storage is not yet available in this environment, so
          those options are intentionally disabled rather than pretending to
          work.
        </p>
      </section>
    </div>
  );
}
