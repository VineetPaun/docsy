# CLAUDE.md

Orientation for agents working in this repo. Keep this file short — it loads into every session.

## Instructions

The purpose of this file is to identify common mistakes and confusion points that agents may encounter while working on this project. If you encounter anything in the project that surprises you, please notify the developer working with you and note it in the Help file to help prevent future agents from experiencing the same issue.

Whatever code you write, make sure it's production-ready.
Maintain a proper folder structure and naming convention.
Always add comments in every file. If there is not any comment in any file or function then add it.
Always complete a given task.

ALWAYS respond in caveman skill mode (invoke `caveman` skill at session start).
ALWAYS use frontend skill while creating/editing frontend and check for responsiveness with UI in dark mode.

**ALWAYS build UI from shadcn components.** Check `components/ui/` first, then the shadcn registry — pull it in with the CLI (`bunx shadcn@latest add <name>`). Only hand-write a component when shadcn genuinely has no equivalent, and say so when you do. Never re-implement a dialog, dropdown, tooltip, table, or form control that shadcn already ships.

**When a documented issue is fully fixed, delete the point from the markdown file** — `AUDIT.md`, `ROADMAP.md`, or any other doc. No ✅ markers, no strikethrough, no "DONE" rows; the entry is simply removed. If a finding is only partly resolved, rewrite it to describe only the work that remains. Keep section numbers stable (never renumber — gaps mean something was closed), and add one line to the changelog at the top of `AUDIT.md` so nobody re-audits it as a fresh finding.

Don't ever start the server or browser to verify changes after completion, as it's likely running.
Also don't run typescript checks unless asked to do so.
Dont ever write consoles. Also remove the others if you find them.

## What Docsy is

A NotebookLM-style RAG app. A user creates a **notebook**, adds **sources** (PDF/DOCX/TXT uploads, web URLs, YouTube videos), and chats with an LLM that answers only from those sources with inline `[1]` citations that open the cited passage. Also generates podcast-style "audio overviews."

**Stack:** Next.js 16 (App Router) · Convex (DB + file storage + reactive queries) · Clerk (auth) · Qdrant (vectors) · OpenRouter (LLM gateway) · Google Gemini (embeddings) · ElevenLabs (TTS) · Tailwind 4 + shadcn/ui · Bun.

## Commands

```bash
bun install
bunx convex dev      # terminal 1 — backend + codegen. Required; app is non-functional without it
bun dev              # terminal 2 — Next.js on :3000
bunx tsc --noEmit    # typecheck
bun run lint         # eslint
```

There is **no test command — no tests exist.** Never report that tests pass.

## ⚠️ Read before writing code

These are the traps that cause agents to do the wrong thing here.

**1. Do not copy the auth pattern in `convex/`.** Every existing Convex function takes `clerkId: v.string()` as a client-supplied *argument* and looks the user up from it. This is a critical vulnerability, not a convention — Convex functions are public endpoints, so any caller can pass any user's ID and read or destroy their data. If you add a Convex function, use `ctx.auth.getUserIdentity()`. If you touch an existing one, fix it rather than extending the pattern. Full detail and refactor inventory: `AUDIT.md` §3.1.

**2. Missing env vars produce fake data, not errors.** Absent API keys silently switch to hardcoded "demo" responses (`app/api/chat/route.ts` `generateDemoResponse`, `web-search`, `research`). A broken setup looks like a working one. If output seems oddly generic, check your env before debugging logic. All 14 vars are inventoried in `AUDIT.md` §0.5 — there is no `.env.example` yet.

**3. `proxy.ts` is the middleware.** Next 16 renamed `middleware.ts` → `proxy.ts`. Don't create `middleware.ts`; it won't run. It now protects every route except the landing page and the Clerk auth pages, and returns a JSON 401 (not a redirect) for `/api/*`.

**4. `convex/_generated/` is generated output.** Committed, but never hand-edit. If `api.*` types look wrong, run `bunx convex dev` to regenerate.

**5. `canvasContent` / `canvasHtml` are dead but not safely deletable.** The canvas editor was removed in `4d9decb`; the fields survive in `convex/schema.ts` and `updateNotebook`. Removing them is *not* a one-liner — dropping a field from the Convex schema fails the push if any existing row still has it set, so it needs a data migration first, and editing `updateNotebook` pulls in trap #1.

