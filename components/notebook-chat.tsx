"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/model-selector";
import { CitationTooltip } from "@/components/citation-tooltip";
import { DEFAULT_MODEL, isValidModel, type ModelId } from "@/lib/openrouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Citation interface matching the API response
export interface Citation {
  id: number;
  documentId: string;
  documentName: string;
  content: string;
  startChar: number;
  endChar: number;
  pageNumber?: number;
  score: number;
}

interface Document {
  _id: string;
  name: string;
  type: string;
  content?: string;
  storageId?: string;
  createdAt: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: string[];
  citations?: Citation[];
}

interface NotebookChatProps {
  documents: Document[] | undefined;
  notebookId: string;
  notebookTitle: string;
  clerkId: string;
  onCitationClick?: (citation: Citation) => void;
}

export function NotebookChat({
  documents,
  notebookId,
  notebookTitle,
  clerkId,
  onCitationClick,
}: NotebookChatProps) {
  // Fetch messages from Convex
  const dbMessages = useQuery(api.messages.getMessages, {
    notebookId: notebookId as never,
    clerkId,
  });
  const addMessage = useMutation(api.messages.addMessage);

  // Transform DB messages to include parsed citations
  const messages: Message[] = React.useMemo(() => {
    if (!dbMessages) return [];
    return dbMessages.map(
      (m: {
        _id: string;
        role: string;
        content: string;
        timestamp: number;
        sources?: string[];
        citations?: string;
      }) => ({
        id: m._id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp,
        sources: m.sources,
        citations: m.citations ? JSON.parse(m.citations) : undefined,
      }),
    );
  }, [dbMessages]);

  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedModel, setSelectedModel] =
    React.useState<ModelId>(DEFAULT_MODEL);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // Load saved model preference
  React.useEffect(() => {
    const savedModel = localStorage.getItem("docsy-model");
    if (savedModel && isValidModel(savedModel)) {
      setSelectedModel(savedModel);
    } else if (savedModel) {
      // Clear invalid saved model
      console.warn(
        `[notebook-chat] Invalid saved model "${savedModel}", resetting to default`,
      );
      localStorage.removeItem("docsy-model");
      setSelectedModel(DEFAULT_MODEL);
    }
  }, []);

  // Save model preference
  const handleModelChange = (model: ModelId) => {
    setSelectedModel(model);
    localStorage.setItem("docsy-model", model);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userContent = input.trim();
    const userTimestamp = Date.now();

    setInput("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setIsLoading(true);

    try {
      // Save user message to database
      await addMessage({
        notebookId: notebookId as never,
        clerkId,
        role: "user",
        content: userContent,
        timestamp: userTimestamp,
      });

      // Call the chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userContent }].map(
            (m) => ({
              role: m.role,
              content: m.content,
            }),
          ),
          documents: (documents || []).map((d) => ({
            id: d._id,
            name: d.name,
            content: d.content,
          })),
          notebookId,
          notebookTitle,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Chat API error:", response.status, errorData);
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = await response.json();

      // Save assistant message to database
      await addMessage({
        notebookId: notebookId as never,
        clerkId,
        role: "assistant",
        content: data.message,
        timestamp: Date.now(),
        sources: data.sources,
        citations: data.citations ? JSON.stringify(data.citations) : undefined,
      });
    } catch (error) {
      console.error("Chat error:", error);
      // Save error message to database
      await addMessage({
        notebookId: notebookId as never,
        clerkId,
        role: "assistant",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedQuestions = [
    "Summarize the main points",
    "What are the key takeaways?",
    "Explain the main concepts",
    "Compare the different sources",
  ];

  const hasDocuments = documents && documents.length > 0;

  // Helper function to render text with clickable citations
  const renderWithCitations = (text: string, citations?: Citation[]) => {
    if (!citations || citations.length === 0) {
      return text;
    }

    // Replace [1], [2], etc. with clickable spans
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const regex = /\[(\d+)\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the citation
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      const citationNum = parseInt(match[1], 10);
      const citation = citations.find((c) => c.id === citationNum);

      if (citation && onCitationClick) {
        parts.push(
          <CitationTooltip
            key={`citation-${match.index}`}
            citationNumber={citationNum}
            documentName={citation.documentName}
            content={citation.content}
            pageNumber={citation.pageNumber}
            score={citation.score}
            onClick={() => onCitationClick(citation)}
          />,
        );
      } else {
        parts.push(
          <span
            key={`citation-${match.index}`}
            className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 text-xs font-medium bg-muted text-muted-foreground rounded"
          >
            {citationNum}
          </span>,
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <h2 className="font-semibold">Chat</h2>
        <div className="flex items-center gap-2">
          <ModelSelector value={selectedModel} onChange={handleModelChange} />
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-8">
            {!hasDocuments ? (
              <>
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-8 text-muted-foreground"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium">
                  Add a source to get started
                </h3>
                <p className="mt-2 text-center text-sm text-muted-foreground max-w-sm">
                  Upload PDFs, documents, or text files to start chatting with
                  your content.
                </p>
              </>
            ) : (
              <>
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-8 text-primary"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-medium">
                  Ask anything about your sources
                </h3>
                <p className="mt-2 text-center text-sm text-muted-foreground max-w-sm">
                  I can help you summarize, find information, compare documents,
                  and answer questions.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestedQuestions.map((question) => (
                    <Button
                      key={question}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setInput(question);
                        inputRef.current?.focus();
                      }}
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
              >
                {message.role === "assistant" && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 text-primary"
                    >
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                  </div>
                )}
                <div
                  className={`max-w-[80%] ${message.role === "user" ? "order-first" : ""}`}
                >
                  <div
                    className={`rounded-2xl px-4 py-2.5 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted cursor-grab active:cursor-grabbing"
                    }`}
                    draggable={message.role === "assistant"}
                    onDragStart={(e) => {
                      if (message.role === "assistant") {
                        e.dataTransfer.setData("text/plain", message.content);
                        e.dataTransfer.setData(
                          "application/docsy-chat",
                          "true",
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }
                    }}
                    title={
                      message.role === "assistant"
                        ? "Drag to add to your document"
                        : undefined
                    }
                  >
                    {message.role === "assistant" ? (
                      <div className="text-sm dark:prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent max-w-none break-words">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0">
                                {React.Children.map(children, (child) => {
                                  if (typeof child === "string") {
                                    return renderWithCitations(
                                      child,
                                      message.citations,
                                    );
                                  }
                                  return child;
                                })}
                              </p>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc pl-4 mb-2 last:mb-0">
                                {children}
                              </ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal pl-4 mb-2 last:mb-0">
                                {children}
                              </ol>
                            ),
                            li: ({ children }) => (
                              <li className="mb-1 last:mb-0">
                                {React.Children.map(children, (child) => {
                                  if (typeof child === "string") {
                                    return renderWithCitations(
                                      child,
                                      message.citations,
                                    );
                                  }
                                  return child;
                                })}
                              </li>
                            ),
                            h1: ({ children }) => (
                              <h1 className="text-lg font-bold mb-2">
                                {children}
                              </h1>
                            ),
                            h2: ({ children }) => (
                              <h2 className="text-base font-bold mb-2">
                                {children}
                              </h2>
                            ),
                            h3: ({ children }) => (
                              <h3 className="text-sm font-bold mb-2">
                                {children}
                              </h3>
                            ),
                            strong: ({ children }) => (
                              <strong>
                                {React.Children.map(children, (child) => {
                                  if (typeof child === "string") {
                                    return renderWithCitations(
                                      child,
                                      message.citations,
                                    );
                                  }
                                  return child;
                                })}
                              </strong>
                            ),
                            em: ({ children }) => (
                              <em>
                                {React.Children.map(children, (child) => {
                                  if (typeof child === "string") {
                                    return renderWithCitations(
                                      child,
                                      message.citations,
                                    );
                                  }
                                  return child;
                                })}
                              </em>
                            ),
                            code: ({
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              node,
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              className,
                              children,
                              ...props
                            }) => {
                              const match = /language-(\w+)/.exec(
                                className || "",
                              );
                              const isInline =
                                !match && !String(children).includes("\n");
                              return isInline ? (
                                <code
                                  className="bg-muted-foreground/20 px-1 py-0.5 rounded font-mono text-xs"
                                  {...props}
                                >
                                  {children}
                                </code>
                              ) : (
                                <code
                                  className="block bg-muted-foreground/10 p-2 rounded-lg font-mono text-xs overflow-x-auto my-2"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                            pre: ({ children }) => (
                              <pre className="m-0 bg-transparent">
                                {children}
                              </pre>
                            ),
                            table: ({ children }) => (
                              <div className="my-2 w-full overflow-y-auto rounded-lg border border-border">
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
                              <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                                {children}
                              </tr>
                            ),
                            th: ({ children }) => (
                              <th className="border-r border-border px-4 py-2 text-left font-medium last:border-0">
                                {React.Children.map(children, (child) => {
                                  if (typeof child === "string") {
                                    return renderWithCitations(
                                      child,
                                      message.citations,
                                    );
                                  }
                                  return child;
                                })}
                              </th>
                            ),
                            td: ({ children }) => (
                              <td className="border-r border-border px-4 py-2 text-left last:border-0 align-top">
                                {React.Children.map(children, (child) => {
                                  if (typeof child === "string") {
                                    return renderWithCitations(
                                      child,
                                      message.citations,
                                    );
                                  }
                                  return child;
                                })}
                              </td>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </p>
                    )}
                  </div>
                  {/* Show citations if available, otherwise fall back to sources */}
                  {message.citations && message.citations.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.citations.map((citation) => (
                        <button
                          key={citation.id}
                          onClick={() => onCitationClick?.(citation)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 hover:bg-primary/20 px-2.5 py-1 text-xs transition-colors cursor-pointer group"
                          title={`Click to view source passage${citation.pageNumber ? ` (Page ${citation.pageNumber})` : ""}`}
                        >
                          <span className="flex items-center justify-center size-4 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                            {citation.id}
                          </span>
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[150px]">
                            {citation.documentName}
                          </span>
                          {citation.pageNumber && (
                            <span className="text-muted-foreground/60 text-[10px]">
                              p.{citation.pageNumber}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : message.sources && message.sources.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {message.sources.map((source, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-3"
                          >
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14,2 14,8 20,8" />
                          </svg>
                          {source}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {message.role === "user" && (
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 text-primary"
                  >
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                </div>
                <div className="rounded-2xl bg-muted px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <div
                      className="size-2 rounded-full bg-muted-foreground/40 animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="size-2 rounded-full bg-muted-foreground/40 animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="size-2 rounded-full bg-muted-foreground/40 animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border/40 p-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                hasDocuments
                  ? "Ask a question..."
                  : "Upload a source to get started"
              }
              disabled={!hasDocuments || isLoading}
              rows={1}
              className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              style={{ maxHeight: "200px" }}
            />
            <div className="flex items-center gap-2 pb-1.5">
              <span className="text-xs text-muted-foreground">
                {documents?.length ?? 0} sources
              </span>
              <Button
                type="submit"
                size="icon"
                className="size-8 rounded-full"
                disabled={!input.trim() || isLoading || !hasDocuments}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-4"
                >
                  <path d="m5 12 7-7 7 7" />
                  <path d="M12 19V5" />
                </svg>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
