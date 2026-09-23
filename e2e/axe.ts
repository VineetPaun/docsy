/**
 * An `axe` pass over a live page (AUDIT.md §9.4).
 *
 * The accessibility work in this repo was written by reading — labels, focus
 * order, `aria-live`, dialog semantics — and never once observed in a browser.
 * This is the half of that gap a machine can close. The other half (an actual
 * screen reader) stays manual; axe finds missing names, bad contrast and
 * broken landmark structure, not whether an answer reads sensibly aloud.
 *
 * ponytail: `axe-core` injected by hand rather than `@axe-core/playwright`.
 * The wrapper is a script tag and one `evaluate` call, which is what this is,
 * and the wrapper's package manifest does not resolve on every network.
 */

import { expect, type Page } from "@playwright/test";

/**
 * The bundled, already-minified axe build.
 *
 * `require.resolve`, not `import.meta.url`: Playwright transpiles specs to
 * CommonJS, where `import.meta` is a syntax error.
 */
const AXE_SOURCE = require.resolve("axe-core/axe.min.js");

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: string[] }[];
}

/**
 * Run axe against the current page and fail with a readable list.
 *
 * WCAG 2 A and AA only. The other rule packs (best-practice, experimental)
 * report opinions as violations, and a suite that cries wolf gets skipped.
 *
 * @param exclude CSS selectors to leave out — third-party widgets whose markup
 *                is not ours to fix.
 */
export async function expectNoAxeViolations(
  page: Page,
  exclude: string[] = []
): Promise<void> {
  await page.addScriptTag({ path: AXE_SOURCE });

  const violations = (await page.evaluate(
    async ([excluded]) => {
      const context =
        excluded.length > 0
          ? { include: [["body"]], exclude: excluded.map((s) => [s]) }
          : "body";

      // @ts-expect-error — axe attaches itself to window via the script tag.
      const results = await window.axe.run(context, {
        runOnly: ["wcag2a", "wcag2aa"],
      });

      return results.violations;
    },
    [exclude]
  )) as AxeViolation[];

  // One line per violation with the offending selector, so a failure says what
  // to fix rather than "1 violation".
  const summary = violations
    .map(
      (v) =>
        `${v.impact ?? "unknown"}: ${v.id} — ${v.help}\n    ${v.nodes
          .flatMap((n) => n.target)
          .join("\n    ")}`
    )
    .join("\n");

  expect(summary, `axe found ${violations.length} violation(s)`).toBe("");
}
