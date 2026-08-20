import { auth } from "@clerk/nextjs/server";
import { NotebookWorkspace } from "@/components/notebook/notebook-workspace";

/**
 * Server shell for a notebook (AUDIT.md §6.7).
 *
 * The page used to be a Client Component that checked `if (!user)` during
 * render, so the HTML and the JS shipped before the check ran — a loading flash,
 * and a gate that lived in the browser. `auth.protect()` runs first and
 * redirects an anonymous request to sign-in.
 *
 * Ownership is still enforced where it matters: every Convex query resolves the
 * caller from the Clerk token, so a notebook id belonging to someone else
 * returns null rather than data (AUDIT.md §3.1).
 */
export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await auth.protect();

  const { id } = await params;

  return <NotebookWorkspace notebookId={id} />;
}
