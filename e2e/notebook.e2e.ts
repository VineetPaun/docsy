/**
 * The flow that matters: sign in, add a source, ask a question, open a citation.
 *
 * Skipped unless credentials are supplied, because every step needs a real
 * dependency — Clerk for the session, Convex for the notebook, Qdrant plus an
 * embeddings key for retrieval, and OpenRouter for the answer. There is no
 * useful mock of that chain; a version with all of it faked would pass while
 * the app was broken, which is the failure mode this repo already has enough of.
 *
 *   E2E_CLERK_EMAIL=... E2E_CLERK_PASSWORD=... bun run e2e
 */

import path from "node:path";
import { expect, test } from "@playwright/test";

const email = process.env.E2E_CLERK_EMAIL;
const password = process.env.E2E_CLERK_PASSWORD;

test.describe("notebook", () => {
  test.skip(
    !email || !password,
    "Set E2E_CLERK_EMAIL and E2E_CLERK_PASSWORD to run the signed-in flow"
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard");
  });

  test("a source can be added and asked about", async ({ page }) => {
    await page.getByRole("button", { name: /new notebook/i }).click();
    await page.getByLabel(/notebook title/i).fill(`E2E ${Date.now()}`);
    await page.getByRole("button", { name: /^create$/i }).click();

    await page.getByRole("link", { name: /E2E/ }).first().click();
    await page.waitForURL("**/notebook/**");

    // The upload input is hidden behind the Upload button; set the file on it
    // directly rather than driving the OS file picker.
    await page
      .locator('input[type="file"]')
      .setInputFiles(path.join(__dirname, "fixtures", "sample.txt"));

    // Indexing has to finish before the answer can cite anything.
    await expect(page.getByText("sample.txt")).toBeVisible({ timeout: 60_000 });

    await page
      .getByLabel(/ask a question/i)
      .fill("What does the sample say about costs?");
    await page.getByRole("button", { name: /send message/i }).click();

    // Streamed, so the assertion waits on the finished bubble rather than a
    // single response.
    const citation = page.getByRole("button", { name: /open the cited passage/i });
    await expect(citation.first()).toBeVisible({ timeout: 120_000 });

    await citation.first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Escape closes it, and focus returns to the chip — the §9.4 fix.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
