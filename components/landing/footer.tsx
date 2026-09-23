import Link from "next/link";

/**
 * The landing footer.
 *
 * Deliberately small. It used to carry four columns — Product, Company, Legal
 * — of which eight of the ten links pointed at routes that do not exist
 * (`/pricing`, `/blog`, `/careers`, `/privacy`…). A footer full of 404s reads
 * as a template nobody finished, so it now lists only the two section anchors
 * the landing page actually has, plus the repository.
 *
 * Add a column back the day the page behind it exists, not before.
 */
const footerLinks = [
  { name: "Features", href: "#features" },
  { name: "How it works", href: "#how-it-works" },
];

const REPO_URL = "https://github.com/VineetPaun/docsy";

export function Footer() {
  return (
    <footer className="border-t border-border/40">
      <div className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        {/* Brand and links sit side by side once there is room for both, and
            stack on a phone. With three links there is no case for a grid. */}
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-foreground">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5 text-background"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14,2 14,8 20,8" />
                  <path d="M8 13h2" />
                  <path d="M8 17h2" />
                  <path d="M14 13h2" />
                  <path d="M14 17h2" />
                </svg>
              </div>
              <span className="text-xl font-semibold tracking-tight">
                docsy
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              Chat with your documents using AI. Upload, ask, and get instant
              answers.
            </p>
          </div>

          {/* Labelled, because the navbar is a nav landmark too and a screen
              reader otherwise announces two indistinguishable ones. */}
          <nav aria-label="Footer">
            <ul className="flex flex-col gap-3 sm:items-end">
              {footerLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Source
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Docsy. All rights reserved.
          </p>
          {/* One icon, because there is one real destination. The Twitter link
              it sat beside pointed at twitter.com's own homepage. */}
          <Link
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View this project on GitHub (opens in a new tab)"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-5"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </Link>
        </div>
      </div>
    </footer>
  );
}
