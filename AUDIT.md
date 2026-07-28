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

Partial progress on §3.5, §4.3, §4.6, §4.9, §5.6 and §6.5 is folded into those sections; what remains of §3.2 — the routes authenticate but never check *ownership* — is now §3.6. **§3.1 is untouched and remains the single most important finding:** the API layer is authenticated, but the Convex endpoints beneath it are still wide open to anonymous callers.

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

### 0.3 How to get this running (there is no `.env.example` yet — see §10)

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

⚠️ There is no test command, because there are no tests (§10).

### 0.4 Confidence levels — what to trust

| Marker | Meaning |
|---|---|
| *(unmarked)* | **Verified by direct code reading.** Every `file:line` reference was read. Trust these, subject to §0.2. |
| **[verify]** | **From model knowledge, not checked against a live source.** All package-version and library-capability claims. Confirm with `bun outdated` or the vendor's docs before acting. |
| "may already be broken" | An inference from dates, not an observed failure. Test it. |

Collected `[verify]` items, so you don't have to hunt: §5.1 (Google SDK deprecation timing), §5.6 (specific OpenRouter model slugs), and Qdrant multivector support in `ROADMAP.md` §2.1. §5.7 was a `[verify]` item and is now confirmed against `bun outdated`.

### 0.5 Complete environment variable inventory

The README documents 5 of these. The code references 11. **This full list appears nowhere in the repo** — that's the gap §10 asks you to close by writing `.env.example`.

| Variable | Used at | Required for | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | `providers/convex-provider.tsx:7` | Everything | Ships to the client by design |
| `CONVEX_DEPLOYMENT` | Convex CLI | Deploys | Not read by app code |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk SDK (implicit) | Auth | Not in a `process.env` grep — SDK reads it |
| `CLERK_SECRET_KEY` | Clerk SDK (implicit) | Auth | Same |
| `CLERK_JWT_ISSUER_DOMAIN` | **does not exist yet** | **§3.1 fix** | You must add this for Convex↔Clerk auth |
| `OPENROUTER_API_KEY` | `lib/openrouter.ts:284`, `api/chat`, `api/research` | All chat | Without it, chat serves fake "demo" text (§6.6) |
| `GOOGLE_API_KEY` *or* `GEMINI_API_KEY` | `lib/embeddings.ts:10` | Embeddings / RAG | Either works; `GOOGLE_API_KEY` checked first |
| `QDRANT_URL` | `lib/qdrant.ts:10` | Vector search | Defaults to `http://localhost:6333` |
| `QDRANT_API_KEY` | `lib/qdrant.ts:11` | Hosted Qdrant | Optional for local |
| `ELEVENLABS_API_KEY` | `api/audio-overview/route.ts:84` | Audio overviews | Absent → script-only, no audio |
| `ELEVENLABS_VOICE_ID` | `api/audio-overview/route.ts:91` | Audio overviews | Defaults to Rachel `21m00Tcm4TlvDq8ikWAM` |
| `TAVILY_API_KEY` | `api/web-search/route.ts:28` | Web search | Tried first |
| `SERPER_API_KEY` | `api/web-search/route.ts:29` | Web search | Fallback |
| `NEXT_PUBLIC_APP_URL` | `lib/openrouter.ts` | OpenRouter attribution | Defaults to `localhost:3000` |

**Degradation behaviour worth knowing:** missing keys do not raise errors — they silently switch to fabricated "demo" output (§6.6). A misconfigured production deploy looks like a working one. This is why §0.3 verification matters.

### 0.6 How to navigate this report

Findings are grouped by severity within each section: 🔴 critical · 🟠 significant · 🟡 minor. Section §12 is the **execution order** — if you are here to do work rather than to understand the codebase, start at §12 and follow the phase order. Phases are dependency-ordered; the acceptance criteria in §12 tell you when each item is genuinely done.

**If you only do one thing: §3.1.** Everything else builds on data that currently belongs to whoever asks for it.

---

## 1. Executive summary

