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

`AUDIT.md` is a public audit of this codebase and records outstanding issues
along with the ones already fixed. Please check it before reporting — the known
residuals (DNS rebinding in `lib/url-guard.ts` §3.6, prompt-injection
mitigations beyond source fencing in `ROADMAP.md` §3.4) are documented, not
undiscovered.

## Handling secrets

Every credential this app uses lives in an environment variable and none are
committed. `.env.example` lists them; four of them live on the Convex
deployment rather than in `.env.local`. If you believe a key has leaked, report
it through the channel above and it will be rotated.
