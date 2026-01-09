import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="border-t border-border/40 bg-muted/30">
      <div className="container mx-auto max-w-6xl px-4 py-24 sm:py-32">
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-background p-8 sm:p-12 lg:p-16">
          {/* Background gradient */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-br from-muted/50 via-transparent to-muted/50" />
            <div className="absolute -left-20 -top-20 size-60 rounded-full bg-foreground/5 blur-3xl" />
            <div className="absolute -bottom-20 -right-20 size-60 rounded-full bg-foreground/5 blur-3xl" />
          </div>

          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to chat with your documents?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Join thousands of researchers, students, and professionals who
              save hours every week with Docsy.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" asChild className="h-12 px-8 text-base">
                <Link href="/sign-up">
                  Start for free
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
              <p className="text-sm text-muted-foreground">
                No credit card required
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
