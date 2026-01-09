const steps = [
  {
    number: "01",
    title: "Upload your documents",
    description:
      "Drag and drop your PDFs, Word docs, text files, or any other documents you want to analyze.",
    visual: (
      <div className="relative flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5 text-muted-foreground"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">
            Drop files here or click to browse
          </p>
        </div>
        {/* Floating document badges */}
        <div className="absolute -right-2 -top-2 rotate-6 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium shadow-sm">
          .pdf
        </div>
        <div className="absolute -bottom-2 -left-2 -rotate-6 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium shadow-sm">
          .docx
        </div>
      </div>
    ),
  },
  {
    number: "02",
    title: "Ask anything",
    description:
      "Type your questions naturally, just like you would ask a colleague. No special syntax needed.",
    visual: (
      <div className="flex h-48 flex-col justify-center gap-3 rounded-lg border border-border bg-background p-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-sm text-muted-foreground">
            What&apos;s the main conclusion?
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-sm text-muted-foreground">
            Summarize chapter 3
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-sm text-muted-foreground">
            Compare findings across docs
          </span>
        </div>
      </div>
    ),
  },
  {
    number: "03",
    title: "Get instant answers",
    description:
      "Receive accurate, sourced responses with references to the exact location in your documents.",
    visual: (
      <div className="flex h-48 flex-col justify-center rounded-lg border border-border bg-background p-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">
              AI
            </div>
            <div className="space-y-2">
              <p className="text-sm">
                Based on your documents, the main conclusion is that...
              </p>
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  Source: Report.pdf, p.12
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-border/40">
      <div className="container mx-auto max-w-6xl px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Three simple steps to unlock the knowledge in your documents
          </p>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-3 lg:gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Connector line for desktop */}
              {index < steps.length - 1 && (
                <div className="absolute left-full top-1/4 hidden h-px w-8 bg-border lg:block" />
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-4xl font-bold text-muted-foreground/30">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
                <div className="pt-2">{step.visual}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
