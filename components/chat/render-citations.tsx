"use client";

/**
 * Turn `[1]` in an answer into something the reader can open.
 *
 * Split out of `notebook-chat.tsx` (AUDIT.md §6.2). Used from every markdown
 * node that can contain text, which is why it takes plain strings rather than
 * rendering a whole message.
 */

import type * as React from "react";
import { CitationTooltip } from "@/components/citation-tooltip";
import type { Citation } from "./types";

export function renderWithCitations(
  text: string,
  citations: Citation[] | undefined,
  onCitationClick?: (citation: Citation) => void
): React.ReactNode {
  if (!citations || citations.length === 0) return text;

  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const citationNumber = parseInt(match[1], 10);
    const citation = citations.find((c) => c.id === citationNumber);

    if (!citation) {
      // Nothing to open. A model asked for 5 sources will still write [7]
      // occasionally, and rendering that as a chip made an invented reference
      // look exactly like a checked one (AUDIT.md §7). Leave it as the text the
      // model wrote — visible, unclickable, not dressed up as evidence.
      parts.push(match[0]);
    } else if (onCitationClick) {
      parts.push(
        <CitationTooltip
          key={`citation-${match.index}`}
          citationNumber={citationNumber}
          documentName={citation.documentName}
          content={citation.content}
          pageNumber={citation.pageNumber}
          score={citation.score}
          onClick={() => onCitationClick(citation)}
        />
      );
    } else {
      parts.push(
        <span
          key={`citation-${match.index}`}
          className="mx-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded bg-muted px-1 text-xs font-medium text-muted-foreground"
        >
          {citationNumber}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return parts.length > 0 ? parts : text;
}