Docsy is a NotebookLM-style RAG app: Next.js 16 App Router + Convex + Clerk + Qdrant + OpenRouter. The feature surface is genuinely impressive for 18 commits — notebooks, multi-format ingestion, URL/YouTube ingestion, vector RAG with citations, web search, and podcast generation all exist and work end-to-end.

The problem is that it was built fast and never hardened. **The single most important finding is that the entire data layer is publicly readable and writable by anyone on the internet** — not a theoretical risk, an actual open door. Everything else is secondary to that.

> **Update 2026-07-27:** the API-route half of the exposure is closed. The Convex half — §3.1, the larger half — is **not**.

### Scorecard

| Area | Grade | One-line verdict |
|---|---|---|
| Feature breadth | **A−** | Ambitious and mostly delivered |
| Security | **F** | **Full IDOR on every Convex table** — the API layer is authenticated, the data layer is not |
| Data integrity | **D** | Deletes leave orphans everywhere; audio never persisted |
| Dependency health | **C** | 2 deprecated SDKs, 1 abandoned parser |
| RAG quality | **C** | Works, but naive — no reranking, no hybrid, top-5 fixed |
| Code quality | **C** | 64 `any`, 1250-line god component (`console.*` now zero) |
| Testing / CI | **F** | Zero tests, zero CI, zero linting in pipeline |
| Performance / cost | **D+** | No streaming, unbounded payloads, no rate limits |
| Mobile / a11y | **D** | Notebook page has literally zero responsive breakpoints |

### The 5 things to fix this week

1. **Wire real Convex auth** — remove `clerkId` from every function signature (§3.1). The only thing now standing between the database and the public internet
2. **Add ownership checks** to `/api/embeddings` and `/api/search` (§3.6) — blocked on item 1
3. **Replace `@google/generative-ai` + `text-embedding-004`** — deprecated, may already be dead (§5.1). Test this before anything else in Phase 1
4. **Rate limiting** on the three routes that cost money (§3.4)
5. **Complete the cascade deletes** so deleted documents stop appearing as citations (§4.1)

---

## 2. Architecture as-built

