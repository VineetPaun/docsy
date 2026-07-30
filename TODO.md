# TODO — 2026-07-28

Execution plan for tomorrow. Ordered; later tasks assume earlier ones landed.

**State at end of 2026-07-27:** API routes authenticated, SSRF closed, dead code and dead deps removed, everything on latest except three blocked packages. `bunx tsc --noEmit` clean, `bun run lint` clean, `bun run build` compiles. Nothing committed yet.

**Added 2026-07-28:** retrieval score floor, bounded chat history + bounded no-RAG fallback, citation offset drift fixed, `maxDuration` on the four slow routes, parallel research sub-searches, dead OpenAI/Anthropic branches deleted, every `console.*` stripped, `tsconfig` → ES2022 — **and Convex auth (Task 1) written in full**: `clerkId` is gone from every function signature and call site, `: any` is gone from `convex/`. `tsc` and `lint` clean. Still nothing committed.

**⚠️ Task 1 is written but unproven.** It cannot work until `CLERK_JWT_ISSUER_DOMAIN` is set on the *Convex deployment*, and the failure mode is silent: every query returns empty and every mutation throws `Unauthenticated`, which looks like "the app is broken" rather than "a variable is missing". Pre-flight below is now the critical path.

**Added 2026-07-29:** route ownership checks (`lib/convex-server.ts`); false landing-page privacy claim removed; PDF page numbers working; `.env.example`; **Clerk webhook replaces `UserSync`** (`convex/http.ts`, Svix-verified); **complete cascade deletes** (`convex/lib/cascade.ts` + `internal.documents.purgeVectors`); **magic-byte file sniffing** (`lib/file-type.ts`) + a 50-source cap per notebook. `tsc` clean, `lint` clean, `bun test` 6/6. Still unexercised at runtime, still nothing committed.

**Added later on 2026-07-29:** GitHub Actions CI (`tsc`/`lint`/`bun test`); extraction failures return 422 with a reason instead of storing a magic string; **audio overviews persist to Convex storage** (no more 4 MB base64, survives refresh); **the notebook page is responsive** (shadcn `Tabs` below `md`, `h-dvh`, phone-safe model dropdown and citation dialog).

**Added 2026-07-30:** `/api/chat` takes `documentIds` and loads source text from Convex itself (no more full documents in the request body), and the sources-panel checkboxes now filter retrieval; **per-user rate limiting** on `/api/chat`, `/api/research`, `/api/audio-overview` (`lib/rate-limit.ts` + a `rateLimits` Convex table — no new service, no new env var). `bun test` 11/11.

**Added later on 2026-07-30:** `/api/audio-overview` checks notebook ownership and reads its sources from Convex (the last route trusting body text); **demo mode deleted** — chat, web search and research return 503 naming the missing key instead of fake output; the podcast prompt is single-narrator, since one voice reads it; canvas args gone from `updateNotebook`; **a11y pass** — accessible names on every icon-only control, keyboard path for the landing dropzone, keyboard seeking on the audio scrubber, focus-openable citation tooltip, `role="status"` spinners, global `prefers-reduced-motion`. `bun run lint` clean, `bun test` 11/11.

**Phase 0 code is now complete apart from the storage quota (§3.5).** Everything written since 2026-07-27 is unproven.

⚠️ **The config surface grew.** Four env vars on the *Convex deployment* and a registered webhook, each with a different silent failure — AUDIT.md §3.1 has the symptom table. Two are new today:
- no webhook → **no `users` row is ever created; new signups cannot use the app at all**
- no `QDRANT_URL` on Convex → deletes look fine but vectors survive, so deleted docs keep appearing as citations

Background and rationale for every item: [AUDIT.md](AUDIT.md). This file is the *doing* list; AUDIT.md is the *why*.

---

## Pre-flight — now the critical path 🔴

- [ ] `git checkout -b fix/convex-auth` — the uncommitted diff touches 30+ files, don't land it on `main`
- [ ] **Commit the work so far**, so the auth change is reviewable on its own
- [ ] `cp .env.example .env.local` and fill it in — **`bun run build` cannot finish without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`**, and none of the acceptance tests below can run without a working env
- [ ] In the Clerk Dashboard, create the **`convex` JWT template** if it does not exist. `convex/auth.config.ts` pins `applicationID: "convex"`, which must match the token's `aud` claim — a differently-named template reads as anonymous. `lib/convex-server.ts` needs the same template, and fails closed without it (403 on search/embed/chat)
- [ ] **Set all four vars on the Convex deployment**, not in `.env.local` — Convex functions read their own env:
      ```bash
      bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your>.clerk.accounts.dev
      bunx convex env set CLERK_WEBHOOK_SECRET whsec_...   # from the Clerk webhook page
      bunx convex env set QDRANT_URL https://...           # vector cascade on delete
      bunx convex env set QDRANT_API_KEY ...
      ```
- [ ] **Register the Clerk webhook**: Dashboard → Webhooks → endpoint `https://<deployment>.convex.site/clerk-webhook` (`.site`, **not** `.cloud`), events `user.created` / `user.updated` / `user.deleted`. Copy the signing secret into the command above.
      ⚠️ Nothing else creates `users` rows now. Skip this and every mutation throws "User not provisioned"
