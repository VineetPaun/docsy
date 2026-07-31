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

CI (`.github/workflows/ci.yml`) runs `tsc --noEmit`, `eslint` and `bun test` on push and PR — not `next build`, which needs a real Clerk key.

`bun test` runs the five test files that exist (`lib/qdrant.test.ts` — page-number attribution; `lib/file-type.test.ts` — magic-byte sniffing; `lib/rate-limit.test.ts` — fixed-window maths; `lib/embeddings.test.ts` — retry predicate; `lib/openrouter.test.ts` — model catalogue filter). There is **no broader suite**, so passing tests are never evidence a feature works end-to-end.

## ⚠️ Read before writing code

These are the traps that cause agents to do the wrong thing here.

**1. Convex auth: never take a user id as an argument.** Identity comes from the verified Clerk JWT, via the helpers in `convex/lib/auth.ts` — `getUser(ctx)` in queries (returns null when anonymous), `requireUser(ctx)` in mutations (throws), plus `requireOwnedNotebook` / `requireOwnedDocument` for ownership. Convex functions are public HTTP endpoints, so a client-supplied `clerkId` lets any caller be any user; that was this repo's worst bug and it is fixed — don't reintroduce it.

⚠️ **The whole thing hangs on `CLERK_JWT_ISSUER_DOMAIN` being set on the *Convex deployment*** (`bunx convex env set …`, not `.env.local`). Missing → `ctx.auth.getUserIdentity()` is null for every request → every query returns empty and every mutation throws `Unauthenticated`. If the app looks logged-out while Clerk clearly has a session, check that first. `AUDIT.md` §3.1.

**2. Missing env vars fail quietly, in different ways.** `/api/chat`, `/api/web-search` and `/api/research` now return **503 naming the variable** — the fabricated "demo" responses are gone. The rest still degrade silently: no `ELEVENLABS_API_KEY` gives a script with no audio, and no Qdrant/embeddings key means retrieval returns nothing and chat answers from raw document text with no citations (`AUDIT.md` §4.6). Copy `.env.example` → `.env.local`; it lists every var and what breaks without it. `AUDIT.md` §0.5 records where each one is read.

**3. `proxy.ts` is the middleware.** Next 16 renamed `middleware.ts` → `proxy.ts`. Don't create `middleware.ts`; it won't run. It now protects every route except the landing page and the Clerk auth pages, and returns a JSON 401 (not a redirect) for `/api/*`.

**4. `convex/_generated/` is generated output.** Committed, but never hand-edit. If `api.*` types look wrong, run `bunx convex dev` to regenerate.

**5. `canvasContent` / `canvasHtml` are dead but not safely deletable.** The canvas editor was removed in `4d9decb`; the fields survive in `convex/schema.ts` and `updateNotebook`. Removing them is *not* a one-liner — dropping a field from the Convex schema fails the push if any existing row still has it set, so it needs a data migration first.

**5b. Every API route must authenticate — and authorize.** New routes start with `requireApiAuth()` from `lib/api-auth.ts`. A session only proves the caller is *some* user, so any route handed a `notebookId` / `documentId` from the request also calls `requireNotebookOwner()` / `requireDocumentOwner()` from `lib/convex-server.ts`. Those fail **closed** — they need a Clerk JWT template named `convex`, and without it every guarded route 403s. They also read Convex, so a caller must delete vectors *before* the Convex row, never after (see `app/notebook/[id]/page.tsx`). A route that spends money (LLM, TTS, web search) also calls `enforceRateLimit()` from `lib/rate-limit.ts` before the first paid call — and the budget name is all the caller passes; the numbers stay server-side in `convex/users.ts`, because an argument-supplied window is one a caller can reset. Also: any route that fetches a user-supplied URL goes through `safeFetchText()` / `assertPublicUrl()` from `lib/url-guard.ts`. Never call bare `fetch()` on a URL that came from a request body. If one route calls another server-to-server, forward the caller's `cookie` header (see `/api/research`) or the inner call 401s silently.

**5c. A new file in `convex/` won't typecheck until codegen runs.** `convex/_generated/api.d.ts` lists modules explicitly, so `internal.myNewModule.foo` is a type error until `bunx convex dev` regenerates it — and codegen needs a configured deployment. Adding an export to an *existing* module works immediately. `convex/http.ts` is exempt (it is found by convention, not through `api`). This is why `purgeVectors` lives in `convex/documents.ts` rather than its own `cleanup.ts`.

