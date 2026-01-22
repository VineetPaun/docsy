"use client";

import * as React from "react";
import {
  OPENROUTER_MODELS,
  DEFAULT_MODEL,
  PROVIDERS,
  getModelsByProvider,
  type ModelId,
  type Provider,
} from "@/lib/openrouter";

// Provider Icons as SVG components
const ProviderIcons: Record<Provider, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" className="size-5">
      <defs>
        <linearGradient id="gemini-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gemini-grad)"
        d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
      />
    </svg>
  ),
  meta: (
    <svg viewBox="0 0 24 24" className="size-5">
      <path
        fill="#0668E1"
        d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a4.892 4.892 0 0 0 1.12 2.037c.5.49 1.127.731 1.881.731.895 0 1.603-.39 2.181-1.018.529-.574.943-1.334 1.273-2.163.376-.946 1.07-2.347 1.819-3.643.39-.676.788-1.319 1.186-1.86.334-.453.677-.843 1.03-1.136.317-.263.626-.443.924-.516a.86.86 0 0 1 .209-.026c.268 0 .505.087.707.243.233.18.418.438.573.77.195.417.317.913.386 1.47.069.556.101 1.127.101 1.699 0 1.283-.143 2.47-.39 3.437-.244.966-.59 1.735-1.019 2.267-.418.517-.889.768-1.432.768-.377 0-.712-.14-1.019-.397-.283-.237-.518-.547-.718-.914a.23.23 0 0 0-.203-.119.234.234 0 0 0-.157.061.226.226 0 0 0-.073.152c0 .03.006.06.018.088.223.51.504.937.864 1.268.382.352.845.535 1.391.535.618 0 1.17-.187 1.65-.544.5-.373.908-.897 1.22-1.541.324-.67.561-1.458.71-2.35.148-.893.222-1.86.222-2.892 0-.706-.044-1.381-.131-2.016-.087-.634-.228-1.196-.42-1.677-.21-.524-.488-.942-.834-1.258-.377-.344-.846-.522-1.389-.522-.306 0-.589.047-.85.141-.259.094-.506.233-.742.416-.313.243-.613.543-.9.9-.288.357-.569.766-.843 1.227-.76 1.277-1.475 2.724-1.912 3.818-.33.826-.688 1.51-1.07 2.023-.346.463-.713.784-1.097.97-.35.17-.715.26-1.092.26-.484 0-.893-.18-1.216-.531a3.237 3.237 0 0 1-.731-1.437 8.202 8.202 0 0 1-.195-1.895c0-2.291.593-4.69 1.624-6.51.993-1.754 2.338-2.89 3.846-2.89.573 0 1.078.133 1.508.39.436.261.784.629 1.04 1.094.263.477.432 1.033.514 1.652.081.618.122 1.276.122 1.963 0 .477-.017.955-.05 1.428a.228.228 0 0 0 .067.174.233.233 0 0 0 .164.068.236.236 0 0 0 .17-.065.224.224 0 0 0 .073-.165c.041-.537.062-1.078.062-1.62 0-.769-.049-1.504-.146-2.193-.098-.69-.267-1.302-.507-1.827-.26-.57-.617-1.023-1.065-1.358-.491-.366-1.109-.557-1.833-.557z"
      />
    </svg>
  ),
  openai: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#10A37F">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08-4.778 2.758a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  ),
  anthropic: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#D4A574">
      <path d="M17.304 3.541h-3.672l6.696 16.918h3.672l-6.696-16.918zm-10.608 0L0 20.459h3.744l1.32-3.456h6.336l1.32 3.456h3.744L9.768 3.541h-3.072zm.456 10.8l2.232-5.832 2.232 5.832H7.152z" />
    </svg>
  ),
  mistral: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#FF7000">
      <rect x="2" y="2" width="4" height="4" />
      <rect x="10" y="2" width="4" height="4" />
      <rect x="18" y="2" width="4" height="4" />
      <rect x="2" y="10" width="4" height="4" />
      <rect x="6" y="10" width="4" height="4" />
      <rect x="10" y="10" width="4" height="4" />
      <rect x="14" y="10" width="4" height="4" />
      <rect x="18" y="10" width="4" height="4" />
      <rect x="2" y="18" width="4" height="4" />
      <rect x="18" y="18" width="4" height="4" />
    </svg>
  ),
  qwen: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#615EFF">
      <circle cx="12" cy="12" r="10" fillOpacity="0.2" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="12"
        fontWeight="bold"
        fill="#615EFF"
      >
        Q
      </text>
    </svg>
  ),
  deepseek: (
    <svg viewBox="0 0 24 24" className="size-5">
      <circle cx="12" cy="12" r="10" fill="#4D6BFE" fillOpacity="0.15" />
      <path
        d="M7 12.5C7 9.5 9.5 7 12.5 7c1.5 0 2.8.6 3.8 1.5"
        stroke="#4D6BFE"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M17 11.5c0 3-2.5 5.5-5.5 5.5-1.5 0-2.8-.6-3.8-1.5"
        stroke="#4D6BFE"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="16" cy="8" r="1.5" fill="#4D6BFE" />
      <circle cx="8" cy="16" r="1.5" fill="#4D6BFE" />
    </svg>
  ),
  nvidia: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#76B900">
      <path d="M8.948 8.798v-1.43c.162-.008.33-.016.498-.016 2.48 0 4.558 1.722 5.093 4.01.065-.002.128-.01.193-.01 1.37 0 2.498 1.03 2.65 2.357h2.618v-8.71H4v8.71h2.748c.067-.534.232-1.038.49-1.49a3.98 3.98 0 0 1 1.71-1.42zM8.948 15.5v1.503c-.168.01-.336.018-.505.018-2.458 0-4.522-1.69-5.082-3.95-.07.002-.14.008-.21.008-1.378 0-2.51-1.038-2.658-2.375H0v8.296h20v-8.296h-2.69c-.068.536-.234 1.04-.493 1.494a3.974 3.974 0 0 1-1.71 1.422 3.95 3.95 0 0 1-.496.183v-1.62a2.69 2.69 0 0 0 .24-1.084c0-1.483-1.2-2.688-2.683-2.688-.06 0-.12.008-.18.013-.44-1.87-2.12-3.263-4.13-3.263-.233 0-.46.023-.685.06v1.417c.203-.025.408-.04.617-.04 1.67 0 3.08 1.106 3.543 2.625a2.65 2.65 0 0 1 .72-.102c1.483 0 2.687 1.2 2.687 2.687 0 .164-.02.323-.048.48-.205.03-.41.048-.62.048-1.672 0-3.082-1.103-3.547-2.62a2.69 2.69 0 0 1-.718.1c-.06 0-.12-.007-.178-.012v4.995z" />
    </svg>
  ),
  moonshot: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#FFD700">
      <path d="M12 2a10 10 0 0 0-7.35 16.76 8 8 0 0 1 14.7 0A10 10 0 0 0 12 2z" />
      <circle cx="12" cy="12" r="4" fill="#FFD700" fillOpacity="0.5" />
    </svg>
  ),
  nous: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#9333EA">
      <circle cx="12" cy="12" r="10" fillOpacity="0.2" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="10"
        fontWeight="bold"
        fill="#9333EA"
      >
        N
      </text>
    </svg>
  ),
  other: (
    <svg viewBox="0 0 24 24" className="size-5" fill="#6B7280">
      <circle cx="12" cy="12" r="10" fillOpacity="0.2" />
      <circle cx="8" cy="12" r="1.5" fill="#6B7280" />
      <circle cx="12" cy="12" r="1.5" fill="#6B7280" />
      <circle cx="16" cy="12" r="1.5" fill="#6B7280" />
    </svg>
  ),
};

interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedProvider, setSelectedProvider] =
    React.useState<Provider | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const selectedModel =
    OPENROUTER_MODELS[value] || OPENROUTER_MODELS[DEFAULT_MODEL];
  const modelsByProvider = React.useMemo(() => getModelsByProvider(), []);

  // Get providers that have models
  const availableProviders = React.useMemo(() => {
    return (Object.keys(modelsByProvider) as Provider[]).filter(
      (p) => modelsByProvider[p].length > 0,
    );
  }, [modelsByProvider]);

  // Filter models based on selected provider and search
  const filteredModels = React.useMemo(() => {
    let models = selectedProvider
      ? modelsByProvider[selectedProvider]
      : Object.values(OPENROUTER_MODELS);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query),
      );
    }

    return models;
  }, [selectedProvider, searchQuery, modelsByProvider]);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatContext = (ctx: number) => {
    if (ctx >= 1000000) return `${(ctx / 1000000).toFixed(1)}M`;
    return `${Math.round(ctx / 1000)}K`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {ProviderIcons[selectedModel.provider]}
        </span>
        <span className="max-w-[120px] truncate">{selectedModel.name}</span>
        {selectedModel.tier === "free" && (
          <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
            FREE
          </span>
        )}
        {selectedModel.tier === "premium" && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            PRO
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 flex max-h-[420px] min-w-[400px] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {/* Provider Sidebar */}
          <div className="flex w-12 flex-col border-r border-border bg-muted/30 py-2">
            <button
              onClick={() => setSelectedProvider(null)}
              className={`mx-1.5 mb-1 flex size-9 items-center justify-center rounded-lg transition-colors ${
                selectedProvider === null
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted text-muted-foreground"
              }`}
              title="All models"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </button>
            {availableProviders.map((provider) => (
              <button
                key={provider}
                onClick={() => setSelectedProvider(provider)}
                className={`mx-1.5 mb-1 flex size-9 items-center justify-center rounded-lg transition-colors ${
                  selectedProvider === provider
                    ? "bg-primary/10 ring-2 ring-primary/30"
                    : "hover:bg-muted"
                }`}
                title={PROVIDERS[provider].name}
              >
                {ProviderIcons[provider]}
              </button>
            ))}
          </div>

          {/* Model List */}
          <div className="flex flex-1 flex-col">
            {/* Search */}
            <div className="border-b border-border p-2">
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Header */}
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
              {selectedProvider
                ? PROVIDERS[selectedProvider].name
                : "All Models"}{" "}
              ({filteredModels.length})
            </div>

            {/* Models */}
            <div className="flex-1 overflow-y-auto px-1 pb-2">
              {filteredModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onChange(model.id as ModelId);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    value === model.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="size-5 shrink-0">
                    {ProviderIcons[model.provider]}
                  </span>
                  <div className="flex flex-1 flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{model.name}</span>
                      {model.tier === "free" ? (
                        <span className="shrink-0 rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                          FREE
                        </span>
                      ) : (
                        <span className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          PRO
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatContext(model.contextLength)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">
                      {model.description}
                    </span>
                  </div>
                  {value === model.id && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="size-4 shrink-0 text-primary"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
              {filteredModels.length === 0 && (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No models found
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground">
                Powered by OpenRouter. Free models have usage limits.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
