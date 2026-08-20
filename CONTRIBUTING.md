# Contributing to Docsy

`CLAUDE.md` is the orientation file — read it first, whether you are a person or
an agent. It carries the traps that cause the wrong change to look right. This
file is the process around them.

## Setup

```bash
bun install
cp .env.example .env.local     # fill it in; the file says what breaks without each
bunx convex dev                # terminal 1 — backend + codegen. Required
bun dev                        # terminal 2 — Next.js on :3000
```

⚠️ Four variables live on the **Convex deployment**, not in `.env.local`
(`bunx convex env set …`), and a registered Clerk webhook is not optional —
without it no `users` row is ever created and nobody can use the app.
`.env.example` has the symptom table for each.

## Checks

```bash
bunx tsc --noEmit    # must be clean
bun test             # must be green
bun run format       # prettier, before you commit
bun run eval <id>    # only if you touched retrieval
```

`bun run lint` **cannot run right now** and that is not your change: TypeScript 7
ships no JS compiler API, which `typescript-eslint@8` requires. CI keeps the step
so the failure stays visible; treat `tsc` and `bun test` as the signal.
CLAUDE.md trap 8 has the detail.

## House rules

- **Build UI from shadcn.** Check `components/ui/` first, then the registry
  (`bunx shadcn@latest add <name>`). Hand-write a component only when there is
  genuinely no equivalent, and say so when you do.
- **Comment the why, not the what.** Every non-obvious decision in this codebase
  carries a comment explaining what it prevents. Keep that up — most of the
  traps here were re-introduced at least once by someone who could not see why
  the code was odd.
- **Mark deliberate shortcuts** with a `ponytail:` comment naming the ceiling
  and the upgrade path, so the next person knows it was a choice.
- **No `console.*`** in shipped code. Errors reach Sentry; the routes return
  generic messages on purpose.
- **Never take a user id as an argument in Convex.** Identity comes from the
  verified Clerk JWT via `convex/lib/auth.ts`. This was the repo's worst bug.
- **Every API route goes through `withApiHandler`** (`lib/api-handler.ts`), and
  any route handed an id from the request body also checks ownership.

## Docs are part of the change

`AUDIT.md`, `ROADMAP.md` and `TODO.md` describe **outstanding** work only.

- A finding that is fully fixed is **deleted**, not ticked. No ✅, no
  strikethrough, no "DONE" row.
- A partly fixed finding is **rewritten** to describe only what remains.
- Section numbers are never renumbered — a gap means something was closed.
- Add one line to the changelog at the top of `AUDIT.md` so nobody re-audits it
  as a fresh finding.

## Pull requests

Small and self-contained. Say what changed and, more usefully, why the obvious
alternative was not chosen. If you touched retrieval, ingestion or prompts,
verify it end to end with a real upload and say so — unit tests here cover pure
functions, and AI failures are silent.

## Security

Do not open a public issue for a vulnerability. `SECURITY.md` has the private
channel.
