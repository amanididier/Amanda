import { createFileRoute } from "@tanstack/react-router";
import { Cpu, ExternalLink, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Local AI model</h2>
          <Badge variant="secondary">Not installed</Badge>
        </div>
        <Card className="mt-3">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Cpu aria-hidden="true" className="size-4" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base">Qwen3.5-2B</CardTitle>
                <CardDescription className="mt-1">
                  Intended local model · download is separate from the app
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <p className="text-muted-foreground">
                Amanda is still running as a web app. The desktop runtime needed to download,
                install, and run a model on this device is not set up yet, so no model is being
                downloaded or used.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              The official Qwen release is in Hugging Face Transformers format; it does not provide
              an official GGUF file. We will only offer an in-app installer once a compatible
              runtime and verified model package are ready.
            </p>
            <div>
              <Button variant="outline" size="sm" asChild>
                <a href="https://huggingface.co/Qwen/Qwen3.5-2B" target="_blank" rel="noreferrer">
                  View official model files
                  <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Current AI service</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Amanda desktop stores your project data in a local SQLite database and does not require an
          account. This browser preview is for the interface only; local model download and Qwen
          inference are not ready yet.
        </p>
      </section>
    </div>
  );
}