```
Browser (all "use client")
   │
   ├── Clerk (@clerk/nextjs) ──── proxy.ts: clerkMiddleware(protect all non-public routes)
   │
   ├── Convex (ConvexProvider) ── convex/*.ts  [NO auth integration — clerkId passed as arg]
   │        └── users, notebooks, documents, messages, audioOverviews    ← STILL WIDE OPEN (§3.1)
   │        └── Convex file storage (raw uploads)
   │
   └── Next API routes (8, all require a Clerk session — but no ownership checks, §3.6)
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

### 3.1 🔴 Total IDOR: every Convex function trusts a client-supplied `clerkId`

Every query and mutation takes `clerkId: v.string()` as an **argument** and looks the user up from it:

```ts
// convex/documents.ts:6-32 — and 20+ other functions
export const getDocuments = query({
  args: { notebookId: v.id("notebooks"), clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", args.clerkId))  // ← attacker-controlled
      .first();
```

There is **no `convex/auth.config.ts`**, the provider is plain `ConvexProvider` not `ConvexProviderWithClerk` (`components/providers/convex-provider.tsx:31`), and `ctx.auth` is never called anywhere (`grep ctx.auth convex/` → 0 hits).

Convex functions are public HTTP endpoints. Anyone with your `NEXT_PUBLIC_CONVEX_URL` (it ships in the client bundle) can call:

```js
convex.query("documents:getDocuments", { notebookId: "...", clerkId: "user_someone_else" })
convex.mutation("notebooks:deleteNotebook", { notebookId: "...", clerkId: "user_victim" })
convex.mutation("users:deleteUser", { clerkId: "user_victim" })   // ← wipes their account
```

The ownership checks (`notebook.userId !== user._id`) are worthless because the attacker chooses which user they are. **Every notebook, document, chat message, and uploaded file in the database is readable and destroyable by any anonymous visitor.**

`convex/documents.ts:197 getStorageUrl` is worse — it has *no* check at all, not even the fake one. Any `_storage` ID returns a signed download URL.

**Fix:**

```ts
// convex/auth.config.ts  (new file)
export default {
  providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }],
};
```

```tsx
// components/providers/convex-provider.tsx
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
// ...
<ConvexProviderWithClerk client={convex} useAuth={useAuth}>{children}</ConvexProviderWithClerk>
```

```ts
// convex/lib/auth.ts  (new shared helper)
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthenticated");
  const user = await ctx.db.query("users")
    .withIndex("by_clerk_id", q => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new ConvexError("User not provisioned");
  return user;
}
```

#### Complete refactor inventory

This is the exhaustive list so you don't have to rediscover it. **23 of the 25 exported Convex functions take `clerkId`.** Every one needs the arg removed and the lookup replaced with `requireUser(ctx)`.

**Server side — `convex/` (23 functions):**

| File | Functions taking `clerkId` |
|---|---|
| `convex/notebooks.ts` | `getNotebooks:6` · `getNotebook:29` · `createNotebook:52` · `updateNotebook:81` · `deleteNotebook:120` · `getNotebookCount:153` |
| `convex/documents.ts` | `getDocuments:6` · `getDocument:35` · `createDocument:58` · `updateDocumentContent:109` · `deleteDocument:136` · `getDocumentCount:167` |
| `convex/audioOverviews.ts` | `getAudioOverview:6` · `createAudioOverview:39` · `updateAudioOverview:94` · `deleteAudioOverview:134` |
| `convex/messages.ts` | `getMessages:6` · `addMessage:35` · `clearMessages:76` |
| `convex/users.ts` | `upsertUser:6` · `getUserByClerkId:47` · `getCurrentUser:58` · `deleteUser:69` |

**The two exceptions — handle these differently:**

- `documents.ts:189 generateUploadUrl` — takes no args at all. Add `requireUser(ctx)`; currently *any* anonymous caller can mint upload URLs into your storage.
- `documents.ts:197 getStorageUrl` — takes only `storageId`, with **no ownership check whatsoever**. Must verify the caller owns a document referencing that `storageId` before returning a URL.

**Special cases in `convex/users.ts`:**

- `getUserByClerkId:47` and `getCurrentUser:58` have **byte-identical bodies** — pick one, delete the other.
- `upsertUser:6` should be deleted entirely and replaced by the Clerk webhook below. Its `clerkId` is legitimately external (it comes from Clerk, not from an authenticated session), which is exactly why it must move server-to-server.
- `deleteUser:69` must never be callable from a browser. Webhook only.

**Client side — 27 call sites across 6 files:**

| File | Sites | Note |
|---|---|---|
| `components/sources-panel.tsx` | 8 | Also drop the `clerkId: string` prop from `SourcesPanelProps:32` |
| `components/notebook-chat.tsx` | 5 | Also drop the prop from its interface |
| `app/notebook/[id]/page.tsx` | 5 | Includes two `clerkId={user.id}` JSX props to remove |
| `app/dashboard/page.tsx` | 3 | |
| `components/landing/document-dropzone.tsx` | 2 | **Live** — the landing page creates documents |
| `components/user-sync.tsx` | 1 | Delete this whole component (webhook replaces it) |

**Order of operations** (doing this out of order breaks the app mid-refactor):

1. Add `convex/auth.config.ts` + set `CLERK_JWT_ISSUER_DOMAIN`
2. Swap to `ConvexProviderWithClerk` — auth tokens now reach Convex
3. Add `convex/lib/auth.ts` with `requireUser`
4. Refactor Convex functions file by file, `bunx tsc --noEmit` after each
5. Remove client call sites and props
6. Add the Clerk webhook; delete `user-sync.tsx` and `upsertUser`

**Acceptance test — the fix is not done until this fails:**

```js
// In a browser console on any origin, with your public Convex URL:
const c = new ConvexClient("https://<your>.convex.cloud");
await c.query("notebooks:getNotebooks", { clerkId: "user_someone_else" });
// BEFORE: returns that user's notebooks.
// AFTER:  must throw — and the arg must no longer exist in the signature.
```

Also add a **Clerk webhook** (`convex/http.ts`) for `user.created` / `user.updated` / `user.deleted` instead of the client-side `UserSync` component (`components/user-sync.tsx`) — right now `upsertUser` is an unauthenticated mutation that lets anyone forge an arbitrary user row. Verify the Svix signature; an unverified webhook endpoint is the same hole in a different place.

### 3.4 🟠 No rate limiting anywhere

Zero throttling on any route. `/api/audio-overview` at ~$0.30/ElevenLabs call and `/api/research` at 5 upstream calls each are direct cash-burn vectors. Add `@upstash/ratelimit` + Upstash Redis (or Convex-backed counters) keyed on `userId`, with per-route budgets.

### 3.5 🟠 Incomplete upload limits

`/api/process-document` enforces a 10 MB per-file cap. Nothing else is bounded: `handleFiles` (`components/sources-panel.tsx:441`) still accepts any *number* of files, there is no per-request cap and no per-user storage quota.

Also: **file type is taken from `file.type`**, the browser-supplied MIME string — trivially spoofable. Sniff magic bytes server-side.

### 3.6 🟠 API routes authenticate but never check ownership

Every route requires a Clerk session (`requireApiAuth()` in `lib/api-auth.ts`), but none verifies that the caller owns the `notebookId` or `documentId` it is handed. Any signed-in user can still read another user's chunks via `/api/search`, poison their index via `POST /api/embeddings`, or wipe their vectors via `DELETE /api/embeddings?documentId=X`.

This is blocked on §3.1: until Convex functions authenticate, there is no trustworthy way to resolve who owns a notebook. There is a `TODO` marking the spot in `app/api/search/route.ts`.

**Two more residuals worth knowing about, both from the Phase 0 fixes:**

- **DNS rebinding is not covered.** `lib/url-guard.ts` resolves the hostname, checks the addresses, then calls `fetch`, which resolves again. A host that answers public on the first lookup and private on the second still gets through. Closing it needs a custom HTTP agent that pins the validated IP. Documented in that file's header.
- **`/api/research` calls `/api/web-search` server-to-server** and forwards the caller's `cookie` / `authorization` headers to do it. If you refactor either route, keep that forwarding — without it the inner call 401s and research silently returns zero sources.

---

## 4. Correctness & data-integrity bugs

### 4.1 🔴 Deletes leave orphans in three systems

| Operation | Deletes | **Leaves behind** |
|---|---|---|
| `deleteDocument` (`convex/documents.ts:136`) | doc row | Convex storage file (paid, forever); Qdrant vectors *only if* the client's best-effort `fetch` in `app/notebook/[id]/page.tsx:78` succeeds |
| `deleteNotebook` (`convex/notebooks.ts:120`) | notebook + docs | **all messages**, **all audioOverviews**, **all storage files**, **all Qdrant vectors** |
| `deleteUser` (`convex/users.ts:69`) | user + notebooks + docs | same as above, across their whole account |

Orphaned Qdrant vectors are the nastiest: they still match `notebookId` filters, so **deleted documents keep showing up as citations in chat**. Users will see this as a ghost-data bug.

**Fix:** make cascade deletion complete and server-side. Convex mutations can't call Qdrant, so use a Convex **action** or a `scheduler.runAfter(0, internal.cleanup.purgeVectors, {...})` that hits an authenticated internal endpoint. Never rely on the client to clean up.

### 4.2 🔴 Audio overviews are generated then thrown away

`schema.ts:47` defines `audioStorageId`, and the UI writes `status: "ready"` — but `/api/audio-overview` returns the MP3 as **base64 in the JSON body** (`route.ts:177`) and nothing ever uploads it to Convex storage. `sources-panel.tsx:433` even admits it:

```ts
// Note: Audio data would need to be loaded from storage if we implement that
```

So: user waits 30–60s and pays for TTS, gets audio in memory, refreshes the page, audio is gone (script survives). Worse, base64 of a 3-minute MP3 is ~4 MB, which is at/over **Vercel's 4.5 MB serverless response limit** — it likely already fails in production for `duration: "medium"` or `"long"`.

**Fix:** have the route upload the buffer via `ctx.storage.store()` and return only the `storageId`; play from `getUrl()`. Better still, make the whole thing async: create the row as `pending`, run generation in a Convex action / background job, and let the Convex live query drive the UI (this is exactly what Convex is good at, and you already modelled the status states).

### 4.3 🟠 ElevenLabs truncates the script at 5,000 chars

`synthesizeWithElevenLabs` still cuts narration at `TTS_CHAR_LIMIT` (5,000). A `"long"` script targets 1,500–2,000 words ≈ 9,000–12,000 chars, so **more than half the podcast is still cut**. The response no longer lies about it — `estimatedDuration` is now measured over the narrated portion only, and `audio.truncated` flags the cut — but the audio itself is incomplete.

**Fix:** chunk the script and concatenate the audio segments, or use the ElevenLabs long-form endpoint. ⚠️ **Do §4.2 first.** Full-length audio at ElevenLabs' default bitrate is several MB; base64'd into the JSON body it blows straight past Vercel's 4.5 MB response limit. Lifting the truncation before audio moves to Convex storage turns a partial feature into a broken one.

### 4.4 🟠 The "two-host podcast" is read by one voice

The prompt carefully generates `ALEX:` / `SAM:` dialogue (`route.ts:30-50`) and then `route.ts:97` strips the speaker labels and narrates everything with one voice. The output reads as a person talking to themselves. Either use two voice IDs and stitch, or change the prompt to single-narrator.

### 4.5 🟠 Document selection is decorative

`sources-panel.tsx` maintains `selectedDocs` with select-all/toggle UI, `lib/qdrant.ts:118` supports a `documentIds` filter, and `/api/search` accepts it — but `/api/chat` never passes it (`route.ts:84` calls `searchChunks(queryEmbedding, notebookId, { limit: 5 })`). Users check boxes and nothing changes. Thread the selection through; it's a ~5-line fix and a visible quality win.

### 4.6 🟠 Full-document fallback still stuffs the prompt

The overflow itself is closed: `/api/chat` now trims history to the last 20 messages / 24k chars (`trimHistory`) and caps the no-RAG fallback at `MAX_FALLBACK_CONTEXT_CHARS` (30k), so neither can grow without bound. The client still posts its whole history, but the server no longer forwards it.

What remains is the fallback's *existence*. When retrieval returns nothing — no vectors yet, or nothing cleared the score floor — the route silently swaps in raw document text instead of admitting RAG found nothing. That masks a dead embedding pipeline (§5.1) as a working one, and the answers it produces carry no citations.

**Fix:** delete the fallback and say "not in your sources" instead. Do it once §5.1 is confirmed working — until then it is the only thing keeping chat usable on a deployment with no Qdrant.

### 4.7 🟡 Entire document text round-trips client→server on every message

`notebook-chat.tsx:167` maps every document's full `content` into the request body. The server already has notebook access. This is potentially megabytes uploaded per keystroke-submit, on mobile connections. Send `notebookId` only and load server-side.

### 4.9 🟡 Page numbers never appear — *cheap to fix*

Nothing injects page markers into the extracted text, so `pageBreaks` in `chunkTextWithPositions` is almost always empty and `pageNumber` is always `undefined` — the page-number UI in `document-preview.tsx` never fires. (The O(n·m) rescan in `getPageNumber` is fixed; it now advances a forward-only cursor.)

**This is cheap.** `pdf-parse` v2 returns per-page text directly: `getText()` gives a `TextResult` with `.pages` — an array of `{ num, text }` — alongside the concatenated `.text` the route currently uses. Thread `result.pages` through `/api/process-document` → `/api/embeddings` → `chunkTextWithPositions` and real page numbers fall out, no marker parsing required.

### 4.10 🟡 Scanned PDFs fail with a string that gets embedded

When extraction yields nothing, `process-document/route.ts:47` returns the literal `"[PDF content could not be extracted...]"` **as the document content**. It's guarded against embedding (`sources-panel.tsx:465`), but it *is* stored in Convex and *is* fed to the LLM in the fallback path (§4.6). Store a real `status: "failed"` on the document row instead of a magic string.

### 4.11 🟡 `updateNotebook` still writes canvas fields

`convex/notebooks.ts:87-113` accepts `canvasContent` / `canvasHtml` and `schema.ts:24-26` still defines them, but the canvas editor was removed in `4d9decb`. Dead schema + dead code path.

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

### 6.1 🔴 `convex/*.ts` disables type safety wholesale

Every Convex file opens with:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
handler: async (ctx: any, args: any) => {
```

This throws away the entire point of Convex's generated types — `ctx.db.get()` returns `any`, so typos in field names compile fine and fail at runtime. There are **64 `: any` annotations** across the codebase, the majority here.

**Fix:** delete the eslint-disable and the `: any`s. Convex infers `ctx` and `args` from `args:` validators automatically — you get full autocomplete on `args.notebookId` and typed documents from `ctx.db.get()`. This is a find-and-delete change, not a rewrite.

### 6.2 🔴 `sources-panel.tsx` is a 1,307-line god component

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

Each route hand-rolls its try/catch and invents its own error shape (`{error}` vs `{success:false, error}` vs `{error, isDemo, report}`). No route leaks raw internal error text any more, but there is still no single wrapper enforcing that.

Standardize on one `withApiHandler` wrapper and one error envelope: generic messages to clients, details to logs only. The auth guard is already shared — see `lib/api-auth.ts` for the pattern to follow. One deliberate exception to keep: `/api/process-url` surfaces `BlockedUrlError` with its reason and a 400, because that error is *about* the caller's input.

### 6.6 🟡 "Demo mode" is a large maintenance burden

`generateDemoResponse` (114 lines in `/api/chat`), `generateDemoResults`, `generateDemoReport` — hundreds of lines of fake output shipped to production so the app "works" without API keys. This makes real misconfiguration *invisible*: a production deploy with a missing key silently serves fake data instead of erroring. Move demo mode behind an explicit `NEXT_PUBLIC_DEMO_MODE=true` flag, and fail loudly otherwise.

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
| **Full doc content per message** | `notebook-chat.tsx` | See §4.7. |
| **Sequential document uploads** | `sources-panel.tsx` `handleFiles` — a `for` loop awaiting extract→upload→embed per file | Parallelize with a concurrency limit (3–4); show per-file progress. |
| **`.collect()` everywhere + JS sort** | `notebooks.ts:22`, `documents.ts:27`, `messages.ts:27`, etc. — loads every row then sorts in memory | Add sorted indexes (`by_notebook_timestamp`) and use `.order("desc").take(n)`. Chat history will be the first to hurt. |
| **No caching** | Identical questions re-embed and re-infer every time | Cache embeddings by content hash; add OpenRouter prompt caching for the system prompt. |
| **Convex 1 MB document limit** | Docs store up to 50k chars of `content` inline — fine now, but a hard ceiling | Move full text to Convex storage / R2; keep only metadata + a snippet in the row. |

---

## 9. UX and accessibility

### 9.1 🔴 The notebook page is unusable on mobile

`grep -c "sm:\|md:\|lg:" app/notebook/[id]/page.tsx` → **0**. Zero responsive breakpoints. The layout is:

```tsx
<div className="w-[40%] min-w-[320px] max-w-[480px] border-r">  {/* sources */}
<div className="flex-1">                                        {/* chat */}
```

On a 375px viewport: sources are forced to 320px, chat gets 55px. The app is broken on phones. `notebook-chat.tsx` also has 0 breakpoints. This is the single most visible product defect after security.

**Fix:** stacked tab layout below `md`, side-by-side above. Also `h-screen` breaks on iOS Safari with the dynamic toolbar — use `h-dvh`.

### 9.2 🟠 No optimistic UI

`handleSubmit` (`notebook-chat.tsx:145`) awaits the Convex `addMessage` round-trip before the user's own message appears. Their text vanishes from the input and nothing shows for ~200ms. Use Convex optimistic updates.

### 9.3 🟠 No resizable panels

The 40/60 split is fixed with a hard `max-w-[480px]`. Users reading a document alongside chat will want to drag. `react-resizable-panels` + persist to `localStorage`.

### 9.4 🟠 Accessibility gaps

No `aria-label` on icon-only buttons; drag-drop zones have no keyboard equivalent; the loading spinner has no `role="status"`; no `prefers-reduced-motion` handling; the citation tooltip is likely mouse-only. Run `axe` and fix the criticals — you're already using Radix/Base UI, which gives you most of this for free if you use their primitives consistently.

### 9.5 🟡 Errors surface as raw strings

Chat failures get written into the conversation as `"Sorry, I encountered an error: <raw message>"` (`notebook-chat.tsx:196`) — and persisted to the database, so they pollute history forever. Show a transient toast + inline retry button instead of writing errors to the messages table.

### 9.6 🟡 Missing basics

No empty states for a notebook with zero sources beyond the dropzone; no per-source processing status (a doc that failed extraction looks identical to a good one); no way to rename a document; no search/filter over sources; no way to see *why* a source has no content.

---

## 10. Missing engineering infrastructure

| Missing | Recommendation |
|---|---|
| **Tests** (zero files) | Vitest for `lib/` (chunking, offsets, model validation — pure functions, easy wins). Playwright for the upload → chat → citation flow. |
| **CI** (no `.github/`) | GitHub Actions: `bun install → tsc --noEmit → eslint → vitest → next build` on every PR. |
| **`prettier`** | Not installed; formatting drifts (`lib/openrouter.ts` uses trailing commas, `lib/qdrant.ts` doesn't). Add + `--check` in CI. |
| **`.env.example`** | 11 distinct env vars referenced across the code; only 5 documented in the README. Nobody can clone this and run it. List all 11 with comments. |
| **Env validation** | Add `@t3-oss/env-nextjs` + zod so a missing key fails at boot, not at 2am in a route handler. |
| **Error tracking** | Sentry — you currently have zero visibility into production failures. |
| **LLM observability** | Helicone or Langfuse — you have no idea what models cost, which fail, or what latency users see. Critical for a multi-model app. |
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
| **Two-voice podcast + full-length TTS** | The "audio overview" pitch, actually delivered (§4.3, §4.4) | M |
| **Wire up source selection** | UI exists and does nothing (§4.5) | S |
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
| **Usage limits + billing** | Clerk Billing or Stripe. Right now any signed-in user can burn your ElevenLabs credits without limit (§3.4). |
| **Public API + MCP server** | Let agents query a user's notebooks. Natural fit for this data model. |

---

## 12. Prioritized action plan

Every item below has a **"Done when"** criterion. If you can't demonstrate the criterion, the item isn't finished — regardless of how much code changed.

### Phase 0 — Stop the bleeding (this week)

*Do these in order. Items 1, 2 and 5 are one workstream; see the ordering steps in §3.1.*

| # | Task | § | Done when |
|---|---|---|---|
| 1 | **← START HERE.** Convex auth: `auth.config.ts` + `ConvexProviderWithClerk` + `requireUser()`; strip `clerkId` from all 23 functions and 27 call sites | §3.1 | The acceptance test in §3.1 throws, and `grep -rn "clerkId" app components` returns **zero** hits |
| 2 | Ownership checks on `/api/embeddings` and `/api/search` — verify the caller owns the `notebookId` before touching Qdrant | §3.6 | User A, signed in, cannot read or delete User B's chunks by passing their `notebookId` / `documentId` |
| 3 | Rate limiting on `/api/audio-overview`, `/api/research`, `/api/chat` | §3.4 | Exceeding the per-user budget returns 429 with `Retry-After` |
| 4 | Upload count/quota limits + server-side magic-byte sniffing | §3.5 | A `.exe` renamed `.pdf` with a spoofed `Content-Type` is rejected; a 50-file drop is capped |
| 5 | Clerk webhook (`convex/http.ts`) replaces `UserSync`; delete `upsertUser` + `user-sync.tsx` | §3.1 | New signup creates a `users` row with no browser involvement; Svix signature verified; an unsigned POST is rejected |
| 6 | Fix the false "Private & secure" claim on the landing page (`components/landing/features.tsx:81`) | — | Copy matches reality once 1–5 ship |

**Phase 0 exit gate:** you can hand the public Convex URL to a stranger and lose nothing. **Not met** — item 1 is the one the gate actually turns on.

### Phase 1 — Unbreak (weeks 2–3)

| # | Task | § | Done when |
|---|---|---|---|
| 8 | **First: test whether embeddings still work at all.** Then migrate to `@google/genai` + `gemini-embedding-001` at `outputDimensionality: 768` | §5.1 | A fresh upload produces a non-zero Qdrant point count, and a question about that document returns a citation from it |
| 9 | Wire `pdf-parse` v2's per-page text (`result.pages`) through to `pageNumber` | §4.9 | A citation from page 4 displays "Page 4" |
| 10 | Complete cascade deletes (Convex rows + storage files + Qdrant vectors), server-side | §4.1 | After deleting a document, its chunks are gone from Qdrant and it can never appear as a citation again. After deleting a notebook: zero orphaned messages, audioOverviews, storage files, or vectors |
| 11 | Persist audio to Convex storage; make generation async via the status field | §4.2 | Generate an audio overview, hard-refresh, audio still plays. No base64 in any JSON response. **Unblocks item 11b** |
| 11b | Chunk the podcast script so the whole thing is narrated | §4.3 | A `"long"` overview's audio runs the full script, not the first 5,000 chars |
| 12 | Delete the full-document fallback (history is already bounded) | §4.6 | With embeddings disabled, chat says the answer is not in your sources rather than inventing one from raw text |
| 13 | `.env.example` (all 14 vars from §0.5) + env validation + honest README | §10 | A fresh clone with `.env.example` filled in boots successfully; a *missing* required var fails at startup with a named error, not a silent demo response |

**Phase 1 exit gate:** no silent failure modes left — every broken thing announces itself.

### Phase 2 onward

The remaining phases are lower-risk and less order-dependent, so they're listed without individual gates.

### Phase 2 — Quality (weeks 4–6)
14. Streaming chat via the AI SDK — **§8**
15. Mobile-responsive notebook layout — **§9.1**
16. Dynamic model catalogue from the OpenRouter API — **§5.6**
17. Delete `any` from `convex/`; restore real types — **§6.1**
18. Split `sources-panel.tsx` — **§6.2**
19. Vitest + Playwright + GitHub Actions CI — **§10**
20. Sentry + Helicone/Langfuse — **§10**

### Phase 3 — Make the RAG good (weeks 7–10)
21. Eval harness first (20–30 Q/A pairs) — **§7**
22. Reranking → hybrid search → query rewriting, measuring each — **§7**
23. Structure-aware chunking + parent-document retrieval — **§7**
24. Wire source selection into retrieval — **§4.5**

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
bun add @upstash/ratelimit @upstash/redis   # rate limiting
bun add @t3-oss/env-nextjs zod              # env validation
bun add @sentry/nextjs                      # error tracking
bun add react-resizable-panels              # UX
bun add -d vitest @vitejs/plugin-react @playwright/test prettier

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

**Start with §3.1.** Every other improvement is built on data that currently belongs to whoever asks for it.

> **2026-07-27:** still true. The API layer is authenticated and the SSRF hole is closed, which removes the anonymous credit-burn and internal-scanner vectors — but §3.1 is untouched, and it is the finding that decides whether this can be shown to anyone.
