/**
 * Per-type icon for a source row.
 *
 * Split out of the 1,200-line panel (AUDIT.md §6.2). Kept as inline SVG rather
 * than moved to `@hugeicons`: these are file-format marks tinted per type, and
 * the icon set has no equivalents for "webpage" and "YouTube" that read the same
 * way at 16px.
 */

const TYPE_COLORS: Record<string, string> = {
  pdf: "text-red-500",
  docx: "text-blue-500",
  doc: "text-blue-500",
  txt: "text-gray-500",
  md: "text-gray-500",
  url: "text-green-500",
  youtube: "text-red-600",
};

interface SourceIconProps {
  type: string;
  size?: "sm" | "md";
}

export function SourceIcon({ type, size = "sm" }: SourceIconProps) {
  const sizeClass = size === "sm" ? "size-4" : "size-5";
  const normalised = type.toLowerCase();
  const color = TYPE_COLORS[normalised] ?? "text-muted-foreground";

  const shared = {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: `${sizeClass} ${color}`,
    "aria-hidden": true,
  };

  if (normalised === "youtube") {
    return (
      <svg {...shared}>
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <path d="m10 15 5-3-5-3z" />
      </svg>
    );
  }

  if (normalised === "url") {
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14,2 14,8 20,8" />
    </svg>
  );
}
