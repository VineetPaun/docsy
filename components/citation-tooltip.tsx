"use client";

import * as React from "react";

export interface CitationTooltipProps {
  citationNumber: number;
  documentName: string;
  content: string;
  pageNumber?: number;
  score?: number;
  onClick: () => void;
  children?: React.ReactNode;
}

export function CitationTooltip({
  citationNumber,
  documentName,
  content,
  pageNumber,
  onClick,
}: CitationTooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [position, setPosition] = React.useState<"top" | "bottom">("top");
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Truncate content for preview
  const truncatedContent = React.useMemo(() => {
    if (content.length <= 200) return content;
    return content.slice(0, 200).trim() + "...";
  }, [content]);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      // Calculate position based on available space
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        setPosition(
          spaceAbove > spaceBelow && spaceAbove > 200 ? "top" : "bottom",
        );
      }
      setIsVisible(true);
    }, 300); // Small delay to prevent accidental triggers
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 mx-0.5 text-xs font-medium bg-primary/20 hover:bg-primary/30 text-primary rounded transition-colors cursor-pointer"
        title={`From "${documentName}"${pageNumber ? ` (Page ${pageNumber})` : ""} - Click to view source`}
      >
        {citationNumber}
      </button>

      {/* Tooltip */}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`absolute z-50 w-72 max-w-sm p-3 bg-popover border border-border rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200 ${
            position === "top"
              ? "bottom-full mb-2 origin-bottom"
              : "top-full mt-2 origin-top"
          }`}
          style={{ left: "50%", transform: "translateX(-50%)" }}
          onMouseEnter={() => setIsVisible(true)}
          onMouseLeave={handleMouseLeave}
        >
          {/* Arrow */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-border rotate-45 ${
              position === "top"
                ? "bottom-[-5px] border-b border-r"
                : "top-[-5px] border-t border-l"
            }`}
          />

          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-xs font-medium shrink-0">
              {citationNumber}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{documentName}</p>
              {pageNumber && (
                <p className="text-xs text-muted-foreground">
                  Page {pageNumber}
                </p>
              )}
            </div>
          </div>

          {/* Content Preview */}
          <div className="relative">
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
              &ldquo;{truncatedContent}&rdquo;
            </p>
          </div>

          {/* Footer */}
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-xs text-primary font-medium flex items-center gap-1">
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
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Click to view in document
            </p>
          </div>
        </div>
      )}
    </span>
  );
}