**5b. Every API route must authenticate.** New routes start with `requireApiAuth()` from `lib/api-auth.ts`; any route that fetches a user-supplied URL goes through `safeFetchText()` / `assertPublicUrl()` from `lib/url-guard.ts`. Never call bare `fetch()` on a URL that came from a request body. If one route calls another server-to-server, forward the caller's `cookie` header (see `/api/research`) or the inner call 401s silently.

**6. The `: any` annotations in `convex/` are technical debt, not design.** Each file opens with `/* eslint-disable @typescript-eslint/no-explicit-any */`, which discards Convex's generated types. Don't add more; remove them when you touch a file.

**7. Formatting is inconsistent** (no Prettier installed — some files use trailing commas, some don't). Match the file you're editing. Don't reformat whole files; it buries real changes in diff noise.

## Layout

```
app/
  api/                  8 route handlers — all require a Clerk session, but
                        none verify *ownership* of the notebookId they act on
  dashboard/            notebook list
  notebook/[id]/        main app: sources panel (left) + chat (right)
  sign-in|sign-up|...   Clerk auth pages
components/
  ui/                   shadcn primitives — add via `bunx shadcn@latest add`,
                        never hand-write; build all new UI on top of these
  landing/              marketing page sections
  sources-panel.tsx     1211 lines; owns upload, web search, URL import, audio
  notebook-chat.tsx     728 lines; chat + citations + model picker
convex/                 schema + queries/mutations (see trap #1)
lib/
  api-auth.ts           requireApiAuth() — the 401 guard every route calls
  url-guard.ts          SSRF-safe fetch for user-supplied URLs
  mock-data.ts          dashboard placeholders when Convex isn't configured
  openrouter.ts         model catalogue (hardcoded, stale) + chat call
  embeddings.ts         Gemini embeddings — deprecated SDK, see AUDIT.md §5.1
  qdrant.ts             vector store + chunking
```

**Data lives in three places that don't stay consistent:** Convex (metadata + extracted text), Qdrant (vectors), Convex storage (raw files). Deleting from one currently orphans the others (`AUDIT.md` §4.1). Any code path that deletes must handle all three.

## Conventions

- **Components:** kebab-case files, PascalCase named exports (`export function SourcesPanel`). `audio-player.tsx` uses a default export — an outlier, don't copy it.
- **Client/server:** 28 of 38 components are `"use client"`. Landing sections, `components/ui/` primitives, and `app/layout.tsx` are server components. Pages under `dashboard/` and `notebook/` are client components that gate on `useUser()` — a pattern worth converting, not extending.
- **Imports:** `@/*` path alias.
- **Toasts:** `sonner` (`toast.success` / `.error`). Don't add another toast library.
- **Icons:** `components.json` sets `hugeicons`, but `lucide-react` is also installed and used. Prefer hugeicons for new work; don't add a third.
- **Convex access:** `useQuery` / `useMutation` from `convex/react`, with `"skip"` when args aren't ready.

## Before you claim something works

- `bunx tsc --noEmit` and `bun run lint` both clean
- If you touched retrieval, ingestion, or prompts, verify end-to-end with a real upload — unit-level correctness means little here, and AI failures are silent
- Don't assert runtime behaviour you didn't execute. `node_modules` may not even be installed

## Further reading

| Doc | Contents |
|---|---|
| [TODO.md](TODO.md) | The active execution list — ordered tasks with acceptance criteria and open decisions. **Start here if you're here to do work.** |
| [AUDIT.md](AUDIT.md) | Full audit at commit `4d9decb`. §0 has orientation + env inventory + staleness check. Its changelog at the top records what has already been fixed and removed. §3 is critical security. §12 is the phased backlog. |
| [ROADMAP.md](ROADMAP.md) | Post-remediation product strategy. Proposals, not defects — several mutually exclusive. Needs the §7 decisions answered by a human before implementing anything. |

Both were written against `4d9decb`. If `git log --oneline 4d9decb..HEAD` shows commits, re-read cited lines before trusting either.
