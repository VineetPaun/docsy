# TODO — 2026-07-28

Execution plan for tomorrow. Ordered; later tasks assume earlier ones landed.

**State at end of 2026-07-27:** API routes authenticated, SSRF closed, dead code and dead deps removed, everything on latest except three blocked packages. `bunx tsc --noEmit` clean, `bun run lint` clean, `bun run build` compiles. Nothing committed yet.

**Added 2026-07-28 (small fixes, none of them Task 1):** retrieval score floor, bounded chat history + bounded no-RAG fallback, citation offset drift fixed, `maxDuration` on the four slow routes, parallel research sub-searches, dead OpenAI/Anthropic branches deleted, every `console.*` stripped, `tsconfig` → ES2022. `tsc` and `lint` still clean. Still nothing committed.

**The one thing that matters tomorrow is Task 1.** Everything else is small. If the day goes sideways, finish Task 1 and stop.

Background and rationale for every item: [AUDIT.md](AUDIT.md). This file is the *doing* list; AUDIT.md is the *why*.

---

## Pre-flight (~15 min)

- [ ] `git checkout -b fix/convex-auth` — Task 1 touches 30+ files, don't do it on `main`
- [ ] **Commit yesterday's work first**, so today's diff is readable:
      `git add -A && git commit` (API auth + SSRF + dep updates)
      ⚠️ `.gitignore` has an uncommitted `*.md` line, so `AUDIT.md` / `CLAUDE.md` / this file **will not commit**. Decide: drop that line, or `git add -f` the docs.
- [ ] Create `.env.local` with the 14 vars from AUDIT.md §0.5 — **`bun run build` cannot finish without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`**, and none of today's acceptance tests can run without a working env
- [ ] Add `CLERK_JWT_ISSUER_DOMAIN` (from Clerk Dashboard → JWT Templates → Convex). New var, doesn't exist yet, Task 1 needs it
- [ ] `bunx convex dev` in one terminal, `bun dev` in another
- [ ] Sanity: sign in, open a notebook, send one chat message. Confirm the baseline works *before* changing auth

---

## Task 1 — Convex auth (AUDIT.md §3.1) 🔴

**The whole database is currently readable and writable by any anonymous visitor.** Every Convex function takes `clerkId` as a client-supplied argument and trusts it. Ownership checks like `notebook.userId !== user._id` are worthless because the attacker picks which user they are.

Do the steps in this order — out of order and the app breaks mid-refactor.

### 1a. Wire the auth channel

- [ ] New `convex/auth.config.ts`:
      ```ts
      export default {
        providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }],
      };
      ```
- [ ] `components/providers/convex-provider.tsx` — swap `ConvexProvider` → `ConvexProviderWithClerk` from `convex/react-clerk`, passing `useAuth` from `@clerk/nextjs`
- [ ] Verify tokens actually arrive before refactoring anything: add a temporary query that logs `await ctx.auth.getUserIdentity()` and confirm it is non-null. **If this returns null, stop and fix it** — everything below depends on it

*(Compatibility checked: `convex@1.42.3`'s `react-clerk` peer-requires `@clerk/clerk-react ^5`, and `@clerk/nextjs@6.39.6` ships `5.61.9`. This works today. See the Clerk v7 note under Decisions.)*

### 1b. Shared helper

- [ ] New `convex/lib/auth.ts`:
      ```ts
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

### 1c. Refactor the 23 functions

Drop the `clerkId` arg, replace the lookup with `requireUser(ctx)`. Run `bunx tsc --noEmit` after each file.

While you are in each file: delete the `/* eslint-disable @typescript-eslint/no-explicit-any */` header and the `: any` annotations (AUDIT.md §6.1). Convex infers `ctx` and `args` from the validators — this is a find-and-delete, not a rewrite, and it is free to do now.