- [ ] `bunx convex dev` in one terminal, `bun dev` in another. `convex dev` also regenerates `convex/_generated/` — needed for `internal.documents.purgeVectors` and the webhook's `internal.users.*` references
- [ ] **Confirm identity arrives.** Add a throwaway query that returns `await ctx.auth.getUserIdentity()` and call it while signed in. **If it is null, stop and fix that** — everything below fails in exactly the same way, so debugging anything else first is wasted time
- [ ] Then the real smoke test: sign in, create a notebook, upload a doc, send a chat message, delete the doc, delete the notebook. All six must work
- [ ] **Look at the notebook page on a real phone.** The responsive pass was written by reading, not by looking: check the Sources/Chat tab switch, the composer with the on-screen keyboard open, and the model dropdown
- [ ] **Generate an audio overview, then hard-refresh** — it must still play (it now comes from Convex storage, not memory). It also reads its sources from Convex and checks ownership now, so **without the `convex` JWT template this route 403s** instead of narrating
- [ ] **Tab through the notebook page with no mouse** — every icon button should announce a name, the citation `[1]` chips should open their preview on focus and close on Escape, and the audio scrubber should seek with the arrow keys. Written by reading; never run through `axe` or a screen reader
- [ ] **Verify the new webhook + cascade paths specifically:**
      - a fresh signup produces a `users` row with no browser involvement
      - `curl -X POST https://<deployment>.convex.site/clerk-webhook -d '{}'` → 400, not 200
      - after deleting a document, its Qdrant point count drops to zero (check Qdrant directly — a stale vector is invisible from the UI until it shows up as a ghost citation)
      - a `.exe` renamed `report.pdf` is rejected with "Unsupported or unrecognised file"
      - send 6 audio-overview requests in an hour — the 6th returns 429 with a `Retry-After` header, and a `rateLimits` row exists for your user. The `convex` JWT template must be in place or every guarded route 503s instead (the limiter fails closed)

---

## Phase 0 exit gate

> You can hand the public Convex URL to a stranger and lose nothing.

The code for this is written. **Pre-flight is what turns it on** — a missing Convex env var means the app is broken, not that it is insecure, but you cannot tell the difference from the outside. A per-user storage quota (§3.5) stays open afterwards — a cost control, not data exposure.

---

## If there is time left

- [ ] **Test whether embeddings still work at all** (AUDIT.md §5.1). `text-embedding-004` was scheduled for shutdown ~January 2026 and it is now July. Upload a fresh document and check Qdrant's point count is non-zero. **If it is zero, RAG has been silently dead for months** and every "answer" has come from the full-document fallback. This is a 5-minute check with a large blast radius — arguably do it during pre-flight.
      ⚠️ Retrieval now applies a 0.5 cosine score floor, so "no citations" no longer distinguishes *dead pipeline* from *nothing relevant*. Check Qdrant's point count directly, not the chat output

---

## Decisions needed (not code)

**1. Clerk v6 → v7.** Held at `6.39.6`; latest is `7.6.1`. v7 removes `SignedIn` / `SignedOut` and replaces `useSignIn` / `useSignUp` with a signals API — 23 type errors across 8 files, ~1,140 lines of hand-rolled auth UI (`sign-in`, `sign-up`, `sign-up/verify`, `forgot-password`, `reset-password`, `sso-callback`, `landing/cta.tsx`, `landing/navbar.tsx`).

- **Do it only once the Convex auth above is proven working.** Both touch auth, and debugging two auth changes at once is miserable
- ⚠️ `ConvexProviderWithClerk` is now load-bearing — the whole data layer goes anonymous if it breaks. `convex@1.42.3` peer-requires `@clerk/clerk-react ^5` or `@clerk/react ^6.4.3`; if Clerk v7 ships `@clerk/react@7`, Convex may not declare support yet. **Verify this first** — if it doesn't hold, v7 is blocked until Convex updates, regardless of the UI work
- Reasonable call: stay on v6 for now. v6 is supported, and the migration buys no feature you currently need

**2. `eslint` 10 and `typescript` 7** — blocked upstream, nothing to decide. `eslint-config-next@16.2.12` depends on `typescript-eslint@8`, which peer-caps `eslint ^9` and `typescript <6`. Both fail the lint run today. Recheck with `bun outdated` when Next ships a config on `typescript-eslint@9`; they will likely clear together.

**3. `@google/generative-ai`** — `0.24.1` *is* the latest published version. Updating cannot fix it; only the swap to `@google/genai` + `gemini-embedding-001` at `outputDimensionality: 768` will (AUDIT.md §5.1). Tied to the embeddings test above.

---

## Not tomorrow

Backlog lives in [AUDIT.md](AUDIT.md) §12 — Phase 1 onward: audio persistence (§4.2), durable retry for the vector purge (§4.1), env validation + CI (§10), then streaming, mobile layout, and RAG quality.

Per CLAUDE.md: **when an item here is fully done, delete the line** — no ✅, no strikethrough. Same rule as AUDIT.md.
