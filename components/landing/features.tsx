import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6"
      >
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14,2 14,8 20,8" />
      </svg>
    ),
    title: "Multi-format support",
    description:
      "Upload PDFs, Word docs, text files, markdown, and more. We handle all the heavy lifting.",
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6"
      >
        <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
        <path d="M12 2a10 10 0 0 1 10 10" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    title: "AI-powered answers",
    description:
      "Get accurate, contextual responses pulled directly from your documents using advanced AI.",
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    ),
    title: "Instant responses",
    description:
      "No more scrolling through pages. Ask a question and get answers in seconds.",
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-6"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Private & secure",
    description:
      "Your documents stay yours. We use encryption and never share your data with third parties.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border/40 bg-muted/30">
      <div className="container mx-auto max-w-6xl px-4 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to understand your documents
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Stop wasting hours reading through documents. Let AI do the heavy
            lifting while you focus on what matters.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="group relative overflow-hidden border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:border-border hover:shadow-lg"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/50 text-foreground transition-colors group-hover:border-foreground/20 group-hover:bg-foreground/5">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
