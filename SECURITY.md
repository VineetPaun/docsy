# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private reporting instead: **Security → Advisories → Report a
vulnerability** on this repository. That channel is private until a fix ships.

Please include:

- what an attacker can do, and what access they need to start
- the affected route, Convex function or file
- reproduction steps, or a request that demonstrates it

You will get an acknowledgement within 7 days. This is a personal project, so
there is no bounty and no SLA beyond that.

## Scope

In scope: authentication and authorisation on `app/api/*` and `convex/*`,
cross-account data access, SSRF through user-supplied URLs, prompt injection
that changes what the server _does_ (rather than what the model says), and
secret exposure.

Out of scope: rate limits being tunable, an LLM producing a wrong or
low-quality answer, findings that require an already-compromised account, and
automated scanner output with no demonstrated impact.

## What is already known

Please check this list before reporting. Each of these is a documented,
accepted limitation rather than an undiscovered bug, and each names the file
that implements the decision.

- **Prompt injection beyond source fencing.** Source text and web snippets are
  wrapped in a `<source_data>` block by `lib/prompt-guard.ts`, and a source
  cannot escape that fence. Nothing stops a source from _influencing_ the
  answer's wording. This stays a low-impact residual only for as long as the
  model has no tools; giving it any will change that.
- **Client-asserted index status.** `documents.setIndexStatus` is written by
  the browser after its own `/api/embeddings` call. A caller can mislabel its
  own sources and nobody else's, so it is UI feedback, not a security claim.
- **Fixed-window rate limits.** `convex/users.ts` allows a burst at a window
  boundary — up to `2 × limit` across two adjacent windows. The budgets
  themselves are server-side and not caller-supplied.
- **Incremental storage accounting.** `convex/lib/quota.ts` maintains
  `users.storageBytes` incrementally rather than recomputing it. A write path
  that forgets the helpers makes the counter drift; the failure mode is a wrong
  quota, not data loss or cross-account access.
- **Orphaned vectors after a sustained Qdrant outage.** `purgeVectors` retries
  a failed delete four times over ~2.5 hours and then gives up with a log line.
  Vectors that survive that window stay in Qdrant until purged by hand.

Fixed, so please do not re-report: DNS rebinding in `lib/url-guard.ts`. Every
user-supplied URL is resolved, validated and then **pinned** for the
connection, and each redirect hop is re-validated, so the name cannot resolve
to something else between the check and the connect.

## Handling secrets

Every credential this app uses lives in an environment variable and none are
committed. `.env.example` lists them; four of them live on the Convex
deployment rather than in `.env.local`. If you believe a key has leaked, report
it through the channel above and it will be rotated.
