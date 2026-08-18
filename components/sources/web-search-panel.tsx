"use client";

/**
 * Search the web and add a result as a source.
 *
 * Split out of `sources-panel.tsx` (AUDIT.md §6.2). The snippets are untrusted
 * text: they are stored as a source and end up inside the `<source_data>` fence
 * in every prompt that reads them (`lib/prompt-guard.ts`), never as instructions.
 */

import * as React from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { convexErrorMessage } from "@/lib/convex-error";
import { indexDocument } from "@/lib/source-upload";

/** Only the fields the panel renders; providers return a good deal more. */
interface WebResult {
  title?: string;
  snippet?: string;
  url: string;
  source?: string;
}

export function WebSearchPanel({ notebookId }: { notebookId: string }) {
  const [query, setQuery] = React.useState("");
  const [isSearching, setIsSearching] = React.useState(false);
  const [results, setResults] = React.useState<WebResult[]>([]);
  const [showResults, setShowResults] = React.useState(false);

  const createDocument = useMutation(api.documents.createDocument);
  const setIndexStatus = useMutation(api.documents.setIndexStatus);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setShowResults(true);
    setResults([]);

    try {
      const response = await fetch("/api/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (data.success && data.results) {
        setResults(data.results);
      } else {
        // A missing provider key is a 503 naming the variable, so the message is
        // worth showing verbatim.
        toast.error(`Search failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      toast.error("Failed to perform web search");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAdd = async (result: WebResult) => {
    try {
      const content = `Source: ${result.url}\nTitle: ${result.title}\nDate: ${new Date().toISOString()}\n\n${result.snippet || ""}`;

      const documentId = await createDocument({
        notebookId: notebookId as never,
        name: result.title || "Web Result",
        type: "txt",
        content,
      });

      const status = await indexDocument({
        documentId,
        notebookId,
        content,
        documentName: result.title ?? "Web Result",
      });

      await setIndexStatus({ documentId: documentId as never, status }).catch(
        () => {
          // The badge is nice to have; the source is already stored.
        }
      );

      // Removed from the list to show it landed.
      setResults((prev) => prev.filter((r) => r.url !== result.url));
      toast.success("Web source added");
    } catch (error) {
      toast.error(convexErrorMessage(error, "Failed to add web source"));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          placeholder="Search the web for new sources"
          aria-label="Search the web for new sources"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          disabled={isSearching}
        />
        {isSearching && (
          <div
            role="status"
            aria-label="Searching the web"
            className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-1.5 size-3"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          Search Web
        </Button>

        {showResults && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setShowResults(false);
              setResults([]);
              setQuery("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {showResults && (
        <div className="mt-2 max-h-[300px] space-y-2 overflow-y-auto pr-1">
          {results.length === 0 && !isSearching ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              No results found.
            </p>
          ) : (
            results.map((result) => (
              <div
                key={result.url}
                className="rounded-md border border-border bg-background p-2 text-sm shadow-sm"
              >
                <div
                  className="mb-1 line-clamp-1 font-medium"
                  title={result.title}
                >
                  {result.title}
                </div>
                <div className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                  {result.snippet}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="max-w-[120px] truncate text-[10px] text-muted-foreground"
                    title={result.url}
                  >
                    {result.source || new URL(result.url).hostname}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleAdd(result)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mr-1 size-3"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14" />
                      <path d="M12 5v14" />
                    </svg>
                    Add
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
