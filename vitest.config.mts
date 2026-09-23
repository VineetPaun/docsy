/**
 * The second test runner, for Convex functions only (AUDIT.md §10).
 *
 * `bun test` covers every pure helper in `lib/` and the route handlers, but a
 * registered Convex mutation cannot run under it: `convex-test` needs a Vite
 * module graph (`import.meta.glob`) and an edge-runtime VM to execute the
 * function the way the deployment does, with the real schema, the real
 * argument validators and a real `ctx.auth`.
 *
 * That is worth a second runner here, because the checks those functions carry
 * are the ones that matter most — ownership on every read and write, the source
 * and notebook caps, and the storage quota. All of them were previously
 * verified by reading the code.
 *
 * Specs are `*.vitest.ts` so `bun test`, which claims `*.test.ts` anywhere in
 * the tree, does not try to run them and fail on `import.meta.glob`.
 *
 *   bun run test:convex
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/convex/**/*.vitest.ts"],
    // convex-test executes functions in a V8 isolate that mimics the Convex
    // runtime — not Node, and not a browser.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
