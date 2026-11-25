import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_shell/")({
  head: () => ({
    meta: [
      { title: "Home — Amanda" },
      {
        name: "description",
        content: "Your Amanda dashboard: projects, tasks, and ideas.",
      },
      { property: "og:title", content: "Home — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-6 pt-24">
      <h1 className="font-serif text-4xl tracking-tight">{greeting}</h1>
      <p className="mt-3 text-muted-foreground">What would you like to make progress on today?</p>
    </div>
  );
}
