import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { notesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_shell/notes")({
  head: () => ({
    meta: [
      { title: "Daily Notes — Amanda" },
      { name: "description", content: "Capture ideas and daily thoughts." },
      { property: "og:title", content: "Daily Notes — Amanda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotesPage,
});

function NotesPage() {
  const { data: notes } = useQuery(notesQuery());

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="font-serif text-3xl tracking-tight">Daily Notes</h1>
      <p className="mt-2 text-sm text-muted-foreground">A fast, distraction-free capture space.</p>
      <div className="mt-8 flex flex-col divide-y divide-border">
        {notes?.length === 0 && (
          <p className="py-8 text-sm text-muted-foreground">
            No notes yet. Your captured ideas will appear here.
          </p>
        )}
        {notes?.map((note) => (
          <div key={note.id} className="py-3">
            <p className="text-sm font-medium">{note.title}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
