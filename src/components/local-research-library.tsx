import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { ExternalLink, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { executeSql, isDesktopApp, selectRows } from "@/lib/database";
import { workspacesQuery } from "@/lib/queries";

const NO_PROJECT = "__none__";

type WebSearchResult = { title: string; url: string; description: string; provider: string };
type SavedResearch = {
  id: string;
  project_id: string | null;
  title: string;
  url: string;
  publication_date: string | null;
  retrieved_at: string;
  summary: string;
  archived_at: string | null;
};

export function LocalResearchLibrary() {
  const queryClient = useQueryClient();
  const desktop = isDesktopApp();
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [savedResultUrls, setSavedResultUrls] = useState<Set<string>>(() => new Set());
  const [projectId, setProjectId] = useState(NO_PROJECT);
  const [searching, setSearching] = useState(false);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const {
    data: credential,
  } = useQuery({
    queryKey: ["web-search-status"],
    queryFn: () => invoke<{ activeProvider: string; firecrawlConfigured: boolean; braveConfigured: boolean }>("get_web_search_status"),
    enabled: desktop,
    staleTime: 60_000,
  });
  const { data: projects = [] } = useQuery(workspacesQuery("active"));
  const { data: savedSources = [], isLoading: loadingSavedSources } = useQuery({
    queryKey: ["research-sources", "active"],
    queryFn: () =>
      selectRows<SavedResearch>(
        "SELECT * FROM research_sources WHERE archived_at IS NULL ORDER BY retrieved_at DESC LIMIT 100",
      ),
  });

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 3 || term.length > 200) {
      toast.error("Research queries must be between 3 and 200 characters");
      return;
    }
    if (!desktop || (!credential?.firecrawlConfigured && !credential?.braveConfigured)) {
      toast.error("Connect a web search provider in Settings before searching");
      return;
    }

    setSearching(true);
    setResults([]);
    setSavedResultUrls(new Set());
    setSearchedQuery(term);
    try {
      const found = await invoke<WebSearchResult[]>("search_web", { query: term });
      setResults(found);
      if (found.length === 0) toast.info("The search provider returned no web results for this query");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Online research could not be completed",
      );
    } finally {
      setSearching(false);
    }
  }

  async function saveSource(result: WebSearchResult) {
    if (!desktop || savedResultUrls.has(result.url) || savingUrl) return;
    setSavingUrl(result.url);
    try {
      const parsedUrl = new URL(result.url);
      if (parsedUrl.protocol !== "https:")
        throw new Error("Only secure HTTPS sources can be saved");
      const retrievedAt = new Date().toISOString();
      await executeSql(
        "INSERT INTO research_sources (id, project_id, title, url, publication_date, retrieved_at, summary, citation_metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          crypto.randomUUID(),
          projectId === NO_PROJECT ? null : projectId,
          result.title.trim().slice(0, 300),
          parsedUrl.toString(),
          null,
          retrievedAt,
          result.description.trim().slice(0, 1200),
          JSON.stringify({ provider: result.provider, retrievedAt, searchQuery: searchedQuery }),
        ],
      );
      setSavedResultUrls((current) => new Set(current).add(result.url));
      await queryClient.invalidateQueries({ queryKey: ["research-sources"] });
      toast.success("Source saved to Amanda");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this source");
    } finally {
      setSavingUrl(null);
    }
  }

  async function archiveSource(sourceId: string) {
    try {
      await executeSql("UPDATE research_sources SET archived_at = $1 WHERE id = $2", [
        new Date().toISOString(),
        sourceId,
      ]);
      await queryClient.invalidateQueries({ queryKey: ["research-sources"] });
      toast.success("Research source archived");
    } catch {
      toast.error("Could not archive this research source");
    }
  }

  const researchProjects = projects.filter((project) => project.workspace_type === "project");
  const researchHubs = projects.filter((project) => project.workspace_type === "research");
  const workspaceNames = new Map(projects.map((project) => [project.id, project.name]));

  return (
    <div className="flex flex-col gap-8">
      <section
        className="rounded-lg border border-border p-4 sm:p-5"
        aria-labelledby="online-research-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Search aria-hidden="true" className="mt-0.5 size-5 text-muted-foreground" />
            <div>
              <h2 id="online-research-heading" className="text-sm font-semibold">
                Search the web
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Online search runs only when you press Search. Your selected provider receives the query; results are not saved until you choose a source.
              </p>
            </div>
          </div>
          {desktop && (
            <span className="text-xs text-muted-foreground">
              Using {credential?.activeProvider === "brave" ? "Brave Search" : "Firecrawl"}
            </span>
          )}
        </div>

        {!desktop ? (
          <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Online research is available in the installed Windows desktop app. You can still browse
            and revisit sources saved in Amanda.
          </p>
        ) : (!credential?.firecrawlConfigured && !credential?.braveConfigured) ? (
          <div className="mt-4 rounded-md bg-muted px-3 py-3 text-sm">
            <p className="font-medium">Connect a web search provider</p>
            <p className="mt-1 text-muted-foreground">Open Settings → Web search to add your Firecrawl or Brave API key. Amanda tests and securely saves the key for you.</p>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSearch(event)} className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="research-query">What do you want to research?</Label>
              <Input
                id="research-query"
                value={query}
                onChange={(event) => setQuery(event.target.value.slice(0, 200))}
                maxLength={200}
                minLength={3}
                placeholder="Search a current question or topic…"
                disabled={searching}
              />
            </div>
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex flex-col gap-1.5">
                <Label>Save results to (optional)</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={searching}>
                  <SelectTrigger aria-label="Associate research with a project">
                    <SelectValue placeholder="Personal research" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NO_PROJECT}>Personal research</SelectItem>
                      {researchProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                      {researchHubs.map((hub) => (
                        <SelectItem key={hub.id} value={hub.id}>
                          {hub.name} (research hub)
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={searching || query.trim().length < 3}>
                <Search data-icon="inline-start" />
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>
          </form>
        )}

        {results.length > 0 && (
          <div className="mt-5 flex flex-col divide-y divide-border rounded-md border border-border">
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {results.length} results for “{searchedQuery}” · Search snippets are not full-page
              source verification.
            </div>
            {results.map((result) => (
              <article
                key={result.url}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {result.title}
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </a>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{result.url}</p>
                  {result.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {result.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Publication date not provided by search results.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void saveSource(result)}
                  disabled={savedResultUrls.has(result.url) || savingUrl !== null}
                >
                  {savedResultUrls.has(result.url)
                    ? "Saved"
                    : savingUrl === result.url
                      ? "Saving…"
                      : "Save source"}
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="saved-research-heading">
        <div>
          <h2 id="saved-research-heading" className="text-lg font-semibold">
            Saved research
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reopen cited sources and read the saved search snippets offline.
          </p>
        </div>
        <div className="mt-4 divide-y divide-border rounded-lg border border-border">
          {loadingSavedSources && (
            <p className="px-4 py-6 text-sm text-muted-foreground">Loading saved sources…</p>
          )}
          {!loadingSavedSources && savedSources.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No saved research yet. Search online and save a source to keep it with Amanda.
            </p>
          )}
          {savedSources.map((source) => (
            <article
              key={source.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {source.title}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
                <p className="mt-1 break-all text-xs text-muted-foreground">{source.url}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {source.summary || "No search summary was provided."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Retrieved {new Date(source.retrieved_at).toLocaleString()} · Publication date{" "}
                  {source.publication_date ?? "not provided"}
                  {source.project_id && workspaceNames.has(source.project_id)
                    ? ` · ${workspaceNames.get(source.project_id)}`
                    : " · Personal research"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void archiveSource(source.id)}
                disabled={!desktop}
              >
                Archive
              </Button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
