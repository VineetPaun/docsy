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

| Date       | Removed                                                                                             | Landed in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-20 | §6.5 — nine hand-rolled error shapes                                                                | `lib/api-handler.ts` `withApiHandler` — auth, rate limit, `{ error }` envelope and Sentry in one place; handlers throw `ApiError` / `badRequest` / `missingEnv`. `/api/process-url` keeps its `BlockedUrlError` 400 through `expose`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-20 | §6.7 — auth gating ran in the browser                                                               | `app/dashboard/page.tsx` and `app/notebook/[id]/page.tsx` are Server Components calling `auth.protect()`; the client shells lost their `if (!user)` branches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-20 | §6.2 — the last two god components                                                                  | `components/chat/*` (948 lines → composition root + 5 files + `hooks/use-chat.ts`) and `components/dashboard/*` (407 lines → shell, header, grid, create form, `hooks/use-notebooks.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-20 | §8 — nothing was cached                                                                             | `lib/lru.ts` + an embedding cache keyed by sha256(text)+task type inside `embedBatch`; `withPromptCaching()` marks a long system prompt cacheable for Anthropic models. Both tested                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-20 | §9.3 — the split was fixed at `max-w-[480px]`                                                       | `components/ui/resizable.tsx` (shadcn / react-resizable-panels) from `md` up, layout persisted via `useDefaultLayout`; tabs below `md` unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-20 | §9.1 — the dashboard had never had a responsive pass                                                | heading row and create form stack below `sm`, card titles truncate, the delete button is visible on touch instead of hover-only, `min-h-dvh`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-20 | §3.6 — DNS rebinding                                                                                | `lib/url-guard.ts` connects through `node:https` with a pinned `lookup`, so the socket lands on the address that was validated; SNI and certificate still use the hostname, and every redirect hop is re-pinned. `lib/url-guard.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-20 | §10 — no route tests, no E2E, no prettier, no CONTRIBUTING, no source maps                          | `tests/chat-route.test.ts` (guards, 503/502, stream framing), `tests/cascade.test.ts` (delete path via a `MutationCtx` double), Playwright config + `e2e/*.e2e.ts` (out of CI — needs real keys), prettier + `format:check` in CI, `CONTRIBUTING.md`, and `withSentryConfig` wired behind the three upload variables                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-18 | §3.5 — no per-user quota in _bytes_                                                                 | `convex/lib/quota.ts` — `users.storageBytes` maintained on create, content rewrite and both cascade paths; size read from `_storage` metadata, never from the client; `ConvexError` names the ceiling. `lib/quota.test.ts`. **Phase 0 code is now complete**                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-18 | §10 — webhook replay could overwrite a newer profile                                                | `users.claimWebhookEvent` + a `webhookEvents` table; `convex/http.ts` applies each `svix-id` once and 200s a duplicate. Stale ids pruned on the write path, no cron                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-08-18 | §8 — `.collect()` + JS sort on every list read                                                      | `by_user_updated` / `by_notebook_created` / `by_notebook_time` indexes; `getMessages` bounded to the newest 200 off the index; both count caps use `take()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-18 | §8 — sequential uploads                                                                             | `lib/concurrency.ts` `mapWithConcurrency` (tested), 3 files in flight; progress reports finished-of-total                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-18 | §6.2 — `sources-panel.tsx` was a 1,211-line god component                                           | `components/sources/*` — a 290-line composition root, one file per concern (`source-list`, `url-import-panel`, `web-search-panel`, `audio-overview-panel`, `rename-source-dialog`, `source-icon`) and two hooks. **`notebook-chat.tsx` and `dashboard/page.tsx` still want the same treatment — that residual is §6.2**                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-08-18 | §9.6 — missing basics                                                                               | `documents.indexStatus` + a badge that says when a source never reached the vector store; `documents.renameDocument` + a Radix rename dialog; a name filter past four sources; row actions visible on touch instead of hover-only; honest empty-state copy                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-18 | §10 — no error tracking, no LLM observability                                                       | `instrumentation.ts` (Next's `onRequestError`) + `instrumentation-client.ts`, inert without a DSN, traces/replay/PII off; Helicone as a base-URL swap in `postCompletion` — no dependency, byte-identical requests when unkeyed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-18 | §10 — no `SECURITY.md`, nothing watching dependencies                                               | `SECURITY.md` (private-reporting path, scope, known residuals) + `.github/dependabot.yml`, grouped weekly, eslint major held per CLAUDE.md trap 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-18 | §7 — no eval harness, no query transformation, `limit: 5` hardcoded                                 | `scripts/eval-retrieval.ts` (`bun run eval <notebookId>` → hit@3 / hit@20 / MRR); `lib/query-rewrite.ts` resolves context-dependent follow-ups against the last two turns, falling back to the original text; `retrievalLimitFor()` scales k with the model's window, clamped 5–20. **Reranking and hybrid search stay open — see §7**                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-08-18 | §5.7 — Clerk held at v6, TypeScript held at 5.9                                                     | `@clerk/nextjs@7` (`useSignIn`/`useSignUp` from `/legacy`, `<Show when>` for `<SignedIn>`/`<SignedOut>`, fallback redirect props), `typescript@7` + `experimental.useTypeScriptCli`, `@qdrant/js-client-rest@1.19` (`query()` replaces `search()`). **The eslint/typescript-eslint blocker is unchanged — see §5.7**                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-18 | CLAUDE.md trap 5d — `extractTextFromFile` duplicated in both dropzones                              | `lib/source-upload.ts` — one copy of the accepted-type map, the extraction call and the embedding call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-07-27 | §3.2 — all 9 API routes unauthenticated                                                             | `proxy.ts`, `lib/api-auth.ts`, all 8 handlers; `/api/debug` deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-07-27 | §3.3 — SSRF in `/api/process-url`                                                                   | `lib/url-guard.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-07-27 | §5.4 — 11 unused packages                                                                           | `package.json`, `bun.lock`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-27 | §5.5 — 2 dead components                                                                            | `chat-interface.tsx`, `document-upload.tsx` deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-07-27 | §5.2 — `pdf-parse@1.1.1` abandoned                                                                  | `pdf-parse@2.4.5`: real types, modern pdf.js, `@ts-expect-error` gone. Unblocks §4.9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-28 | §4.8 — citation offsets drifted from stored text                                                    | `lib/qdrant.ts` — offsets recorded after trim, `endChar` clamped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-28 | §5.8 — `tsconfig` targeted ES2017                                                                   | `tsconfig.json` → `ES2022`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-28 | §6.3 — ~95 `console.*` in production paths                                                          | 0 remain across `app/`, `components/`, `lib/`, `convex/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-28 | §6.4 — dead/broken code in live files                                                               | fake `handleReprocessDocument` + its button, commented blocks, unused `chunkText()`; `hooks/use-convex-status.tsx` → `lib/mock-data.ts` (only `mockNotebooks` was live)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-07-28 | §7 — no retrieval score floor                                                                       | `lib/qdrant.ts` `DEFAULT_SCORE_THRESHOLD = 0.5`, applied server-side by Qdrant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-07-28 | §8 — no `maxDuration`; sequential research searches                                                 | 4 slow routes export `maxDuration`; `/api/research` uses `Promise.allSettled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-28 | §3.1 — **total IDOR on every Convex table**                                                         | `convex/auth.config.ts`, `ConvexProviderWithClerk`, `convex/lib/auth.ts` (`getUser` / `requireUser` / `requireOwnedNotebook` / `requireOwnedDocument`); `clerkId` arg gone from all 23 functions and all 27 call sites; `generateUploadUrl` authed; `getStorageUrl` ownership-checked; `getDocumentCount` ownership-checked; duplicate `getUserByClerkId` deleted; `deleteUser` → `internalMutation`; `upsertUser` derives its id from the token. **Webhook remainder is still §3.1**                                                                                                                                                                                                                                 |
| 2026-07-28 | §6.1 — `convex/*.ts` disabled type safety wholesale                                                 | every `eslint-disable no-explicit-any` header and `: any` in `convex/` gone; 2 `any` left repo-wide, both in `sources-panel.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-29 | §3.6 — routes authenticated but never checked _ownership_                                           | `lib/convex-server.ts` (`requireNotebookOwner` / `requireDocumentOwner`, via `ConvexHttpClient` + the caller's `convex` Clerk token); applied in `/api/search`, `POST`+`DELETE /api/embeddings`, and `/api/chat` (same hole, not originally listed). Document delete in `app/notebook/[id]/page.tsx` now purges vectors _before_ the Convex row, or the new check could never pass. **Residuals below stay as §3.6**                                                                                                                                                                                                                                                                                                  |
| 2026-07-29 | §12 Phase 0 item 6 — false "Private & secure" landing claim                                         | `components/landing/features.tsx` — "never share your data with third parties" was untrue (sources go to Gemini/OpenRouter/ElevenLabs); now claims per-account isolation only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-29 | §4.9 — page numbers never appeared                                                                  | `/api/process-document` joins `result.pages` with `\f`; the rest of the chain already carried `pageNumber`. First test in the repo: `lib/qdrant.test.ts` (`bun test`). **Non-PDF sources stay page-less — that residual is still §4.9**                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-07-29 | §10 — no `.env.example`                                                                             | `.env.example` with all 15 vars + degradation notes; `.gitignore` gained `!.env.example`. **The rest of §10 (env validation, CI, prettier, Sentry, README) is still open.** Note: `.gitignore` never contained the `*.md` line TODO.md warned about — docs commit normally                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-29 | §3.1 — user provisioning ran in the browser                                                         | `convex/http.ts` — Svix-verified Clerk webhook on `/clerk-webhook` handling `user.created` / `user.updated` / `user.deleted`; `upsertUser` → `internal upsertFromClerk`; `components/user-sync.tsx` and both `<UserSync />` renders deleted; `deleteUser` finally has a caller. **Needs `CLERK_WEBHOOK_SECRET` on the Convex deployment + endpoint registered in the Clerk Dashboard**                                                                                                                                                                                                                                                                                                                                |
| 2026-07-29 | §4.1 — deletes orphaned rows, files and vectors                                                     | `convex/lib/cascade.ts` (`purgeDocument` / `purgeNotebook`) — messages, audioOverviews, storage files and vectors all cascade; `internal.documents.purgeVectors` action deletes from Qdrant by filter. `DELETE /api/embeddings` and the client's best-effort cleanup `fetch` deleted with it. **Needs `QDRANT_URL` / `QDRANT_API_KEY` on the Convex deployment**                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-29 | §3.5 — file type taken from the browser; no count cap                                               | `lib/file-type.ts` `sniffFileType()` — magic bytes decide the type, `file.type` is ignored; all uploads (text included) now go through `/api/process-document`; rejection throws instead of storing a placeholder; `MAX_DOCUMENTS_PER_NOTEBOOK = 50` enforced in `createDocument`. Covered by `lib/file-type.test.ts`. **Per-user storage quota is still open — see §3.5**                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-29 | §4.10 — extraction failure stored as a magic string                                                 | `/api/process-document` returns 422 with a readable reason; `"[PDF content could not be extracted...]"` is gone, and so are the `startsWith("[Failed")` guards that existed to catch it. A file whose text cannot be read is no longer stored at all                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-29 | §4.2 — audio overviews generated then thrown away                                                   | Route uploads the MP3 to Convex storage via `authedConvexClient()` and returns a `storageId`; `getAudioOverview` resolves it to a signed URL; `AudioPlayer`'s base64 `audioData` prop deleted. Old MP3s are now deleted on regenerate and on `deleteAudioOverview`. **Async generation is still synchronous — see §4.2**                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-29 | §9.1 — notebook page had zero responsive breakpoints                                                | `app/notebook/[id]/page.tsx` — shadcn `Tabs` switch sources/chat below `md`, side by side above, both panels `forceMount` so switching keeps state; `h-screen` → `h-dvh`; header truncates; model dropdown's `min-w-[400px]` capped to the viewport; citation dialog fits a phone                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-07-29 | §10 — no CI                                                                                         | `.github/workflows/ci.yml` — `tsc --noEmit`, `eslint`, `bun test` on push and PR. `next build` deliberately excluded until a Clerk publishable key exists as a repo secret                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-07-30 | §3.4 — no rate limiting anywhere                                                                    | `lib/rate-limit.ts` `enforceRateLimit()` on `/api/chat`, `/api/research`, `/api/audio-overview` → 429 + `Retry-After`. Counter is a Convex table (`rateLimits`) + `users.consumeRateLimit`, so no new service and **no new env var**; budgets (60/10/5 per hour) are server-side in `convex/users.ts` — an earlier shape passed `limit`/`windowMs` as args, which let a caller reset their own window. Window maths covered by `lib/rate-limit.test.ts`. Fails closed. **Limits are a guess — tune them**                                                                                                                                                                                                             |
| 2026-07-30 | §5.1 — deprecated `@google/generative-ai` + `text-embedding-004`, no retry                          | `lib/embeddings.ts` rewritten on `@google/genai` + `gemini-embedding-001` (`outputDimensionality: 768`), `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` task types, one `embedContent` call per batch with exponential backoff on 429/5xx (`lib/embeddings.test.ts`). Qdrant collection versioned to `docsy_documents_v2` — the vector space changed, so old points are not comparable. **Re-indexing and a runtime check remain — see §5.1**                                                                                                                                                                                                                                                                               |
| 2026-07-30 | §5.6 — hardcoded model catalogue, 16 of 19 slugs dead                                               | `lib/openrouter.ts` fetches `GET /api/v1/models` (1h cache) → free models + `PREMIUM_ALLOWLIST`, `resolveModel()` validates server-side, `/api/models` feeds the picker, `OPENROUTER_MODELS` / `isValidModel` / `VALID_MODEL_IDS` deleted. `ModelId` is now `string`; the client no longer validates. Filter and mapping covered by `lib/openrouter.test.ts`. **Two hand-kept lists remain — see §5.6**                                                                                                                                                                                                                                                                                                               |
| 2026-07-30 | §4.7 — `/api/audio-overview` took its source text from the request body and never checked ownership | route calls `requireNotebookOwner()` then `notebookDocuments()`; `documents` is gone from `AudioOverviewRequest`, and the client posts a notebook id only. A notebook with nothing narratable is a 400 from the route rather than a client-side guard                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-30 | §4.4 — the "two-host podcast" was read by one voice                                                 | the prompt now writes a single-narrator episode; the `ALEX:`/`SAM:` label strip stays as a guard against a model that ignores it. Two voices is a feature, and lives in §11 Tier 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-07-30 | §6.6 — demo mode faked output when keys were missing                                                | `generateDemoResponse`, `generateDemoResults` and `generateDemoReport` deleted (~300 lines); `/api/chat`, `/api/web-search` and `/api/research` return **503 naming the missing variable**. No `NEXT_PUBLIC_DEMO_MODE` flag was added — no caller read `isDemo`, so nothing wanted the mode kept                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-07-30 | §4.11 — `updateNotebook` still wrote canvas fields                                                  | `canvasContent` / `canvasHtml` args and their writes gone from `convex/notebooks.ts`. **The schema fields survive until a migration — that residual is still §4.11**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-07-30 | §9.4 — accessibility gaps                                                                           | `aria-label` on every icon-only control (send, seek, play/pause, mute, restart, download, speed, per-source delete, close, GitHub) and on the per-source checkbox; `role="status"` on the loading spinners; the landing dropzone got a keyboard path (`sr-only` file input + overlay `<label>`, `focus-within` ring) — it was `div onClick` with a `display:none` input; the audio progress bar is a keyboard slider (arrows/Home/End); the citation tooltip opens on focus and closes on Escape, with `aria-describedby`; `prefers-reduced-motion` honoured globally in `app/globals.css`; a dead unlabelled grid button deleted from the sources header. **Focus trapping and a real audit pass remain — see §9.4** |
| 2026-08-03 | §8 — `/api/chat` awaited the whole completion before replying                                       | `lib/openrouter.ts` `streamChatWithOpenRouter()` (+ `parseStreamLine()`, tested) and a shared `postCompletion()`; the route returns NDJSON — one `meta` line carrying citations, sources and model, then `delta` lines, then `done` — and `notebook-chat.tsx` renders the in-flight answer by appending a synthetic message to the transcript, so the existing bubble, markdown and citation handling are reused. **No `ai` SDK dependency**: this is the app's only streaming call, and `useChat` would have had to replace the Convex-persisted message list. A mid-stream failure is reported in-band and the partial answer is discarded rather than saved                                                        |
| 2026-08-03 | §9.2 — no optimistic UI · §9.5 — chat errors persisted into message history                         | `notebook-chat.tsx` — `addMessage` carries a `withOptimisticUpdate`, so the user's message renders before the Convex round-trip; failures now set a `failure` state that renders an inline `role="alert"` banner with a Retry button plus a `sonner` toast, instead of writing `"Sorry, I encountered an error: …"` into the `messages` table where it polluted history and fed back as context. `requestAnswer()` is split out so a retry re-asks without re-posting the user's message                                                                                                                                                                                                                              |
| 2026-08-03 | §10 — no env validation; README documented 5 of 14 vars                                             | `lib/env.ts` + `instrumentation.ts` — the server refuses to start when a boot-required variable is missing, naming all of them at once (`lib/env.test.ts`). Deliberately only the Clerk pair: Convex has a mock-data path and the feature keys already 503 with their own name, so requiring them would trade a good error for a worse one. README now lists Qdrant, Gemini, ElevenLabs and Tavily/Serper, points at `.env.example`, and documents the four Convex-side vars plus the webhook. **Prettier, Sentry and LLM observability are still open — see §10**                                                                                                                                                    |
| 2026-08-03 | §4.2 — the client blocked on the whole generation                                                   | Row created `pending` before the call; `/api/audio-overview` patches it through `generating_script` → `synthesizing` → `ready` / `script_only` / `failed` via `progressReporter()` (as the calling user, so `updateAudioOverview` still checks the owner); `sources-panel.tsx` fires the request without awaiting it and derives `isGeneratingAudio` from the row, with a 10-minute staleness cutoff; `audio-player.tsx` no longer renders transport controls around audio that does not exist yet. **Tab-close durability stays as §4.2**                                                                                                                                                                            |
| 2026-08-03 | §4.3 — ElevenLabs truncated narration at 5,000 chars                                                | `lib/tts-chunks.ts` — `splitForTts()` splits on sentence boundaries (word boundaries when one sentence is over-long), `concatAudio()` joins the MP3 segments; `/api/audio-overview` makes one sequential request per chunk, capped at `MAX_TTS_CHUNKS = 8`. `audio.truncated` and `estimatedDuration` now describe what was really narrated, and a mid-script TTS failure keeps the audio bought so far. Covered by `lib/tts-chunks.test.ts`                                                                                                                                                                                                                                                                          |
| 2026-08-03 | §4.1 — a failed vector purge was never retried                                                      | `convex/documents.ts` `purgeVectors` reschedules itself on failure (`PURGE_RETRY_DELAYS_S` — 1min/5min/25min/2h) and gives up with a named log line. Safe only because it is an action; the same code in a mutation would roll the schedule back. **`QDRANT_URL` residual stays as §4.1**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-03 | §4.6 — the full-document fallback answered without citations                                        | `/api/chat` — retrieval is the only path from a source to the prompt now. `MAX_FALLBACK_CONTEXT_CHARS` and the raw-text loop are gone; a missing `GOOGLE_API_KEY` / `QDRANT_URL` is a **503 naming it** and a retrieval throw is a 502 ("Could not search your sources"), instead of a silent downgrade to an ungrounded answer. Empty results now say so in the prompt. `notebookId` is required (it was optional, which only produced context-free completions) and the dead `useRAG` flag — no caller ever set it — is deleted. ⚠️ Chat is now unusable without a working Qdrant + embeddings pair; that is the point, but it means §5.1 is no longer optional                                                     |
| 2026-08-03 | ROADMAP §3.4 — uploaded source text was pasted into the system prompt as instructions               | `lib/prompt-guard.ts` — `fenceSourceData()` wraps untrusted text in `<source_data>` (stripping the delimiters from the content so a document cannot close the block) and `SOURCE_DATA_RULE` tells the model the block is data, never commands. Applied in `/api/chat`, `/api/audio-overview` and `/api/research` (search snippets are untrusted too). Covered by `lib/prompt-guard.test.ts`. **Structural separation only** — mitigations 2–5 stay open in ROADMAP §3.4                                                                                                                                                                                                                                               |
| 2026-08-10 | §9.4 — `document-preview.tsx` trapped no focus                                                      | Rebuilt on `components/ui/dialog.tsx` (Radix): focus is trapped and restored, Escape and backdrop dismissal come free, and the hand-rolled `keydown` listener, backdrop handler, `role="dialog"` / `aria-modal` attributes and two inline SVGs are deleted. **An `axe` / screen-reader pass is still owed — that residual stays as §9.4**                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-10 | §5.3 — two overlapping UI primitive libraries and two icon sets                                     | `@base-ui/react` had zero imports repo-wide; `lucide-react` had one file (`audio-player.tsx`, swapped to the `@hugeicons` set `components.json` already declares). Both uninstalled — one component runtime, one icon library                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-10 | §5.6 — `DEFAULT_MODEL` was a hardcoded slug                                                         | `pickDefaultModel()` derives the default from the live catalogue: biggest-context **free** model, so a retirement moves it instead of breaking chat. The constant survives as the last resort behind a failed fetch. `model-selector.tsx` adopts the id it displays when the stored one is not on offer — the label used to name one model while the request carried a dead slug. Covered by `lib/openrouter.test.ts`                                                                                                                                                                                                                                                                                                 |
| 2026-08-10 | §7 — an invented `[7]` rendered as a citation chip                                                  | `notebook-chat.tsx` `renderWithCitations()` — a reference with no matching citation renders as the literal text the model wrote, not as a badge that looks checked and opens nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-03 | §10 — `.env.example` did not actually exist                                                         | The 2026-07-29 row below was wrong: the file was never written, and `git ls-files` had no trace of it. Now present with all 14 client-side vars, the four Convex-deployment ones, and the silent-failure table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-07-29 | §4.5 — source selection never reached retrieval · §4.7 — full document text posted per chat message | `/api/chat` takes `documentIds` instead of `documents` and loads the text itself via `notebookDocuments()` (`lib/convex-server.ts`); the selection filters both retrieval (`searchChunks({ documentIds })`) and the no-RAG fallback; `selectedDocs` lifted from `sources-panel.tsx` to `app/notebook/[id]/page.tsx` so chat can read it. Empty selection = whole notebook. **`/api/audio-overview` still takes body text — that residual is now §4.7**                                                                                                                                                                                                                                                                |

Partial progress on §3.5, §4.9, §5.6 and §6.5 is folded into those sections; what remains of §3.2 — the routes authenticate but never check _ownership_ — is now §3.6, and is no longer blocked. **§3.1 is now only about moving user provisioning out of the browser into a Clerk webhook** — the data-exposure half is closed, pending the runtime check called out in that section.

**Verification status:** `bunx tsc --noEmit` passes and `bun run lint` is clean (0 errors, 0 warnings) as of 2026-07-28. `bun run build` compiles + typechecks but cannot _finish_ here because prerendering `/_not-found` needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and no `.env` exists in this checkout — that is §10, not a code defect. **No runtime behaviour has been exercised**, so treat the §12 acceptance criteria as _not yet demonstrated_.

---

## 0. Orientation for anyone (or any agent) picking this up cold

**Read this section first.** It exists so you can act on this report without re-deriving its context.

### 0.1 What this project is

Docsy is a NotebookLM-style RAG app. A user creates a **notebook**, adds **sources** (PDF/DOCX/TXT uploads, web URLs, YouTube videos), and chats with an LLM that answers only from those sources, with inline `[1]`-style citations that open the source text at the cited passage. It also generates AI "audio overviews" (podcast-style summaries).

Stack: **Next.js 16** (App Router, `proxy.ts` not `middleware.ts`) · **Convex** (database + file storage + reactive queries) · **Clerk** (auth) · **Qdrant** (vector search) · **OpenRouter** (LLM gateway, live catalogue) · **Google Gemini** (embeddings) · **ElevenLabs** (TTS) · **Tailwind 4** + shadcn/ui · **Bun** (package manager and runtime).

### 0.2 Is this report still accurate? (staleness check)

This audit describes the code **as of `4d9decb`**. Before acting on any finding, run:

```bash
git log --oneline 4d9decb..HEAD
```

- **No output** → the audit is current _apart from the changelog above_. Proceed.
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

⚠️ `bun test` runs 40 cases across 8 files, all over pure functions in `lib/`. There is no integration or E2E suite (§10) — never report that "tests pass" as evidence a feature works.

### 0.4 Confidence levels — what to trust

| Marker                  | Meaning                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _(unmarked)_            | **Verified by direct code reading.** Every `file:line` reference was read. Trust these, subject to §0.2.                                                                        |
| **[verify]**            | **From model knowledge, not checked against a live source.** All package-version and library-capability claims. Confirm with `bun outdated` or the vendor's docs before acting. |
| "may already be broken" | An inference from dates, not an observed failure. Test it.                                                                                                                      |

Collected `[verify]` items, so you don't have to hunt: Qdrant multivector support in `ROADMAP.md` §2.1. §5.7 was confirmed against `bun outdated` (and re-confirmed on 2026-08-18, when Clerk 7, TypeScript 7 and Qdrant 1.19 landed); §5.6's model slugs were confirmed against the live OpenRouter catalogue on 2026-07-30 (16 of 19 were dead), and §5.1's SDK swap is done.

### 0.5 Complete environment variable inventory

The README documents 5 of these. `.env.example` now carries the full list with its degradation notes, and is the copy to keep current; the table below is the audit's record of where each is read.

| Variable                               | Used at                                             | Required for             | Notes                                                            |
| -------------------------------------- | --------------------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`               | `providers/convex-provider.tsx:7`                   | Everything               | Ships to the client by design                                    |
| `CONVEX_DEPLOYMENT`                    | Convex CLI                                          | Deploys                  | Not read by app code                                             |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`    | Clerk SDK (implicit)                                | Auth                     | Not in a `process.env` grep — SDK reads it                       |
| `CLERK_SECRET_KEY`                     | Clerk SDK (implicit)                                | Auth                     | Same                                                             |
| `CLERK_JWT_ISSUER_DOMAIN`              | `convex/auth.config.ts`                             | **§3.1**                 | Set on the _Convex deployment_, not in `.env.local`              |
| `OPENROUTER_API_KEY`                   | `lib/openrouter.ts:284`, `api/chat`, `api/research` | All chat                 | Without it, `/api/chat` and `/api/research` return 503 naming it |
| `GOOGLE_API_KEY` _or_ `GEMINI_API_KEY` | `lib/embeddings.ts:10`                              | Embeddings / RAG         | Either works; `GOOGLE_API_KEY` checked first                     |
| `QDRANT_URL`                           | `lib/qdrant.ts:10`                                  | Vector search            | Defaults to `http://localhost:6333`                              |
| `QDRANT_API_KEY`                       | `lib/qdrant.ts:11`                                  | Hosted Qdrant            | Optional for local                                               |
| `ELEVENLABS_API_KEY`                   | `api/audio-overview/route.ts:84`                    | Audio overviews          | Absent → script-only, no audio                                   |
| `ELEVENLABS_VOICE_ID`                  | `api/audio-overview/route.ts:91`                    | Audio overviews          | Defaults to Rachel `21m00Tcm4TlvDq8ikWAM`                        |
| `TAVILY_API_KEY`                       | `api/web-search/route.ts:28`                        | Web search               | Tried first                                                      |
| `SERPER_API_KEY`                       | `api/web-search/route.ts:29`                        | Web search               | Fallback                                                         |
| `NEXT_PUBLIC_APP_URL`                  | `lib/openrouter.ts`                                 | OpenRouter attribution   | Defaults to `localhost:3000`                                     |
| `HELICONE_API_KEY`                     | `lib/openrouter.ts` `postCompletion`                | LLM cost/latency metrics | Absent → calls go straight to OpenRouter, unchanged              |
| `SENTRY_DSN`                           | `instrumentation.ts`                                | Server error reporting   | Absent → the SDK never initialises                               |
| `NEXT_PUBLIC_SENTRY_DSN`               | `instrumentation-client.ts`                         | Browser error reporting  | Public by design; separate from the server DSN on purpose        |

**Degradation behaviour worth knowing:** the three routes that used to fabricate "demo" output now 503 and name the missing variable, so a misconfigured chat, web search or research call says so. `/api/chat` joined them: without `QDRANT_URL` or an embeddings key it 503s naming the variable, because the raw-text fallback that used to cover for them is gone. One quiet one remains: no `ELEVENLABS_API_KEY` yields a script with no audio. This is why §0.3 verification matters.

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

**Update 2026-08-20:** the §12 Phase 2 code is done — one API error envelope (§6.5), Server-Component auth shells (§6.7), the last two god components split (§6.2), embedding and prompt caching (§8), a draggable split (§9.3), the dashboard's responsive pass (§9.1), DNS rebinding closed with a pinned connection (§3.6), and route, cascade and end-to-end tests plus prettier, CONTRIBUTING and source-map upload (§10). **Still nothing exercised at runtime.**

> **Update 2026-08-18:** Phase 0's code is complete — a byte quota closes §3.5, so the ceiling is size rather than 25 × 50 × 10 MB. Clerk 7 and TypeScript 7 landed (§5.7, and `bun run lint` no longer runs — see CLAUDE.md trap 8). `sources-panel.tsx` is split (§6.2), uploads run three at a time and list reads come off sorted indexes (§8), sources say when they never indexed and can be renamed and filtered (§9.6), errors reach Sentry and LLM spend reaches Helicone (§10), and retrieval has an eval harness plus query rewriting (§7). **Still nothing exercised at runtime.**

> **Update 2026-07-30, later:** `/api/audio-overview` closed the same hole `/api/chat` had — ownership check plus server-side source loading (was §4.7). **Demo mode is deleted**, so a missing key is a 503 that names it rather than fabricated output (was §6.6). The podcast script is single-narrator, matching the one voice that reads it (was §4.4). Accessible names, keyboard paths and `prefers-reduced-motion` landed (§9.4 now covers only focus management and an actual audit).

### Scorecard

| Area               | Grade  | One-line verdict                                                                                                                                                                                                      |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature breadth    | **A−** | Ambitious and mostly delivered                                                                                                                                                                                        |
| Security           | **B+** | IDOR closed, routes check ownership behind one wrapper, rate limits and a byte quota in place, webhook deliveries applied once, SSRF closed down to the pinned connection. Unproven at runtime                        |
| Data integrity     | **B−** | Deletes cascade and retry; audio persists and is narrated in full. Unproven at runtime                                                                                                                                |
| Dependency health  | **A−** | Everything on latest (Clerk 7, TypeScript 7, Qdrant 1.19); Dependabot watches it now. One upstream blocker left, and it costs the lint run (§5.7)                                                                     |
| RAG quality        | **C+** | Query rewriting, context-scaled `k` and an eval harness to measure with; still no reranking and no hybrid search (§7)                                                                                                 |
| Code quality       | **A−** | Every god component is split (`components/sources/*`, `components/chat/*`, `components/dashboard/*`), one API wrapper and one error envelope, prettier enforced in CI. `console.*` and `any` effectively zero         |
| Testing / CI       | **C+** | 15 files, 88 cases — including the chat route and the cascade path — plus Playwright configured. Still no `next build` or E2E in CI (both need a Clerk key), and the eslint step cannot pass                          |
| Performance / cost | **B**  | Sorted indexes, a bounded transcript read, parallel uploads, streamed answers, an embedding cache and a cacheable system prompt. The 1 MB row ceiling is the one left (§8)                                            |
| Mobile / a11y      | **B**  | Both pages responsive, row actions reachable on touch, panels draggable above `md`. Accessible names, keyboard paths, reduced-motion and dialog focus management are in; an `axe` or screen-reader pass is not (§9.4) |

### The 3 things to do this week

1. **Set the four Convex-side env vars and confirm `ctx.auth.getUserIdentity()` is non-null** (§3.1). Everything below assumes this, and nothing works without it
2. **Register the Clerk webhook** — until it exists, no `users` row is ever created and new signups cannot use the app (§3.1)
3. **Confirm embeddings actually produce vectors** in `docsy_documents_v2` after the SDK swap, and re-upload anything indexed before it (§5.1). The raw-text fallback is gone, so a dead pipeline now means every answer is "not in your sources" — loud, but it makes this item blocking rather than optional

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

⚠️ **None of it has run.** Three things must be set on the _Convex deployment_ — not `.env.local`, Convex functions read their own environment:

```bash
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your>.clerk.accounts.dev
bunx convex env set CLERK_WEBHOOK_SECRET whsec_...
bunx convex env set QDRANT_URL https://...      # §4.1 vector cascade
bunx convex env set QDRANT_API_KEY ...          # §4.1 vector cascade
```

Plus, in the Clerk Dashboard: a JWT template named exactly `convex` (`convex/auth.config.ts` pins `applicationID: "convex"`), and a webhook pointed at `https://<deployment>.convex.site/clerk-webhook` — note `.site`, not `.cloud` — subscribed to `user.created`, `user.updated`, `user.deleted`.

**Each has a distinct silent failure, which is why they are worth checking individually:**

| Missing                   | Symptom                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `CLERK_JWT_ISSUER_DOMAIN` | `getUserIdentity()` null everywhere; queries return empty, mutations throw `Unauthenticated`. Looks like "logged out"              |
| `convex` JWT template     | Identical to the above, _plus_ every `/api/search`, `/api/embeddings`, `/api/chat` call 403s — `lib/convex-server.ts` fails closed |
| Webhook not registered    | No `users` row is ever created. Every mutation throws "User not provisioned". **New signups cannot use the app at all**            |
| `CLERK_WEBHOOK_SECRET`    | Webhook returns 500, same outcome as above                                                                                         |
| `QDRANT_URL` on Convex    | Deletes look fine; vectors survive and deleted documents keep appearing as citations (§4.1 all over again)                         |

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

### 3.6 🟡 One thing to preserve when refactoring the routes

- **`/api/research` calls `/api/web-search` server-to-server** and forwards the caller's `cookie` / `authorization` headers to do it. If you refactor either route, keep that forwarding — without it the inner call 401s and research silently returns zero sources.

---

## 4. Correctness & data-integrity bugs

### 4.1 🟡 Vector cascade depends on Convex env

Cascade deletion is complete and server-side: `convex/lib/cascade.ts` is the single path for documents, notebooks and accounts, covering rows, messages, audio overviews, storage files and vectors. A failed purge now retries itself four times over ~2.5 hours before giving up (`PURGE_RETRY_DELAYS_S` in `convex/documents.ts`), so a transient Qdrant outage no longer orphans vectors permanently.

**One operational residual:**

- **`QDRANT_URL` must be set on the Convex deployment** or `purgeVectors` has nothing to talk to; it now retries rather than failing once, but a variable that is missing stays missing, so after the last attempt the vectors survive and deleted documents come back as ghost citations. There is no client fallback (the best-effort `fetch` was deleted deliberately: "never rely on the client to clean up"), and the give-up message is visible in the Convex logs and nowhere else. Retries do not survive a deployment losing its scheduled jobs — a `vectorPurgeQueue` table with a cron sweep is the durable version, worth building only if orphans actually show up.

### 4.2 🟡 Audio generation does not survive the tab closing

The client no longer waits: it creates the row as `pending`, fires the request without awaiting it, and the live query drives the UI. `/api/audio-overview` patches the row through `generating_script` → `synthesizing` (persisting the script at that point, since TTS is the slow, paid, failure-prone half) → `ready` / `script_only` / `failed`. A refresh mid-generation shows the current stage rather than an empty panel, and the stage text replaced the bare spinner.

**What remains:** the work still runs inside a Next request, so **closing the tab aborts it** and leaves the row non-terminal. The client treats a non-terminal row older than 10 minutes as finished, which unblocks regeneration without a backend sweep — but the abandoned request is not resumed, and the cutoff is evaluated at render time, so a row going stale in an already-open panel needs one more render to clear.

**Fix, if strandings show up in practice:** run generation in a Convex action (durable, survives the client entirely) or sweep non-terminal rows on a cron. Neither is worth building before there is evidence the abort actually happens to real users. ⚠️ The action route is not a lift-and-shift: `resolveModel()` leans on Next's fetch cache, which does not exist in the Convex runtime.

### 4.9 🟡 Page numbers: PDFs only

Page numbers now work for PDF uploads — `/api/process-document` joins `result.pages` with `\f` and the existing form-feed detection in `chunkTextWithPositions` does the rest (covered by `lib/qdrant.test.ts`).

**What remains:** every other ingestion path still produces page-less text, which is correct for DOCX/TXT/URL/YouTube but means `pageNumber` is `undefined` there — the UI degrades silently, which is fine. Only revisit if DOCX page attribution is ever wanted; it has no page concept in the extracted stream.

### 4.10 🟡 A scanned PDF is rejected, not kept for later

Failed extraction is now a 422 with a reason ("looks scanned or image-based", "save it as .docx", "no readable text"), surfaced per file in the upload UI. Nothing unreadable reaches Convex or the LLM.

**The deliberate trade-off:** the file is rejected outright rather than stored with `status: "failed"`. Fewer moving parts and better immediate feedback, but a scanned PDF cannot be kept and retried later — which is what OCR support (§11 Tier 3) would want. The per-source status field now exists (`documents.indexStatus`, with a badge that explains itself), so the missing half is smaller than it was: a `status: "failed"` row, a stored file with no text, and a retry action. Still not worth it until OCR is real — a source you can keep but never read is not obviously better than a clear rejection.

### 4.11 🟡 Dead canvas fields survive in the schema

Nothing writes them any more — `updateNotebook` no longer accepts `canvasContent` / `canvasHtml`. `schema.ts:24-26` still defines all three (`canvasLastEditedAt` too), because dropping a field from a Convex schema fails the push while any row still carries a value.

**Fix:** a one-off migration that patches the field out of every `notebooks` row, then delete the definitions. Not worth doing until something else needs the schema touched.

---

## 5. Deprecated, outdated, and dead dependencies

### 5.1 🟠 The embedding swap has never run

`lib/embeddings.ts` is on `@google/genai` + `gemini-embedding-001` at `outputDimensionality: 768`, with document/query task types and retry-with-backoff around each batch. `@google/generative-ai` is uninstalled.

**What remains, and it is not small:**

- **The new vector space is a different space.** `lib/qdrant.ts` writes to `docsy_documents_v2` for that reason (and `convex/documents.ts` purges from the same name — the two constants must stay in step). **Every source indexed before this change has no vectors in the new collection**, so those notebooks retrieve nothing until they are re-uploaded. Delete the old collection from Qdrant once you accept that.
- **Nothing has confirmed the pipeline actually returns vectors.** Upload a fresh document and check the point count in `docsy_documents_v2` directly. The fallback that used to hide an empty index is deleted, so chat will now say "not in your sources" for everything if this is broken — which is a symptom, not a diagnosis. Check Qdrant.

### 5.6 🟡 Two hand-maintained lists remain in the catalogue

The catalogue is fetched from `GET https://openrouter.ai/api/v1/models`, cached an hour by Next's data cache, filtered to free models plus an allowlist, and served to the picker through `/api/models`. `resolveModel()` validates every request against it server-side, so a retired slug or a caller-invented one becomes the default instead of a 400. For the record, when this landed **16 of the 19 hardcoded slugs no longer resolved** — including `DEFAULT_MODEL` and the model `/api/audio-overview` pinned, so both features were dead.

**What still rots, slowly:**

- `PREMIUM_ALLOWLIST` in `lib/openrouter.ts` is hand-written. Dead entries vanish harmlessly (it is intersected with the live list), but a new paid model never appears until someone adds it. Verified live 2026-07-30.

`FALLBACK_MODELS` is no longer a second catalogue — it is one entry derived from `DEFAULT_MODEL`, and a stale slug there costs nothing: if `/api/v1/models` is unreachable then `/chat/completions` almost certainly is too. `Provider` is now the slug prefix rather than a union, so a vendor nobody listed gets its own group, name and colour (`providerInfo()`) instead of collapsing into "Other".

(`/api/chat`'s direct OpenAI / Anthropic fallback branches are gone, along with the `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` vars they read — OpenRouter already fronts every provider.)

### 5.7 🟠 `eslint` is held one major behind, and the lint run is broken

Every dependency is now on latest — Clerk 7, TypeScript 7 and Qdrant client 1.19 landed on 2026-08-18 — with one exception, and one accepted consequence.

| Package  | Pinned    | Latest   | Why it is held                                                                                                                                                                                        |
| -------- | --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint` | `^9.39.5` | `10.8.0` | Blocked upstream. `eslint-config-next` depends on `typescript-eslint@^8`, which peer-requires `eslint ^8.57 \|\| ^9`. On ESLint 10 the lint run dies with `TypeError: Class extends value undefined`. |

**`bun run lint` does not run at all right now**, and that was accepted knowingly when TypeScript 7 landed: TS 7 is the native compiler and ships no JS compiler API, which `typescript-eslint@8` `require()`s, so eslint dies with `TypeError: Cannot read properties of undefined (reading 'Cjs')` before linting a file. `tsc --noEmit` and `bun test` are the signal until `typescript-eslint` supports TS 7. CLAUDE.md trap 8 has the detail; recheck the peer range with `bun outdated`.

---

## 7. RAG quality

The pipeline is `chunk → single dense embedding → cosine top-k → stuff into prompt`, with a score floor (`DEFAULT_SCORE_THRESHOLD = 0.5`, enforced by Qdrant), conversational query rewriting (`lib/query-rewrite.ts`) and a `k` that scales with the model's window (`retrievalLimitFor`, clamped 5–20). What is still missing:

| Gap                              | Impact                                                                                                                                                                   | Fix                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **No reranking**                 | Top-k by cosine includes near-misses; precision suffers most on multi-doc notebooks. This is why `k` is clamped at 20 — more chunks without a reranker buries the answer | Retrieve 20, rerank to 5 with Cohere Rerank or a hosted `bge-reranker-v2`. **Needs a decision: a new paid key and a new failure mode on the chat path**                              |
| **No hybrid search**             | Pure-dense misses exact terms, product names, IDs, acronyms                                                                                                              | Qdrant supports sparse vectors natively — add BM25/SPLADE and fuse with RRF. **Needs a decision: sparse vectors mean collection `_v3` and a full re-index of every existing source** |
| **Naive chunking**               | `chunkSize: 1000` chars, char-based, splits mid-table and mid-code-block                                                                                                 | Structure-aware splitting (markdown headings, PDF paragraph blocks) + token-based sizing                                                                                             |
| **No parent-document retrieval** | Model sees a 1000-char window with no surrounding context                                                                                                                | Embed small chunks, return the enclosing section                                                                                                                                     |
| **No multi-query**               | Single embedding, single recall shot                                                                                                                                     | Generate 3 query variants, union + RRF                                                                                                                                               |
| **No HyDE for sparse notebooks** | A short question against long formal sources embeds poorly                                                                                                               | Draft a hypothetical answer, embed that instead                                                                                                                                      |

**Highest ROI from here, in order:** reranking (biggest single quality jump) → hybrid search → structure-aware chunking.

**Measure every one of them with the harness** — `bun run eval <notebookId>` against `eval/questions.json`, reporting hit@3, hit@20 and MRR (`scripts/eval-retrieval.ts`). Retrieval-only: answer faithfulness still needs a judge model and ground-truth answers, which is a bigger commitment than the thing it grades.

---

## 8. Performance & cost

| Issue                                  | Where                                                                                            | Fix                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One extra completion per follow-up** | `lib/query-rewrite.ts` — a context-dependent question buys a small rewrite call before retrieval | Accepted: 120 max tokens at temperature 0, and only when `needsRewrite()` fires. Watch it in Helicone; if it shows up in the bill, cache rewrites by (question, last turn). |
| **Convex 1 MB document limit**         | Docs store up to 50k chars of `content` inline — fine now, but a hard ceiling                    | Move full text to Convex storage / R2; keep only metadata + a snippet in the row.                                                                                           |

---

## 9. UX and accessibility

### 9.1 🟡 Responsive everywhere, verified nowhere

Both pages have had the pass now — tabs below `md` and a draggable split above it on the notebook page, a stacking heading row and touch-visible row actions on the dashboard, `dvh` units throughout for the iOS toolbar.

**None of it has been opened in a browser.** It was written by reading. Check the tab switch, the composer with the on-screen keyboard up, the model dropdown, the drag handle, and `document-preview.tsx`'s long text column on a real phone.

### 9.4 🟡 Accessibility: written by reading, never observed

Every icon-only control has an accessible name, both dropzones have a keyboard path, spinners announce, the audio scrubber and the citation tooltip work without a mouse, `prefers-reduced-motion` is honoured globally (`app/globals.css`, with `.animate-spin` deliberately exempt), and every modal is a Radix dialog, so focus is trapped and restored.

**What remains:**

- **Nothing has been run through `axe`**, and none of this was checked with a screen reader or by tabbing the app in a browser. The fixes were written by reading. Focus management now comes from Radix in every dialog, which is worth more than the previous hand-rolled overlays, but it has still never been observed working.

---

## 10. Missing engineering infrastructure

| Missing | Recommendation |
| ------- | -------------- |

| **Convex function tests** | `tests/cascade.test.ts` covers the delete path through a hand-rolled `MutationCtx` double, and the pure helpers (`quota`, `rateLimitWindow`) have their own tests — but no _registered_ Convex function is executed by anything. Real coverage needs `convex-test`, which is vitest-only; adding a second runner is the call to make when a mutation's own logic, rather than its helpers, gets complicated enough to warrant it. |
| **`next build` in CI** | `.github/workflows/ci.yml` runs `tsc --noEmit`, `format:check`, `eslint` (expected-fail — CLAUDE.md trap 8) and `bun test`. **`next build` is not in it** — prerendering `/_not-found` needs a real `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; add it as a repo secret and a build step once one exists. The same secret would let the Playwright landing spec run there too. |

The README's **"20+ top-tier AI models"** claim is true again now the catalogue is live (§5.6), and it now names Qdrant, Gemini embeddings, ElevenLabs and Tavily/Serper.

---

## 11. Feature roadmap

### Tier 1 — completes what's already half-built

| Feature                           | Why                                                                                                                                                                                                      | Effort |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Two-voice narration**           | The narration is single-voice, coherent and full-length now. Two voices means one TTS call per speaker turn with alternating voice ids — `lib/tts-chunks.ts` already does the chunk-and-concatenate half | M      |
| **Real PDF viewer for citations** | You render `content.slice()` as plain text; show the actual PDF page with a highlight overlay (`react-pdf`)                                                                                              | M      |
| **Notes / saved answers**         | The removed canvas left Tiptap in `package.json` — either bring it back as "Notes" (pin AI answers, edit, export) or delete the deps. Pick one.                                                          | M      |
| **Document processing status**    | Per-source `pending / processing / ready / failed` with a retry action. The fake "Reprocess Document" button is gone; there is now nothing at all for a source that failed extraction                    | S      |

### Tier 2 — NotebookLM parity

| Feature                                         | Notes                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Study guide / FAQ / timeline / briefing doc** | One-click generation from sources. Cheap to build (prompt + storage), high perceived value.                      |
| **Mind map**                                    | Extract entities + relations → render with React Flow. Very demo-able.                                           |
| **Flashcards & quizzes**                        | Spaced repetition over notebook content — turns Docsy into a study tool, a distinct market from "chat with PDF". |
| **Notebook sharing**                            | Public read-only share links; then invite-based collaboration (Convex makes multiplayer nearly free).            |
| **Inline source-grounded editing**              | Ask a follow-up about a specific highlighted passage.                                                            |
| **Suggested follow-up questions**               | Generate 3 after each answer. ~20 lines, meaningfully improves engagement.                                       |

### Tier 3 — differentiation

| Feature                       | Notes                                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agentic RAG**               | Tool-calling loop: `search_documents`, `search_web`, `read_full_document`. Replaces the manual "go use the Web Search panel" instruction currently baked into the system prompt (`chat/route.ts:144`) — which is a workaround for not having tools. |
| **Cross-notebook search**     | Query the whole library at once.                                                                                                                                                                                                                    |
| **OCR for scanned PDFs**      | Currently a hard failure (§4.10). Tesseract or a vision model. Unlocks a large document class.                                                                                                                                                      |
| **More formats**              | `.pptx`, `.xlsx`, `.csv`, `.epub`, images, audio files (Whisper).                                                                                                                                                                                   |
| **Connectors**                | Google Drive, Notion, Dropbox, Zotero, arXiv, GitHub repos.                                                                                                                                                                                         |
| **Chrome extension**          | "Save to Docsy" from any page — the URL pipeline already exists.                                                                                                                                                                                    |
| **Table & figure extraction** | Preserve tables as markdown instead of flattening them into prose.                                                                                                                                                                                  |
| **Multi-modal RAG**           | Embed page images alongside text so charts and diagrams become answerable.                                                                                                                                                                          |
| **Export**                    | Notebook → PDF/DOCX/Markdown report with citations.                                                                                                                                                                                                 |
| **Usage limits + billing**    | Clerk Billing or Stripe. The hourly caps in `convex/users.ts` stop a runaway; they are not a plan, and nothing meters or charges for what is used.                                                                                                  |
| **Public API + MCP server**   | Let agents query a user's notebooks. Natural fit for this data model.                                                                                                                                                                               |

---

## 12. Prioritized action plan

Every item below has a **"Done when"** criterion. If you can't demonstrate the criterion, the item isn't finished — regardless of how much code changed.

### Phase 0 — Stop the bleeding (this week)

| #   | Task                                                                                                                 | §    | Done when                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1b  | **← START HERE.** Set `CLERK_JWT_ISSUER_DOMAIN` on the Convex deployment, then sign in and confirm identity resolves | §3.1 | A temporary query logging `await ctx.auth.getUserIdentity()` returns non-null; create a notebook, upload a doc, chat, delete — all work |

**Phase 0 exit gate:** you can hand the public Convex URL to a stranger and lose nothing. **All of Phase 0's code is written; nothing has proven it.** Item 1b is the proof.

### Phase 1 — Unbreak (weeks 2–3)

| #   | Task                                                                                                                       | §    | Done when                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | Confirm the new embedding pipeline writes vectors, and re-index pre-swap sources (the migration itself is done)            | §5.1 | A fresh upload produces a non-zero point count in `docsy_documents_v2`, and a question about that document returns a citation from it |
| 11  | Decide whether an aborted generation needs recovering — Convex action or cron sweep (the async status flow itself is done) | §4.2 | Closing the tab mid-generation no longer leaves work unfinished, rather than merely unblocked                                         |

**Phase 1 exit gate:** no silent failure modes left — every broken thing announces itself.

### Phase 2 onward

The remaining phases are lower-risk and less order-dependent, so they're listed without individual gates.

### Phase 2 — Quality (weeks 4–6)

18. `next build` + the Playwright landing spec in CI, once a Clerk key exists as a repo secret — **§10**
19. Move document text out of the row before it meets Convex's 1 MB ceiling — **§8**

### Phase 3 — Make the RAG good (weeks 7–10)

22. Reranking → hybrid search, measuring each against `bun run eval` (the harness and query rewriting are done) — **§7**
23. Structure-aware chunking + parent-document retrieval — **§7**

### Phase 4 — Grow (weeks 11+)

25. Tier 1 features, then Tier 2, then pick 2–3 from Tier 3 to differentiate on.

---

## 13. Quick reference: dependency actions

All dependencies are on latest as of 2026-08-18 except `eslint`, which is blocked upstream (§5.7). `@base-ui/react` and `lucide-react` are gone (§5.3) — radix plus `@hugeicons` is the pair to build on. `@google/generative-ai` has been replaced by `@google/genai` (§5.1), and `@sentry/nextjs` is in (§10).

```bash
# Add — remaining wants
bun add react-resizable-panels              # §9.3 resizable panels
bun add -d @playwright/test prettier        # `bun test` covers the unit layer already

# Then
bun outdated && bun update --latest
```

---

## 14. Closing note

The hard part is done: the product concept works, the ingestion pipeline handles four source types, citations resolve to highlighted passages, and Convex gives you real-time state for free. Nothing in this report requires a rewrite.

What's missing is the boring half — auth that actually authenticates, deletes that actually delete, dependencies someone watches, and tests that catch it when they don't. Phase 0 is roughly two days of work and takes the project from "cannot be shown to anyone" to "safe to demo." Everything after that is optional and ordered by value.

> **2026-07-28:** auth now authenticates — API routes, SSRF, and the Convex data layer are all closed on paper. **The gap has moved from "unwritten" to "unverified":** none of it has been exercised against a running deployment, and Convex auth in particular fails _silently and totally_ if `CLERK_JWT_ISSUER_DOMAIN` is missing. Do that check (§12 item 1b) before writing another line. After it, the remaining Phase 0 work is cost and abuse control, not data exposure.