**5c-2. No hyphens in `convex/` filenames.** Convex rejects the whole push, not just the file: `InvalidConfig: lib/rate-limit-window.js is not a valid path to a Convex module`. Path components allow only alphanumerics, underscores and periods, so `convex/` uses camelCase (`rateLimitWindow.ts`) while `lib/` outside it stays kebab-case. Renaming does *not* break `bun test` — the test imports the path directly, not through `api`.

**5d. Uploads are typed by their bytes.** `lib/file-type.ts` `sniffFileType()` decides; `file.type` is browser-supplied and ignored. **Every** upload path — including plain text, which the browser could read locally — must go through `/api/process-document`, because that route is where the sniff happens. Adding a client-side shortcut to "save a round trip" reopens the hole. Both dropzones (`sources-panel.tsx`, `landing/document-dropzone.tsx`) carry near-duplicate copies of `extractTextFromFile`; fix bugs in both.

**5e. Four env vars live on the Convex deployment, not in `.env.local`.** `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_WEBHOOK_SECRET`, `QDRANT_URL`, `QDRANT_API_KEY` (`bunx convex env set …`). Each fails silently and differently — `AUDIT.md` §3.1 has the symptom table. The two that bite hardest: no registered Clerk webhook → **no `users` row is ever created, so every mutation throws "User not provisioned"**; no `QDRANT_URL` on Convex → deletes look fine but vectors survive and deleted docs return as ghost citations.

**6. `convex/` is fully typed now — keep it that way.** The `/* eslint-disable no-explicit-any */` headers and `ctx: any, args: any` annotations are gone; Convex infers both from the `args:` validators. Don't reintroduce `any` to silence an error.

**7. Formatting is inconsistent** (no Prettier installed — some files use trailing commas, some don't). Match the file you're editing. Don't reformat whole files; it buries real changes in diff noise.

## Layout

```
app/
  api/                  9 route handlers — all require a Clerk session; search,
                        embeddings, chat and audio-overview also verify
                        notebook/document ownership via lib/convex-server.ts.
                        models/ serves the live OpenRouter catalogue to the picker
  dashboard/            notebook list
  notebook/[id]/        main app: sources panel (left) + chat (right)
  sign-in|sign-up|...   Clerk auth pages
components/
  ui/                   shadcn primitives — add via `bunx shadcn@latest add`,
                        never hand-write; build all new UI on top of these
                        (tabs.tsx: note Radix's Tabs root ships
                        `data-horizontal:flex-col`, which out-specifies a plain
                        `md:flex-row` — see the notebook page for the override)
  landing/              marketing page sections
  sources-panel.tsx     1211 lines; owns upload, web search, URL import, audio
  notebook-chat.tsx     728 lines; chat + citations + model picker
convex/
  auth.config.ts        trusts the Clerk JWT issuer — see trap #1
  http.ts               Clerk webhook (/clerk-webhook) — the ONLY writer of
                        users rows; Svix-verified
  lib/auth.ts           getUser / requireUser / requireOwned* — use these,
                        never a user id from args
  lib/cascade.ts        purgeDocument / purgeNotebook — every delete path goes
                        through here, or something gets orphaned
  lib/rateLimitWindow.ts    pure window decision, tested from lib/rate-limit.test.ts
                        (camelCase: Convex rejects hyphens in module paths)
  *.ts                  schema + queries/mutations
lib/
  api-auth.ts           requireApiAuth() — the 401 guard every route calls
  rate-limit.ts         enforceRateLimit() — 429 guard on the paid routes;
                        budgets live in convex/users.ts, never in the caller
  convex-server.ts      requireNotebookOwner / requireDocumentOwner — the 403
                        guard for any route handed an id from the request body
  url-guard.ts          SSRF-safe fetch for user-supplied URLs
  file-type.ts          sniffFileType() — magic bytes decide an upload's type;
                        file.type is never trusted
  mock-data.ts          dashboard placeholders when Convex isn't configured
  openrouter.ts         catalogue fetched from OpenRouter (1h cache) + chat call.
                        resolveModel() is the server-side gate on which model a
                        request may use — never trust a body-supplied slug
  embeddings.ts         Gemini embeddings (@google/genai, gemini-embedding-001
                        at 768 dims, retried on 429). Changing the model or the
                        dimensionality means bumping the Qdrant collection
                        version in BOTH lib/qdrant.ts and convex/documents.ts
  qdrant.ts             vector store + chunking
```

**Data lives in three places:** Convex (metadata + extracted text), Qdrant (vectors), Convex storage (raw files). Deletion is cascaded for you — `convex/lib/cascade.ts` (`purgeDocument` / `purgeNotebook`) covers all three plus messages and audio overviews. **Never delete a document or notebook row directly; call the cascade helper.** Vectors go via a scheduled `internal.documents.purgeVectors` action, because Convex mutations have no network access.

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

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
