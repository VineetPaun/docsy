"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--muted))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--muted))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
      </div>

      <div className="container mx-auto max-w-6xl px-4 py-24 sm:py-32 lg:py-40">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-green-500" />
            </span>
            Now in public beta
          </div>

          {/* Headline */}
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            Chat with your{" "}
            <span className="bg-gradient-to-r from-foreground via-foreground/80 to-foreground/60 bg-clip-text text-transparent">
              documents
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Drop your PDFs, docs, and text files. Ask questions. Get instant
            answers powered by AI. Your personal research assistant.
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Button size="lg" asChild className="h-12 px-8 text-base">
              <Link href="/signup">
                Get Started Free
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-2 size-4"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="h-12 px-8 text-base"
            >
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>

          {/* Animated Document Visual */}
          <div className="relative mt-16 w-full max-w-3xl sm:mt-20">
            <div className="relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-xl border border-border/50 bg-gradient-to-b from-muted/50 to-muted shadow-2xl">
              {/* Chat interface mockup */}
              <div className="absolute inset-0 p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-border/50 pb-4">
                  <div className="flex gap-1.5">
                    <div className="size-3 rounded-full bg-red-500/80" />
                    <div className="size-3 rounded-full bg-yellow-500/80" />
                    <div className="size-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="ml-4 h-4 w-32 rounded bg-muted-foreground/20" />
                </div>

                {/* Content area */}
                <div className="mt-4 flex gap-4">
                  {/* Documents sidebar */}
                  <div className="hidden w-1/4 flex-col gap-2 sm:flex">
                    {/* Animated floating documents */}
                    <div className="animate-float-slow rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded bg-red-500/10">
                          <span className="text-xs font-medium text-red-500">
                            PDF
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="h-2 w-16 rounded bg-muted-foreground/30" />
                          <div className="mt-1 h-1.5 w-10 rounded bg-muted-foreground/20" />
                        </div>
                      </div>
                    </div>
                    <div
                      className="animate-float-medium rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur-sm"
                      style={{ animationDelay: "0.5s" }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded bg-blue-500/10">
                          <span className="text-xs font-medium text-blue-500">
                            DOC
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="h-2 w-14 rounded bg-muted-foreground/30" />
                          <div className="mt-1 h-1.5 w-8 rounded bg-muted-foreground/20" />
                        </div>
                      </div>
                    </div>
                    <div
                      className="animate-float-slow rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm backdrop-blur-sm"
                      style={{ animationDelay: "1s" }}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded bg-gray-500/10">
                          <span className="text-xs font-medium text-gray-500">
                            TXT
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="h-2 w-12 rounded bg-muted-foreground/30" />
                          <div className="mt-1 h-1.5 w-6 rounded bg-muted-foreground/20" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Chat area */}
                  <div className="flex flex-1 flex-col gap-3">
                    {/* User message */}
                    <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-foreground px-4 py-2 text-background">
                      <p className="text-sm">
                        What are the key findings from the research paper?
                      </p>
                    </div>

                    {/* AI response */}
                    <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-border/50 bg-background/80 px-4 py-2 backdrop-blur-sm">
                      <p className="text-sm text-muted-foreground">
                        Based on the uploaded documents, here are the key
                        findings:
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="h-2 w-full rounded bg-muted-foreground/20" />
                        <div className="h-2 w-4/5 rounded bg-muted-foreground/20" />
                        <div className="h-2 w-3/5 rounded bg-muted-foreground/20" />
                      </div>
                    </div>

                    {/* Typing indicator */}
                    <div className="flex gap-1 px-4 py-2">
                      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/40" />
                      <span
                        className="size-2 animate-bounce rounded-full bg-muted-foreground/40"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <span
                        className="size-2 animate-bounce rounded-full bg-muted-foreground/40"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Gradient overlay */}
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
            </div>

            {/* Decorative elements */}
            <div className="absolute -left-4 top-1/4 size-24 rounded-full bg-gradient-to-r from-primary/20 to-transparent blur-2xl" />
            <div className="absolute -right-4 top-1/3 size-32 rounded-full bg-gradient-to-l from-primary/10 to-transparent blur-2xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
