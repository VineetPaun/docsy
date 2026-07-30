# Docsy — Codebase Audit & Improvement Report

**Date:** 2026-07-27
**Repo:** `docsy` (branch `main`, 18 commits, first commit 2026-01-09)
**Audited at commit:** `4d9decbbf14c13627ac78ceb8e768f576d90ba93` (`4d9decb`)
**Scope:** Full read of `app/`, `components/`, `convex/`, `lib/`, `hooks/`, and all config files (~10,800 LOC of TS/TSX).

---

## How this document is maintained

**A finding that is fully fixed is deleted from this report, not annotated.** No ✅ markers, no strikethrough, no "done" rows — the finding is simply gone. If it is not written here, it is not outstanding. Partially fixed findings stay, rewritten to describe only the work that remains.

Section numbers are **never renumbered**, so gaps in the sequence are expected and mean a finding was closed. Anything else in the repo that cites a section number keeps working.

### Changelog

Bare record of what has been removed, so nobody re-audits it as a fresh finding. Detail lives in the code, not here.

| Date | Removed | Landed in |
|---|---|---|
| 2026-07-27 | §3.2 — all 9 API routes unauthenticated | `proxy.ts`, `lib/api-auth.ts`, all 8 handlers; `/api/debug` deleted |
| 2026-07-27 | §3.3 — SSRF in `/api/process-url` | `lib/url-guard.ts` |
| 2026-07-27 | §5.4 — 11 unused packages | `package.json`, `bun.lock` |
| 2026-07-27 | §5.5 — 2 dead components | `chat-interface.tsx`, `document-upload.tsx` deleted |
| 2026-07-27 | §5.2 — `pdf-parse@1.1.1` abandoned | `pdf-parse@2.4.5`: real types, modern pdf.js, `@ts-expect-error` gone. Unblocks §4.9 |
| 2026-07-28 | §4.8 — citation offsets drifted from stored text | `lib/qdrant.ts` — offsets recorded after trim, `endChar` clamped |
| 2026-07-28 | §5.8 — `tsconfig` targeted ES2017 | `tsconfig.json` → `ES2022` |
| 2026-07-28 | §6.3 — ~95 `console.*` in production paths | 0 remain across `app/`, `components/`, `lib/`, `convex/` |
| 2026-07-28 | §6.4 — dead/broken code in live files | fake `handleReprocessDocument` + its button, commented blocks, unused `chunkText()`; `hooks/use-convex-status.tsx` → `lib/mock-data.ts` (only `mockNotebooks` was live) |
| 2026-07-28 | §7 — no retrieval score floor | `lib/qdrant.ts` `DEFAULT_SCORE_THRESHOLD = 0.5`, applied server-side by Qdrant |
| 2026-07-28 | §8 — no `maxDuration`; sequential research searches | 4 slow routes export `maxDuration`; `/api/research` uses `Promise.allSettled` |
| 2026-07-28 | §3.1 — **total IDOR on every Convex table** | `convex/auth.config.ts`, `ConvexProviderWithClerk`, `convex/lib/auth.ts` (`getUser` / `requireUser` / `requireOwnedNotebook` / `requireOwnedDocument`); `clerkId` arg gone from all 23 functions and all 27 call sites; `generateUploadUrl` authed; `getStorageUrl` ownership-checked; `getDocumentCount` ownership-checked; duplicate `getUserByClerkId` deleted; `deleteUser` → `internalMutation`; `upsertUser` derives its id from the token. **Webhook remainder is still §3.1** |
| 2026-07-28 | §6.1 — `convex/*.ts` disabled type safety wholesale | every `eslint-disable no-explicit-any` header and `: any` in `convex/` gone; 2 `any` left repo-wide, both in `sources-panel.tsx` |
| 2026-07-29 | §3.6 — routes authenticated but never checked *ownership* | `lib/convex-server.ts` (`requireNotebookOwner` / `requireDocumentOwner`, via `ConvexHttpClient` + the caller's `convex` Clerk token); applied in `/api/search`, `POST`+`DELETE /api/embeddings`, and `/api/chat` (same hole, not originally listed). Document delete in `app/notebook/[id]/page.tsx` now purges vectors *before* the Convex row, or the new check could never pass. **Residuals below stay as §3.6** |
| 2026-07-29 | §12 Phase 0 item 6 — false "Private & secure" landing claim | `components/landing/features.tsx` — "never share your data with third parties" was untrue (sources go to Gemini/OpenRouter/ElevenLabs); now claims per-account isolation only |
| 2026-07-29 | §4.9 — page numbers never appeared | `/api/process-document` joins `result.pages` with `\f`; the rest of the chain already carried `pageNumber`. First test in the repo: `lib/qdrant.test.ts` (`bun test`). **Non-PDF sources stay page-less — that residual is still §4.9** |
| 2026-07-29 | §10 — no `.env.example` | `.env.example` with all 15 vars + degradation notes; `.gitignore` gained `!.env.example`. **The rest of §10 (env validation, CI, prettier, Sentry, README) is still open.** Note: `.gitignore` never contained the `*.md` line TODO.md warned about — docs commit normally |
| 2026-07-29 | §3.1 — user provisioning ran in the browser | `convex/http.ts` — Svix-verified Clerk webhook on `/clerk-webhook` handling `user.created` / `user.updated` / `user.deleted`; `upsertUser` → `internal upsertFromClerk`; `components/user-sync.tsx` and both `<UserSync />` renders deleted; `deleteUser` finally has a caller. **Needs `CLERK_WEBHOOK_SECRET` on the Convex deployment + endpoint registered in the Clerk Dashboard** |
| 2026-07-29 | §4.1 — deletes orphaned rows, files and vectors | `convex/lib/cascade.ts` (`purgeDocument` / `purgeNotebook`) — messages, audioOverviews, storage files and vectors all cascade; `internal.documents.purgeVectors` action deletes from Qdrant by filter. `DELETE /api/embeddings` and the client's best-effort cleanup `fetch` deleted with it. **Needs `QDRANT_URL` / `QDRANT_API_KEY` on the Convex deployment** |
| 2026-07-29 | §3.5 — file type taken from the browser; no count cap | `lib/file-type.ts` `sniffFileType()` — magic bytes decide the type, `file.type` is ignored; all uploads (text included) now go through `/api/process-document`; rejection throws instead of storing a placeholder; `MAX_DOCUMENTS_PER_NOTEBOOK = 50` enforced in `createDocument`. Covered by `lib/file-type.test.ts`. **Per-user storage quota is still open — see §3.5** |
| 2026-07-29 | §4.10 — extraction failure stored as a magic string | `/api/process-document` returns 422 with a readable reason; `"[PDF content could not be extracted...]"` is gone, and so are the `startsWith("[Failed")` guards that existed to catch it. A file whose text cannot be read is no longer stored at all |
| 2026-07-29 | §4.2 — audio overviews generated then thrown away | Route uploads the MP3 to Convex storage via `authedConvexClient()` and returns a `storageId`; `getAudioOverview` resolves it to a signed URL; `AudioPlayer`'s base64 `audioData` prop deleted. Old MP3s are now deleted on regenerate and on `deleteAudioOverview`. **Async generation is still synchronous — see §4.2** |
| 2026-07-29 | §9.1 — notebook page had zero responsive breakpoints | `app/notebook/[id]/page.tsx` — shadcn `Tabs` switch sources/chat below `md`, side by side above, both panels `forceMount` so switching keeps state; `h-screen` → `h-dvh`; header truncates; model dropdown's `min-w-[400px]` capped to the viewport; citation dialog fits a phone |
| 2026-07-29 | §10 — no CI | `.github/workflows/ci.yml` — `tsc --noEmit`, `eslint`, `bun test` on push and PR. `next build` deliberately excluded until a Clerk publishable key exists as a repo secret |
| 2026-07-30 | §3.4 — no rate limiting anywhere | `lib/rate-limit.ts` `enforceRateLimit()` on `/api/chat`, `/api/research`, `/api/audio-overview` → 429 + `Retry-After`. Counter is a Convex table (`rateLimits`) + `users.consumeRateLimit`, so no new service and **no new env var**; budgets (60/10/5 per hour) are server-side in `convex/users.ts` — an earlier shape passed `limit`/`windowMs` as args, which let a caller reset their own window. Window maths covered by `lib/rate-limit.test.ts`. Fails closed. **Limits are a guess — tune them** |
| 2026-07-30 | §4.7 — `/api/audio-overview` took its source text from the request body and never checked ownership | route calls `requireNotebookOwner()` then `notebookDocuments()`; `documents` is gone from `AudioOverviewRequest`, and the client posts a notebook id only. A notebook with nothing narratable is a 400 from the route rather than a client-side guard |
| 2026-07-30 | §4.4 — the "two-host podcast" was read by one voice | the prompt now writes a single-narrator episode; the `ALEX:`/`SAM:` label strip stays as a guard against a model that ignores it. Two voices is a feature, and belongs with §4.3 |
| 2026-07-30 | §6.6 — demo mode faked output when keys were missing | `generateDemoResponse`, `generateDemoResults` and `generateDemoReport` deleted (~300 lines); `/api/chat`, `/api/web-search` and `/api/research` return **503 naming the missing variable**. No `NEXT_PUBLIC_DEMO_MODE` flag was added — no caller read `isDemo`, so nothing wanted the mode kept |
| 2026-07-30 | §4.11 — `updateNotebook` still wrote canvas fields | `canvasContent` / `canvasHtml` args and their writes gone from `convex/notebooks.ts`. **The schema fields survive until a migration — that residual is still §4.11** |
| 2026-07-30 | §9.4 — accessibility gaps | `aria-label` on every icon-only control (send, seek, play/pause, mute, restart, download, speed, per-source delete, close, GitHub) and on the per-source checkbox; `role="status"` on the loading spinners; the landing dropzone got a keyboard path (`sr-only` file input + overlay `<label>`, `focus-within` ring) — it was `div onClick` with a `display:none` input; the audio progress bar is a keyboard slider (arrows/Home/End); the citation tooltip opens on focus and closes on Escape, with `aria-describedby`; `prefers-reduced-motion` honoured globally in `app/globals.css`; a dead unlabelled grid button deleted from the sources header. **Focus trapping and a real audit pass remain — see §9.4** |
| 2026-07-29 | §4.5 — source selection never reached retrieval · §4.7 — full document text posted per chat message | `/api/chat` takes `documentIds` instead of `documents` and loads the text itself via `notebookDocuments()` (`lib/convex-server.ts`); the selection filters both retrieval (`searchChunks({ documentIds })`) and the no-RAG fallback; `selectedDocs` lifted from `sources-panel.tsx` to `app/notebook/[id]/page.tsx` so chat can read it. Empty selection = whole notebook. **`/api/audio-overview` still takes body text — that residual is now §4.7** |

Partial progress on §3.5, §4.3, §4.6, §4.9, §5.6 and §6.5 is folded into those sections; what remains of §3.2 — the routes authenticate but never check *ownership* — is now §3.6, and is no longer blocked. **§3.1 is now only about moving user provisioning out of the browser into a Clerk webhook** — the data-exposure half is closed, pending the runtime check called out in that section.

**Verification status:** `bunx tsc --noEmit` passes and `bun run lint` is clean (0 errors, 0 warnings) as of 2026-07-28. `bun run build` compiles + typechecks but cannot *finish* here because prerendering `/_not-found` needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and no `.env` exists in this checkout — that is §10, not a code defect. **No runtime behaviour has been exercised**, so treat the §12 acceptance criteria as *not yet demonstrated*.

---

## 0. Orientation for anyone (or any agent) picking this up cold

**Read this section first.** It exists so you can act on this report without re-deriving its context.

### 0.1 What this project is

Docsy is a NotebookLM-style RAG app. A user creates a **notebook**, adds **sources** (PDF/DOCX/TXT uploads, web URLs, YouTube videos), and chats with an LLM that answers only from those sources, with inline `[1]`-style citations that open the source text at the cited passage. It also generates AI "audio overviews" (podcast-style summaries).

Stack: **Next.js 16** (App Router, `proxy.ts` not `middleware.ts`) · **Convex** (database + file storage + reactive queries) · **Clerk** (auth) · **Qdrant** (vector search) · **OpenRouter** (LLM gateway, 19 models) · **Google Gemini** (embeddings) · **ElevenLabs** (TTS) · **Tailwind 4** + shadcn/ui · **Bun** (package manager and runtime).

### 0.2 Is this report still accurate? (staleness check)

This audit describes the code **as of `4d9decb`**. Before acting on any finding, run:

```bash
git log --oneline 4d9decb..HEAD
```

- **No output** → the audit is current *apart from the changelog above*. Proceed.
- **Commits listed** → the code has moved. Every finding below carries a `file:line` reference; **re-read the cited lines before trusting the finding.** Line numbers drift first, then the findings themselves. Do not assume a fix is still needed because it's listed here, and do not assume it's been done because a commit message sounds related — verify in the code.

Note that the changelog above records changes made **on top of `4d9decb` and not yet committed** at the time of writing, so `git log` alone will not reveal them. Line numbers throughout `app/api/`, `components/sources-panel.tsx`, `lib/qdrant.ts` and `lib/openrouter.ts` are stale for that reason — prefer the symbol names this report cites over its line numbers.

### 0.3 How to get this running (`cp .env.example .env.local`)

```bash
bun install
```

`node_modules` **is** installed and dependencies are current as of 2026-07-27. `bunx tsc --noEmit` and `bun run lint` both pass, and `bun run build` compiles — but `build` cannot finish prerendering without Clerk keys, and no runtime behaviour has been exercised. To verify anything at runtime you need the full env set from §0.5.

```bash
bunx convex dev     # terminal 1 — Convex backend + codegen (writes convex/_generated/)
bun dev             # terminal 2 — Next.js on :3000
bunx tsc --noEmit   # typecheck
bun run lint        # eslint
```

⚠️ `convex/_generated/` is committed but is **generated output**. Never hand-edit it. If `api.*` references look wrong, run `bunx convex dev` to regenerate rather than editing the files.

⚠️ `bun test` runs the one test file that exists, `lib/qdrant.test.ts`. There is no broader suite (§10) — never report that "tests pass" as evidence a feature works.

### 0.4 Confidence levels — what to trust

| Marker | Meaning |
|---|---|
| *(unmarked)* | **Verified by direct code reading.** Every `file:line` reference was read. Trust these, subject to §0.2. |
| **[verify]** | **From model knowledge, not checked against a live source.** All package-version and library-capability claims. Confirm with `bun outdated` or the vendor's docs before acting. |
| "may already be broken" | An inference from dates, not an observed failure. Test it. |

Collected `[verify]` items, so you don't have to hunt: §5.1 (Google SDK deprecation timing), §5.6 (specific OpenRouter model slugs), and Qdrant multivector support in `ROADMAP.md` §2.1. §5.7 was a `[verify]` item and is now confirmed against `bun outdated`.

### 0.5 Complete environment variable inventory

The README documents 5 of these. `.env.example` now carries the full list with its degradation notes, and is the copy to keep current; the table below is the audit's record of where each is read.

| Variable | Used at | Required for | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `providers/convex-provider.tsx:7` | Everything | Ships to the client by design |
| `CONVEX_DEPLOYMENT` | Convex CLI | Deploys | Not read by app code |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk SDK (implicit) | Auth | Not in a `process.env` grep — SDK reads it |
| `CLERK_SECRET_KEY` | Clerk SDK (implicit) | Auth | Same |
| `CLERK_JWT_ISSUER_DOMAIN` | **does not exist yet** | **§3.1 fix** | You must add this for Convex↔Clerk auth |
| `OPENROUTER_API_KEY` | `lib/openrouter.ts:284`, `api/chat`, `api/research` | All chat | Without it, `/api/chat` and `/api/research` return 503 naming it |
| `GOOGLE_API_KEY` *or* `GEMINI_API_KEY` | `lib/embeddings.ts:10` | Embeddings / RAG | Either works; `GOOGLE_API_KEY` checked first |
| `QDRANT_URL` | `lib/qdrant.ts:10` | Vector search | Defaults to `http://localhost:6333` |
| `QDRANT_API_KEY` | `lib/qdrant.ts:11` | Hosted Qdrant | Optional for local |
| `ELEVENLABS_API_KEY` | `api/audio-overview/route.ts:84` | Audio overviews | Absent → script-only, no audio |
| `ELEVENLABS_VOICE_ID` | `api/audio-overview/route.ts:91` | Audio overviews | Defaults to Rachel `21m00Tcm4TlvDq8ikWAM` |
| `TAVILY_API_KEY` | `api/web-search/route.ts:28` | Web search | Tried first |
| `SERPER_API_KEY` | `api/web-search/route.ts:29` | Web search | Fallback |
| `NEXT_PUBLIC_APP_URL` | `lib/openrouter.ts` | OpenRouter attribution | Defaults to `localhost:3000` |

**Degradation behaviour worth knowing:** the three routes that used to fabricate "demo" output now 503 and name the missing variable, so a misconfigured chat, web search or research call says so. The quieter ones remain: no `ELEVENLABS_API_KEY` yields a script with no audio, and no `QDRANT_URL` / embeddings key means retrieval finds nothing and `/api/chat` answers from raw document text instead (§4.6). This is why §0.3 verification matters.

### 0.6 How to navigate this report

Findings are grouped by severity within each section: 🔴 critical · 🟠 significant · 🟡 minor. Section §12 is the **execution order** — if you are here to do work rather than to understand the codebase, start at §12 and follow the phase order. Phases are dependency-ordered; the acceptance criteria in §12 tell you when each item is genuinely done.

**If you only do one thing: confirm §3.1 actually works at runtime.** The code is in place, but until `CLERK_JWT_ISSUER_DOMAIN` is set on the Convex deployment the whole app reads as anonymous — every query empty, every mutation throwing.

---

## 1. Executive summary

Docsy is a NotebookLM-style RAG app: Next.js 16 App Router + Convex + Clerk + Qdrant + OpenRouter. The feature surface is genuinely impressive for 18 commits — notebooks, multi-format ingestion, URL/YouTube ingestion, vector RAG with citations, web search, and podcast generation all exist and work end-to-end.

The problem is that it was built fast and never hardened. At the time of the audit the entire data layer was publicly readable and writable by anyone on the internet — not a theoretical risk, an actual open door.

> **Update 2026-07-28:** that door is shut. API routes authenticate (was §3.2), SSRF is closed (was §3.3), and Convex now derives identity from the Clerk JWT instead of a client-supplied `clerkId` (§3.1). **None of it has been exercised at runtime** — see §3.1 for the one env var the whole thing hangs on. What is left is cost/abuse control and moving user provisioning to a webhook (§3.1).
>
> **Update 2026-07-29:** per-route ownership checks landed (`lib/convex-server.ts`), so a signed-in caller can no longer act on another user's `notebookId` / `documentId`; user provisioning moved to a Svix-verified Clerk webhook; deletes cascade completely; and uploads are typed by magic bytes rather than by the browser's word. **It now depends on four env vars set on the Convex deployment plus a registered webhook — see §3.1 for the failure mode of each.**
>
> **Update 2026-07-30:** per-user rate limits guard the three paid routes (was §3.4), and `/api/chat` loads sources from Convex instead of trusting the request body (was §4.5, §4.7). **What is left in Phase 0 is a storage quota (§3.5) — and still, none of it has been exercised at runtime.**
>
> **Update 2026-07-30, later:** `/api/audio-overview` closed the same hole `/api/chat` had — ownership check plus server-side source loading (was §4.7). **Demo mode is deleted**, so a missing key is a 503 that names it rather than fabricated output (was §6.6). The podcast script is single-narrator, matching the one voice that reads it (was §4.4). Accessible names, keyboard paths and `prefers-reduced-motion` landed (§9.4 now covers only focus management and an actual audit).

### Scorecard

| Area | Grade | One-line verdict |
|---|---|---|
| Feature breadth | **A−** | Ambitious and mostly delivered |
| Security | **B−** | IDOR closed, routes check ownership, rate limits in place; unproven at runtime, no storage quota |
| Data integrity | **D** | Deletes leave orphans everywhere; audio never persisted |
| Dependency health | **C** | 2 deprecated SDKs, 1 abandoned parser |
| RAG quality | **C** | Works, but naive — no reranking, no hybrid, top-5 fixed |
| Code quality | **B−** | 1200-line god component remains; `console.*` and `any` now effectively zero |
| Testing / CI | **D** | 3 unit test files + CI on push/PR; no integration or E2E coverage |
| Performance / cost | **C−** | Rate limits and bounded payloads in; still no streaming, no caching |
| Mobile / a11y | **C** | Notebook page is responsive now; dashboard is not. Accessible names, keyboard paths and reduced-motion are in; focus management and any real audit are not (§9.4) |

### The 3 things to do this week

1. **Set the four Convex-side env vars and confirm `ctx.auth.getUserIdentity()` is non-null** (§3.1). Everything below assumes this, and nothing works without it
2. **Register the Clerk webhook** — until it exists, no `users` row is ever created and new signups cannot use the app (§3.1)
3. **Replace `@google/generative-ai` + `text-embedding-004`** — deprecated, may already be dead (§5.1). Test this before anything else in Phase 1

---

## 2. Architecture as-built

```
Browser (all "use client")
   │
   ├── Clerk (@clerk/nextjs) ──── proxy.ts: clerkMiddleware(protect all non-public routes)
   │
   ├── ConvexProviderWithClerk ─── convex/*.ts  [ctx.auth via convex/auth.config.ts]
   │        └── convex/lib/auth.ts: getUser / requireUser / requireOwned*
   │        └── users, notebooks, documents, messages, audioOverviews    ← owner-scoped
   │        └── Convex file storage (raw uploads)
   │
   └── Next API routes (8, all require a Clerk session; search, embeddings,
       chat and audio-overview also verify notebook or document ownership
       via lib/convex-server.ts)
            ├── /api/chat            → Qdrant search → OpenRouter
            ├── /api/embeddings      → Gemini embed → Qdrant upsert
            ├── /api/search          → Gemini embed → Qdrant search
            ├── /api/process-document→ pdf-parse / mammoth  (10 MB cap)
            ├── /api/process-url     → cheerio + turndown (+ YouTube scrape), SSRF-guarded
            ├── /api/web-search      → Tavily / Serper
            ├── /api/research        → OpenRouter + web-search (forwards caller's cookie)
            └── /api/audio-overview  → OpenRouter + ElevenLabs
            (/api/debug deleted)
```

**Structural observation:** state lives in three places that don't know about each other — Convex (metadata + full text), Qdrant (vectors), and Convex storage (raw files). Nothing keeps them consistent. That's the root cause of most of §4.

---

## 3. Critical security issues (P0 — fix before any public traffic)

### 3.1 🔴 Auth is code-complete but never exercised

**The IDOR is closed and provisioning has moved out of the browser.** No Convex function takes a `clerkId` argument; identity comes from the verified Clerk JWT. `convex/http.ts` is now the only writer of profile fields, and `user.deleted` cascades the account away.

⚠️ **None of it has run.** Three things must be set on the *Convex deployment* — not `.env.local`, Convex functions read their own environment:

```bash
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your>.clerk.accounts.dev
bunx convex env set CLERK_WEBHOOK_SECRET whsec_...
bunx convex env set QDRANT_URL https://...      # §4.1 vector cascade
bunx convex env set QDRANT_API_KEY ...          # §4.1 vector cascade
```

Plus, in the Clerk Dashboard: a JWT template named exactly `convex` (`convex/auth.config.ts` pins `applicationID: "convex"`), and a webhook pointed at `https://<deployment>.convex.site/clerk-webhook` — note `.site`, not `.cloud` — subscribed to `user.created`, `user.updated`, `user.deleted`.

**Each has a distinct silent failure, which is why they are worth checking individually:**

| Missing | Symptom |
|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | `getUserIdentity()` null everywhere; queries return empty, mutations throw `Unauthenticated`. Looks like "logged out" |
| `convex` JWT template | Identical to the above, *plus* every `/api/search`, `/api/embeddings`, `/api/chat` call 403s — `lib/convex-server.ts` fails closed |
| Webhook not registered | No `users` row is ever created. Every mutation throws "User not provisioned". **New signups cannot use the app at all** |
| `CLERK_WEBHOOK_SECRET` | Webhook returns 500, same outcome as above |
| `QDRANT_URL` on Convex | Deletes look fine; vectors survive and deleted documents keep appearing as citations (§4.1 all over again) |

**Verify identity first** — a temporary query returning `await ctx.auth.getUserIdentity()` is the fastest check, and everything else fails the same way until it is non-null.

**Acceptance tests:**

```js
// In a browser console on any origin, with your public Convex URL:
const c = new ConvexClient("https://<your>.convex.cloud");
await c.query("notebooks:getNotebooks", { clerkId: "user_someone_else" });
// Throws — `clerkId` is no longer in the signature (ArgumentValidationError).
await c.query("notebooks:getNotebooks", {});
// Returns [] — anonymous callers see nothing, not someone else's data.
```

```bash
# An unsigned webhook POST must be rejected:
curl -X POST https://<deployment>.convex.site/clerk-webhook -d '{"type":"user.deleted","data":{"id":"user_x"}}'
# → 400 Invalid signature
```

**Known race:** a brand-new signup can reach the dashboard before the webhook lands. Queries return empty (`getUser` → null, handled everywhere) and reactive queries fill in when the row appears, but a mutation fired in that window throws "User not provisioned". Retrying works. Worth a proper loading state if it proves visible in practice.

### 3.5 🟠 No per-user storage quota

Bounded now: 10 MB per file, 20 files per drop (UX), and `MAX_DOCUMENTS_PER_NOTEBOOK = 50` enforced in `createDocument`. Type comes from `sniffFileType()` reading magic bytes, not from `file.type`.

**What remains:** nothing caps a user's *total* storage, and nothing caps notebooks per user. 50 sources × unlimited notebooks is still unbounded paid storage. A `getNotebookCount` check in `createNotebook` plus a summed-bytes column would close it; both need a product decision on the actual limits first.

⚠️ The sniffer is the only type check, so `/api/process-document` is now load-bearing for *every* upload including plain text — both dropzones route through it. Do not add a client-side shortcut that reads a file locally to "save a round trip"; that reopens the hole.

### 3.6 🟡 Residuals from the Phase 0 route fixes

- **DNS rebinding is not covered.** `lib/url-guard.ts` resolves the hostname, checks the addresses, then calls `fetch`, which resolves again. A host that answers public on the first lookup and private on the second still gets through. Closing it needs a custom HTTP agent that pins the validated IP. Documented in that file's header.
- **`/api/research` calls `/api/web-search` server-to-server** and forwards the caller's `cookie` / `authorization` headers to do it. If you refactor either route, keep that forwarding — without it the inner call 401s and research silently returns zero sources.

---

## 4. Correctness & data-integrity bugs

### 4.1 🟠 Vector cascade depends on Convex env, and is not retried

Cascade deletion is complete and server-side: `convex/lib/cascade.ts` is the single path for documents, notebooks and accounts, covering rows, messages, audio overviews, storage files and vectors.

**Two operational residuals:**

- **`QDRANT_URL` must be set on the Convex deployment** or `purgeVectors` throws and vectors survive — the ghost-citation bug returns, with no client fallback any more (the best-effort `fetch` was deleted deliberately: "never rely on the client to clean up"). The throw is visible in the Convex logs and nowhere else.
- **A failed purge is not retried.** `scheduler.runAfter` fires once; if Qdrant is down at that moment the vectors are orphaned permanently and nothing notices. A `vectorPurgeQueue` table with a cron sweep would make it durable — worth it only once there is real data to lose.

### 4.2 🟡 Audio generation is still synchronous

Audio now persists: the route uploads the MP3 to Convex storage and returns a `storageId`, `getAudioOverview` hands back a signed URL, and the ~4 MB base64 response body — at or over **Vercel's 4.5 MB limit** — is gone. Refreshing keeps the audio.

**What remains:** the request still blocks for the whole 30–60s of script generation plus TTS, so `maxDuration = 300` is load-bearing and a slow ElevenLabs call leaves the user on a spinner with no progress. The `status` field is already modelled for the async version (`pending` / `generating_script` / `synthesizing` / `ready` / `failed`) but only ever holds `generating` → `ready` / `script_only` / `error`.

**Fix:** create the row as `pending`, run generation in a Convex action, let the live query drive the UI. Pairs naturally with §4.3 (chunking the script across several TTS calls), which makes the wait longer still.

### 4.3 🟠 ElevenLabs truncates the script at 5,000 chars

`synthesizeWithElevenLabs` still cuts narration at `TTS_CHAR_LIMIT` (5,000). A `"long"` script targets 1,500–2,000 words ≈ 9,000–12,000 chars, so **more than half the podcast is still cut**. The response no longer lies about it — `estimatedDuration` is now measured over the narrated portion only, and `audio.truncated` flags the cut — but the audio itself is incomplete.

**Fix:** chunk the script and concatenate the audio segments, or use the ElevenLabs long-form endpoint. ⚠️ **Do §4.2 first.** Full-length audio at ElevenLabs' default bitrate is several MB; base64'd into the JSON body it blows straight past Vercel's 4.5 MB response limit. Lifting the truncation before audio moves to Convex storage turns a partial feature into a broken one.

### 4.6 🟠 Full-document fallback still stuffs the prompt

The overflow itself is closed: `/api/chat` now trims history to the last 20 messages / 24k chars (`trimHistory`) and caps the no-RAG fallback at `MAX_FALLBACK_CONTEXT_CHARS` (30k), so neither can grow without bound. The client still posts its whole history, but the server no longer forwards it.

What remains is the fallback's *existence*. When retrieval returns nothing — no vectors yet, or nothing cleared the score floor — the route silently swaps in raw document text instead of admitting RAG found nothing. That masks a dead embedding pipeline (§5.1) as a working one, and the answers it produces carry no citations.

**Fix:** delete the fallback and say "not in your sources" instead. Do it once §5.1 is confirmed working — until then it is the only thing keeping chat usable on a deployment with no Qdrant.

### 4.9 🟡 Page numbers: PDFs only

Page numbers now work for PDF uploads — `/api/process-document` joins `result.pages` with `\f` and the existing form-feed detection in `chunkTextWithPositions` does the rest (covered by `lib/qdrant.test.ts`).

**What remains:** every other ingestion path still produces page-less text, which is correct for DOCX/TXT/URL/YouTube but means `pageNumber` is `undefined` there — the UI degrades silently, which is fine. Only revisit if DOCX page attribution is ever wanted; it has no page concept in the extracted stream.

### 4.10 🟡 A scanned PDF is rejected, not kept for later

Failed extraction is now a 422 with a reason ("looks scanned or image-based", "save it as .docx", "no readable text"), surfaced per file in the upload UI. Nothing unreadable reaches Convex or the LLM.

**The deliberate trade-off:** the file is rejected outright rather than stored with `status: "failed"`. Fewer moving parts and better immediate feedback, but a scanned PDF cannot be kept and retried later — which is what OCR support (§11 Tier 3) would want. Revisit together with the per-source status UI in §9.6; doing it now would mean a schema field, a badge and a retry action for a feature that does not exist yet.

### 4.11 🟡 Dead canvas fields survive in the schema

Nothing writes them any more — `updateNotebook` no longer accepts `canvasContent` / `canvasHtml`. `schema.ts:24-26` still defines all three (`canvasLastEditedAt` too), because dropping a field from a Convex schema fails the push while any row still carries a value.

**Fix:** a one-off migration that patches the field out of every `notebooks` row, then delete the definitions. Not worth doing until something else needs the schema touched.

---

## 5. Deprecated, outdated, and dead dependencies

### 5.1 🔴 `@google/generative-ai` is deprecated **[verify]**

Google retired the legacy `@google/generative-ai` JS SDK in favour of **`@google/genai`**; the old package stopped receiving support in 2025. You use it in `lib/embeddings.ts` for all embedding generation. Note that `0.24.1` **is** the latest published version — updating dependencies does not help here; only the package swap below does.

Worse: the model is **`text-embedding-004`** (`lib/embeddings.ts:3`), a legacy embedding model superseded by **`gemini-embedding-001`**. Google scheduled the legacy embedding endpoints for shutdown around **January 2026** — given today is July 2026, **your embedding pipeline may already be returning errors**. Test this first; if embeddings are silently failing, every upload since then has produced zero vectors and RAG has been quietly falling back to full-document stuffing.

```bash
bun remove @google/generative-ai && bun add @google/genai
```

```ts
// lib/embeddings.ts
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey });
const res = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: texts,                        // native batching — drop the manual loop
  config: { outputDimensionality: 768 },  // keeps your existing Qdrant collection valid
});
```

⚠️ If you change dimensionality, you must recreate the `docsy_documents` collection and re-embed everything. `outputDimensionality: 768` avoids that. Also note `EMBEDDING_DIMENSION` is hardcoded — plan a migration path (versioned collection names, e.g. `docsy_documents_v2`).

Also: `generateEmbeddings` batches 10 at a time but has **no retry and no backoff**. One 429 from Gemini fails the whole document. Add `p-retry` or a simple exponential backoff.

### 5.3 🟠 Two overlapping UI primitive libraries

`@base-ui/react` **and** `radix-ui` are both dependencies. Base UI is the successor project from the same team; `components.json` says `"style": "radix-lyra"`. You're shipping two component runtimes. Pick one and migrate `components/ui/*` (7 files — small). Same story for icons: **`lucide-react` + `@hugeicons/react` + `@hugeicons/core-free-icons`** are all installed; `components.json` sets `iconLibrary: hugeicons`. Pick one.

### 5.6 🟠 The model catalogue is ~18 months stale

`lib/openrouter.ts` is headed *"Updated: January 2026"*. Every entry is now old:

| In your catalogue | Problem |
|---|---|
| `google/gemini-2.0-flash-exp:free` — **your `DEFAULT_MODEL`** | `-exp` preview slugs are routinely retired by OpenRouter. A dead default breaks chat for every user who never opens the model picker. |
| `anthropic/claude-3.5-sonnet` | Two+ generations behind (Claude 5 family is current) |
| `openai/gpt-4o-mini` | Superseded |
| `meta-llama/llama-3.1-405b-instruct:free` | Free tier for 405B has been unreliable/removed |
| `mistralai/devstral-2512:free`, `nvidia/nemotron-3-nano-30b-a3b:free` | **[verify]** — check these slugs still resolve |

Hardcoding a model catalogue guarantees this rots. **Fix it structurally:** fetch `GET https://openrouter.ai/api/v1/models` at build time or on an hourly ISR cache, filter to `:free` + a curated premium allowlist, and derive the picker from that. Keep a small hardcoded fallback list for when the fetch fails. Then a stale catalogue becomes impossible.

(`/api/chat`'s direct OpenAI / Anthropic fallback branches are gone, along with the `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` vars they read — OpenRouter already fronts every provider.)

### 5.7 🟠 Three packages are held one major behind, each blocked

Every other dependency is on latest as of 2026-07-27. These three are deliberately pinned back — **do not bump them casually, each fails for a concrete reason:**

| Package | Pinned | Latest | Why it is held |
|---|---|---|---|
| `@clerk/nextjs` | `^6.39.6` | `7.6.1` | v7 removes the `SignedIn` / `SignedOut` components and replaces `useSignIn` / `useSignUp` with a signals API. 23 type errors across 8 files, ~1,140 lines of hand-rolled auth UI (`sign-in`, `sign-up`, `sign-up/verify`, `forgot-password`, `reset-password`, `sso-callback`, `landing/cta.tsx`, `landing/navbar.tsx`). A real migration, and one that cannot be verified without Clerk keys and a running app. |
| `eslint` | `^9.39.5` | `10.8.0` | Blocked upstream. `eslint-config-next@16.2.12` depends on `typescript-eslint@^8`, which peer-requires `eslint ^8.57 \|\| ^9`. On ESLint 10 the lint run dies with `TypeError: Class extends value undefined`. Unblocks when Next ships a config built on `typescript-eslint@9`. |
| `typescript` | `^5.9.3` | `7.0.2` | The project itself **compiles clean under TS 7**, but the same `typescript-eslint@8` peer-caps TypeScript at `<6.0.0`, and lint dies with `TypeError: Cannot read properties of undefined (reading 'Cjs')`. Same unblock condition as ESLint. |

Recheck with `bun outdated`. The two toolchain rows share one blocker, so they will likely clear together.

---

## 6. Code quality

### 6.2 🔴 `sources-panel.tsx` is a 1,200-line god component

One component owns: drag-and-drop upload, PDF/DOCX extraction orchestration, web search UI + results, URL/YouTube ingestion, audio overview generation, document selection, delete confirmation dialogs, and document preview. It holds **13 `useState` hooks**.

Split into:
```
components/sources/
  sources-panel.tsx        // layout + composition only
  source-list.tsx
  source-upload-dropzone.tsx
  web-search-panel.tsx
  url-import-panel.tsx
  audio-overview-panel.tsx
  hooks/use-document-upload.ts   // upload → extract → store → embed pipeline
  hooks/use-audio-overview.ts
```

`notebook-chat.tsx` (734 lines) and `dashboard/page.tsx` (408 lines) need the same treatment, less urgently.

### 6.5 🟠 No shared error handling

Each route hand-rolls its try/catch and invents its own error shape (`{error}` vs `{success:false, error}` vs `{success:true, results}`). No route leaks raw internal error text any more, but there is still no single wrapper enforcing that.

Standardize on one `withApiHandler` wrapper and one error envelope: generic messages to clients, details to logs only. The auth guard is already shared — see `lib/api-auth.ts` for the pattern to follow. One deliberate exception to keep: `/api/process-url` surfaces `BlockedUrlError` with its reason and a 400, because that error is *about* the caller's input.

### 6.7 🟡 Client-side-only auth gating

`app/notebook/[id]/page.tsx:169` and `dashboard/page.tsx` are `"use client"` and check `if (!user)` in render. The page HTML/JS ships before that check runs. Now that the middleware protects these routes this stops mattering for security, but converting the shells to Server Components with `auth.protect()` also removes a loading flash and cuts bundle size.

---

## 7. RAG quality

The pipeline is `fixed-size chunk → single embedding → top-5 cosine → stuff into prompt`. That's the 2023 baseline. Concretely, what's missing:

| Gap | Impact | Fix |
|---|---|---|
| **No reranking** | Top-5 by cosine includes near-misses; precision suffers most on multi-doc notebooks | Retrieve 20, rerank to 5 with Cohere Rerank 3 or a hosted `bge-reranker-v2` |
| **No hybrid search** | Pure-dense misses exact terms, product names, IDs, acronyms | Qdrant supports sparse vectors natively — add BM25/SPLADE and fuse with RRF |
| **No query transformation** | "what about the second one?" embeds as garbage | Rewrite the query using conversation history before embedding; add HyDE for sparse notebooks |
| **Fixed `limit: 5`** | Hardcoded in `chat/route.ts` regardless of question complexity or model context | Scale `k` to the model's context window |
| **Naive chunking** | `chunkSize: 1000` chars, char-based, splits mid-table and mid-code-block | Structure-aware splitting (markdown headings, PDF paragraph blocks) + token-based sizing |
| **No parent-document retrieval** | Model sees a 1000-char window with no surrounding context | Embed small chunks, return the enclosing section |
| **No multi-query** | Single embedding, single recall shot | Generate 3 query variants, union + RRF |
| **Citation ↔ answer not verified** | Model can emit `[7]` when only 5 sources exist; nothing checks | Post-process: validate every `[n]` against the citation array; strip or flag invalid ones |

The score floor is in (`DEFAULT_SCORE_THRESHOLD = 0.5`, enforced by Qdrant). **Highest ROI from here, in order:** reranking (biggest single quality jump) → hybrid search → query rewriting.

Add a small **eval harness** (20–30 Q/A pairs over a fixed corpus, scored on retrieval hit-rate and answer faithfulness) before making any of these changes, or you'll have no idea whether they helped.

---

## 8. Performance & cost

| Issue | Where | Fix |
|---|---|---|
| **No streaming** | `/api/chat` awaits the full completion, then returns JSON. On a free 70B model that's 10–40s of blank screen. | Stream with the Vercel AI SDK (`streamText` + `useChat`). Biggest perceived-performance win available. |
| **4 MB base64 audio response** | `audio-overview/route.ts` | See §4.2 — return a storage ID. |
| **Sequential document uploads** | `sources-panel.tsx` `handleFiles` — a `for` loop awaiting extract→upload→embed per file | Parallelize with a concurrency limit (3–4); show per-file progress. |
| **`.collect()` everywhere + JS sort** | `notebooks.ts:22`, `documents.ts:27`, `messages.ts:27`, etc. — loads every row then sorts in memory | Add sorted indexes (`by_notebook_timestamp`) and use `.order("desc").take(n)`. Chat history will be the first to hurt. |
| **No caching** | Identical questions re-embed and re-infer every time | Cache embeddings by content hash; add OpenRouter prompt caching for the system prompt. |
| **Convex 1 MB document limit** | Docs store up to 50k chars of `content` inline — fine now, but a hard ceiling | Move full text to Convex storage / R2; keep only metadata + a snippet in the row. |

---

## 9. UX and accessibility

### 9.1 🟡 Mobile layout works; the dashboard has not been checked

The notebook page is responsive: shadcn `Tabs` switch between sources and chat below `md`, side by side above, with both panels `forceMount`ed so switching does not discard a half-typed question. `h-dvh` throughout for the iOS Safari toolbar. The model dropdown, the header and the citation dialog all fit a 375px viewport.

**Not verified in a browser** — this was built by reading, not by looking. Check the tab switch, the composer with the keyboard open, and the model dropdown on a real phone.

**Still open:** `app/dashboard/page.tsx` (408 lines) has not been through the same pass, and `document-preview.tsx` reflows but its long text column is untuned for a narrow screen.

### 9.2 🟠 No optimistic UI

`handleSubmit` (`notebook-chat.tsx:145`) awaits the Convex `addMessage` round-trip before the user's own message appears. Their text vanishes from the input and nothing shows for ~200ms. Use Convex optimistic updates.

### 9.3 🟠 No resizable panels

The 40/60 split is fixed with a hard `max-w-[480px]`. Users reading a document alongside chat will want to drag. `react-resizable-panels` + persist to `localStorage`.

### 9.4 🟠 Accessibility: names and keyboard paths are in, focus management is not

Every icon-only control has an accessible name, both dropzones have a keyboard path, spinners announce, the audio scrubber and the citation tooltip work without a mouse, and `prefers-reduced-motion` is honoured globally (`app/globals.css`, with `.animate-spin` deliberately exempt).

**What remains:**

- **`document-preview.tsx` traps nothing.** It is a hand-rolled overlay with `role="dialog"` / `aria-modal` and its own Escape and backdrop handlers; focus stays behind it and is not restored on close. Replacing it with `components/ui/dialog.tsx` fixes that *and* deletes both handlers — the right fix, and larger than a label.
- **Nothing has been run through `axe`**, and none of this was checked with a screen reader or by tabbing the app in a browser. The fixes were written by reading.

### 9.5 🟡 Errors surface as raw strings

Chat failures get written into the conversation as `"Sorry, I encountered an error: <raw message>"` (`notebook-chat.tsx:196`) — and persisted to the database, so they pollute history forever. Show a transient toast + inline retry button instead of writing errors to the messages table.

### 9.6 🟡 Missing basics

No empty states for a notebook with zero sources beyond the dropzone; no per-source processing status (a doc that failed extraction looks identical to a good one); no way to rename a document; no search/filter over sources; no way to see *why* a source has no content.

---

## 10. Missing engineering infrastructure

| Missing | Recommendation |
|---|---|
| **Tests** (2 files) | `lib/qdrant.test.ts` (page-number attribution) and `lib/file-type.test.ts` (magic-byte sniffing) run under `bun test` — no runner config needed, so no Vitest dependency is warranted. Extend to the remaining `lib/` pure functions (chunk offsets, model validation). Playwright for the upload → chat → citation flow. |
| **CI** | `.github/workflows/ci.yml` runs `tsc --noEmit`, `eslint` and `bun test` on push and PR. **`next build` is not in it** — prerendering `/_not-found` needs a real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; add it as a repo secret and a build step once one exists. |
| **`prettier`** | Not installed; formatting drifts (`lib/openrouter.ts` uses trailing commas, `lib/qdrant.ts` doesn't). Add + `--check` in CI. |
| **Env validation** | Add `@t3-oss/env-nextjs` + zod so a missing key fails at boot, not at 2am in a route handler. |
| **Error tracking** | Sentry — you currently have zero visibility into production failures. |
| **LLM observability** | Helicone or Langfuse — you have no idea what models cost, which fail, or what latency users see. Critical for a multi-model app. |
| **Webhook replay/idempotency** | `convex/http.ts` handles Clerk retries safely today (upsert + delete are both idempotent), but nothing records `svix-id`, so a replayed *old* event can overwrite a newer profile. Store seen ids with a TTL if profile drift shows up. |
| **`CONTRIBUTING.md` / `CLAUDE.md`** | Conventions for a repo that will be worked on by agents and humans. |
| **Dependabot / Renovate** | This report exists because nothing watched dependencies for 6 months. Automate it. |
| **`SECURITY.md`** | Public repo (there's a GitHub link in the navbar) with no disclosure path. |

Also: the README claims **"20+ top-tier AI models"** — the catalogue has 19, several of which are probably dead slugs (§5.6). And it doesn't mention Qdrant, Gemini embeddings, ElevenLabs, or Tavily/Serper at all, despite all four being required for the advertised features.

---

## 11. Feature roadmap

### Tier 1 — completes what's already half-built

| Feature | Why | Effort |
|---|---|---|
| **Streaming responses** | Removes the worst UX wart; standard expectation | M |
| **Persist audio overviews** | Feature currently loses its output (§4.2) | M |
| **Full-length TTS, optionally two-voice** | The "audio overview" pitch, actually delivered. The narration is single-voice and coherent now; what is missing is the other half of a long script (§4.3) | M |
| **Real PDF viewer for citations** | You render `content.slice()` as plain text; show the actual PDF page with a highlight overlay (`react-pdf`) | M |
| **Notes / saved answers** | The removed canvas left Tiptap in `package.json` — either bring it back as "Notes" (pin AI answers, edit, export) or delete the deps. Pick one. | M |
| **Document processing status** | Per-source `pending / processing / ready / failed` with a retry action. The fake "Reprocess Document" button is gone; there is now nothing at all for a source that failed extraction | S |

### Tier 2 — NotebookLM parity

| Feature | Notes |
|---|---|
| **Study guide / FAQ / timeline / briefing doc** | One-click generation from sources. Cheap to build (prompt + storage), high perceived value. |
| **Mind map** | Extract entities + relations → render with React Flow. Very demo-able. |
| **Flashcards & quizzes** | Spaced repetition over notebook content — turns Docsy into a study tool, a distinct market from "chat with PDF". |
| **Notebook sharing** | Public read-only share links; then invite-based collaboration (Convex makes multiplayer nearly free). |
| **Inline source-grounded editing** | Ask a follow-up about a specific highlighted passage. |
| **Suggested follow-up questions** | Generate 3 after each answer. ~20 lines, meaningfully improves engagement. |

### Tier 3 — differentiation

| Feature | Notes |
|---|---|
| **Agentic RAG** | Tool-calling loop: `search_documents`, `search_web`, `read_full_document`. Replaces the manual "go use the Web Search panel" instruction currently baked into the system prompt (`chat/route.ts:144`) — which is a workaround for not having tools. |
| **Cross-notebook search** | Query the whole library at once. |
| **OCR for scanned PDFs** | Currently a hard failure (§4.10). Tesseract or a vision model. Unlocks a large document class. |
| **More formats** | `.pptx`, `.xlsx`, `.csv`, `.epub`, images, audio files (Whisper). |
| **Connectors** | Google Drive, Notion, Dropbox, Zotero, arXiv, GitHub repos. |
| **Chrome extension** | "Save to Docsy" from any page — the URL pipeline already exists. |
| **Table & figure extraction** | Preserve tables as markdown instead of flattening them into prose. |
| **Multi-modal RAG** | Embed page images alongside text so charts and diagrams become answerable. |
| **Export** | Notebook → PDF/DOCX/Markdown report with citations. |
| **Usage limits + billing** | Clerk Billing or Stripe. The hourly caps in `convex/users.ts` stop a runaway; they are not a plan, and nothing meters or charges for what is used. |
| **Public API + MCP server** | Let agents query a user's notebooks. Natural fit for this data model. |

---

## 12. Prioritized action plan

Every item below has a **"Done when"** criterion. If you can't demonstrate the criterion, the item isn't finished — regardless of how much code changed.

### Phase 0 — Stop the bleeding (this week)

| # | Task | § | Done when |
|---|---|---|---|
| 1b | **← START HERE.** Set `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment, then sign in and confirm identity resolves | §3.1 | A temporary query logging `await ctx.auth.getUserIdentity()` returns non-null; create a notebook, upload a doc, chat, delete — all work |
| 4b | Per-user storage quota + notebook cap | §3.5 | Unlimited notebooks × 50 sources is no longer unbounded paid storage |

**Phase 0 exit gate:** you can hand the public Convex URL to a stranger and lose nothing. **Code says yes; nothing has proven it.** Item 1b is the proof.

### Phase 1 — Unbreak (weeks 2–3)

| # | Task | § | Done when |
|---|---|---|---|
| 8 | **First: test whether embeddings still work at all.** Then migrate to `@google/genai` + `gemini-embedding-001` at `outputDimensionality: 768` | §5.1 | A fresh upload produces a non-zero Qdrant point count, and a question about that document returns a citation from it |
| 10b | Make the vector purge durable — retry a failed `purgeVectors` | §4.1 | Qdrant being down during a delete no longer orphans vectors permanently |
| 11 | Make audio generation async via the status field (persistence is done) | §4.2 | The request returns immediately; the live query drives the UI from `pending` → `ready`. **Unblocks item 11b** |
| 11b | Chunk the podcast script so the whole thing is narrated | §4.3 | A `"long"` overview's audio runs the full script, not the first 5,000 chars |
| 12 | Delete the full-document fallback (history is already bounded) | §4.6 | With embeddings disabled, chat says the answer is not in your sources rather than inventing one from raw text |
| 13 | Env validation + honest README (`.env.example` itself is done) | §10 | A *missing* required var fails at startup with a named error, not a silent demo response |

**Phase 1 exit gate:** no silent failure modes left — every broken thing announces itself.

### Phase 2 onward

The remaining phases are lower-risk and less order-dependent, so they're listed without individual gates.

### Phase 2 — Quality (weeks 4–6)
14. Streaming chat via the AI SDK — **§8**
16. Dynamic model catalogue from the OpenRouter API — **§5.6**
17. Split `sources-panel.tsx` — **§6.2**
19. Extend `bun test` coverage + Playwright (CI itself is done) — **§10**
20. Sentry + Helicone/Langfuse — **§10**

### Phase 3 — Make the RAG good (weeks 7–10)
21. Eval harness first (20–30 Q/A pairs) — **§7**
22. Reranking → hybrid search → query rewriting, measuring each — **§7**
23. Structure-aware chunking + parent-document retrieval — **§7**

### Phase 4 — Grow (weeks 11+)
25. Tier 1 features, then Tier 2, then pick 2–3 from Tier 3 to differentiate on.

---

## 13. Quick reference: dependency actions

All dependencies are on latest as of 2026-07-27 except the three in §5.7, which are blocked. `@google/generative-ai` is *also* at its latest published version — the fix there is a package swap, not an update.

```bash
# Replace — deprecated (not solved by updating; 0.24.1 is latest)
bun remove @google/generative-ai && bun add @google/genai

# Add — infrastructure
bun add ai @ai-sdk/openai-compatible        # streaming
bun add @t3-oss/env-nextjs zod              # env validation
bun add @sentry/nextjs                      # error tracking
bun add react-resizable-panels              # UX
bun add -d @playwright/test prettier          # `bun test` covers unit tests already

# Decide (pick one from each pair, then remove the other)
#   @base-ui/react   vs  radix-ui
#   lucide-react     vs  @hugeicons/react + @hugeicons/core-free-icons

# Then
bun outdated && bun update --latest
```

---

## 14. Closing note

The hard part is done: the product concept works, the ingestion pipeline handles four source types, citations resolve to highlighted passages, and Convex gives you real-time state for free. Nothing in this report requires a rewrite.

What's missing is the boring half — auth that actually authenticates, deletes that actually delete, dependencies someone watches, and tests that catch it when they don't. Phase 0 is roughly two days of work and takes the project from "cannot be shown to anyone" to "safe to demo." Everything after that is optional and ordered by value.

> **2026-07-28:** auth now authenticates — API routes, SSRF, and the Convex data layer are all closed on paper. **The gap has moved from "unwritten" to "unverified":** none of it has been exercised against a running deployment, and Convex auth in particular fails *silently and totally* if `CLERK_JWT_ISSUER_DOMAIN` is missing. Do that check (§12 item 1b) before writing another line. After it, the remaining Phase 0 work is cost and abuse control, not data exposure.