- [ ] `convex/notebooks.ts` (6) — `getNotebooks:6` `getNotebook:29` `createNotebook:52` `updateNotebook:81` `deleteNotebook:120` `getNotebookCount:153`
- [ ] `convex/documents.ts` (6) — `getDocuments:6` `getDocument:35` `createDocument:58` `updateDocumentContent:109` `deleteDocument:136` `getDocumentCount:167`
- [ ] `convex/audioOverviews.ts` (4) — `getAudioOverview:6` `createAudioOverview:39` `updateAudioOverview:94` `deleteAudioOverview:134`
- [ ] `convex/messages.ts` (3) — `getMessages:6` `addMessage:35` `clearMessages:76`
- [ ] `convex/users.ts` (4) — see special cases below

**The two functions with no `clerkId` at all — handle differently:**

- [ ] `documents.ts:189 generateUploadUrl` — takes no args. Add `requireUser(ctx)`. Right now *any* anonymous caller can mint upload URLs into your storage
- [ ] `documents.ts:197 getStorageUrl` — takes only `storageId`, **no ownership check whatsoever**. Must confirm the caller owns a document referencing that `storageId` before returning a signed URL

**`convex/users.ts` special cases:**

- [ ] `getUserByClerkId:47` and `getCurrentUser:58` have **byte-identical bodies** — keep one, delete the other
- [ ] `upsertUser:6` — delete entirely, the webhook in Task 3 replaces it. Its `clerkId` is legitimately external (it comes *from* Clerk), which is exactly why it must move server-to-server
- [ ] `deleteUser:69` — must never be callable from a browser. Webhook only

### 1d. Client call sites

27 `clerkId` occurrences across 6 files. Remove the args, and the `clerkId: string` props from the component interfaces.

- [ ] `components/sources-panel.tsx` (9) — also drop `clerkId` from `SourcesPanelProps`
- [ ] `components/notebook-chat.tsx` (6) — also drop it from its props interface
- [ ] `app/notebook/[id]/page.tsx` (6) — includes two `clerkId={user.id}` JSX props
- [ ] `app/dashboard/page.tsx` (3)
- [ ] `components/landing/document-dropzone.tsx` (2) — **live code**, the landing page creates notebooks and documents
- [ ] `components/user-sync.tsx` (1) — delete the whole component in Task 3

### Done when

- [ ] `grep -rn "clerkId" app components` returns **zero** hits
- [ ] In a browser console on any origin:
      ```js
      const c = new ConvexClient("https://<your>.convex.cloud");
      await c.query("notebooks:getNotebooks", { clerkId: "user_someone_else" });
      ```
      **throws**, and the `clerkId` arg no longer exists in the signature
- [ ] `bunx tsc --noEmit` and `bun run lint` clean
- [ ] Manually: sign in, create a notebook, upload a doc, chat, delete. All still work

---

## Task 2 — Ownership checks on the API routes (AUDIT.md §3.6) 🟠

*Depends on Task 1 — until Convex authenticates, there is no trustworthy way to resolve an owner.*

Every route requires a session, but none checks that the caller owns the `notebookId` it was handed. Any signed-in user can still read another user's chunks or wipe their vectors.

- [ ] `/api/search` — verify ownership of `notebookId` before hitting Qdrant. There is a `TODO` marking the spot in `app/api/search/route.ts`
- [ ] `POST /api/embeddings` — same, before writing vectors
- [ ] `DELETE /api/embeddings?documentId=X` — verify ownership of the *document* before deleting its chunks
- [ ] Done when: User A, signed in, cannot read or delete User B's chunks by passing their `notebookId` / `documentId`

---

## Task 3 — Clerk webhook replaces `UserSync` (AUDIT.md §3.1) 🔴

*Depends on Task 1.*

`upsertUser` is currently an unauthenticated mutation, so anyone can forge an arbitrary user row.

