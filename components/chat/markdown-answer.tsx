"use client";

/**
 * An assistant answer, rendered as markdown with live citations.
 *
 * Split out of `notebook-chat.tsx` (AUDIT.md §6.2). Every node that can hold
 * text maps its string children through `renderWithCitations`, because a `[1]`
 * can land in a paragraph, a list item, a table cell or a bold run — and one
 * that renders as literal text in only some of those looks like a bug.
 */

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderWithCitations } from "./render-citations";
import type { Citation } from "./types";

interface MarkdownAnswerProps {
  content: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

export function MarkdownAnswer({
  content,
  citations,
  onCitationClick,
}: MarkdownAnswerProps) {
  /** Map a node's string children through the citation renderer. */
  const withCitations = React.useCallback(
    (children: React.ReactNode) =>
      React.Children.map(children, (child) =>
        typeof child === "string"
          ? renderWithCitations(child, citations, onCitationClick)
          : child
      ),
    [citations, onCitationClick]
  );

  return (
    <div className="max-w-none break-words text-sm dark:prose-invert prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:p-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{withCitations(children)}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="mb-1 last:mb-0">{withCitations(children)}</li>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 text-lg font-bold">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 text-base font-bold">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 text-sm font-bold">{children}</h3>
          ),
          strong: ({ children }) => <strong>{withCitations(children)}</strong>,
          em: ({ children }) => <em>{withCitations(children)}</em>,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match && !String(children).includes("\n");

            return isInline ? (
              <code
                className="rounded bg-muted-foreground/20 px-1 py-0.5 font-mono text-xs"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code
                className="my-2 block overflow-x-auto rounded-lg bg-muted-foreground/10 p-2 font-mono text-xs"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="m-0 bg-transparent">{children}</pre>
          ),
          // Wide tables scroll inside their own box rather than widening the
          // whole message column on a phone.
          table: ({ children }) => (
            <div className="my-2 w-full overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="border-r border-border px-4 py-2 text-left font-medium last:border-0">
              {withCitations(children)}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-r border-border px-4 py-2 text-left align-top last:border-0">
              {withCitations(children)}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