- [ ] New `convex/http.ts` handling `user.created` / `user.updated` / `user.deleted`
- [ ] **Verify the Svix signature.** An unverified webhook endpoint is the same hole in a different place
- [ ] Register the endpoint in the Clerk Dashboard
- [ ] Delete `components/user-sync.tsx` and the `upsertUser` mutation; remove the `<UserSync />` render
- [ ] Done when: a new signup creates a `users` row with no browser involvement, and an unsigned POST to the webhook is rejected

---

## Task 4 — Landing page copy (AUDIT.md §12 Phase 0, item 6) 🟡

- [ ] `components/landing/features.tsx:81` claims "Private & secure". After Tasks 1–3 that is finally true — re-read it and make sure the wording matches what actually ships

---

## Phase 0 exit gate

> You can hand the public Convex URL to a stranger and lose nothing.

Tasks 1–3 are what this gate turns on. Rate limiting (§3.4) and magic-byte sniffing (§3.5) are still open afterwards — they are cost and abuse controls, not data exposure, so they can wait for day 2.

---

## If there is time left

- [ ] **Test whether embeddings still work at all** (AUDIT.md §5.1). `text-embedding-004` was scheduled for shutdown ~January 2026 and it is now July. Upload a fresh document and check Qdrant's point count is non-zero. **If it is zero, RAG has been silently dead for months** and every "answer" has come from the full-document fallback. This is a 5-minute check with a large blast radius — arguably do it during pre-flight.
      ⚠️ Retrieval now applies a 0.5 cosine score floor, so "no citations" no longer distinguishes *dead pipeline* from *nothing relevant*. Check Qdrant's point count directly, not the chat output
- [ ] **Page numbers in citations** (AUDIT.md §4.9). Now cheap: `pdf-parse` v2's `getText()` returns `result.pages` as `{ num, text }[]`. Thread it `/api/process-document` → `/api/embeddings` → `chunkTextWithPositions`. Done when a citation from page 4 displays "Page 4"

---

## Decisions needed (not code)

**1. Clerk v6 → v7.** Held at `6.39.6`; latest is `7.6.1`. v7 removes `SignedIn` / `SignedOut` and replaces `useSignIn` / `useSignUp` with a signals API — 23 type errors across 8 files, ~1,140 lines of hand-rolled auth UI (`sign-in`, `sign-up`, `sign-up/verify`, `forgot-password`, `reset-password`, `sso-callback`, `landing/cta.tsx`, `landing/navbar.tsx`).

- **Do it after Task 1, never during.** Both touch auth, and debugging two auth changes at once is miserable
- ⚠️ Before committing to it, check that `ConvexProviderWithClerk` still works. `convex@1.42.3` peer-requires `@clerk/clerk-react ^5` or `@clerk/react ^6.4.3`; if Clerk v7 ships `@clerk/react@7`, Convex may not declare support yet. **Verify this first** — if it doesn't hold, v7 is blocked until Convex updates, regardless of the UI work
- Reasonable call: stay on v6 for now. v6 is supported, and the migration buys no feature you currently need

**2. `eslint` 10 and `typescript` 7** — blocked upstream, nothing to decide. `eslint-config-next@16.2.12` depends on `typescript-eslint@8`, which peer-caps `eslint ^9` and `typescript <6`. Both fail the lint run today. Recheck with `bun outdated` when Next ships a config on `typescript-eslint@9`; they will likely clear together.

**3. `@google/generative-ai`** — `0.24.1` *is* the latest published version. Updating cannot fix it; only the swap to `@google/genai` + `gemini-embedding-001` at `outputDimensionality: 768` will (AUDIT.md §5.1). Tied to the embeddings test above.

---

## Not tomorrow

Backlog lives in [AUDIT.md](AUDIT.md) §12 — Phase 1 onward: cascade deletes (§4.1), audio persistence (§4.2), bounded chat history (§4.6), `.env.example` (§10), then streaming, mobile layout, and RAG quality.

Per CLAUDE.md: **when an item here is fully done, delete the line** — no ✅, no strikethrough. Same rule as AUDIT.md.
