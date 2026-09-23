/**
 * The `axe` pass (AUDIT.md §9.4).
 *
 * Runs under both Playwright projects, so every page is audited at desktop and
 * at iPhone width — the responsive work in §9.1 was written by reading too.
 *
 * The landing page needs nothing but a booted app. The dashboard and the
 * notebook page need a real session, so they skip unless credentials are
 * supplied, exactly like `notebook.e2e.ts`.
 */

import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "./axe";

const email = process.env.E2E_CLERK_EMAIL;
const password = process.env.E2E_CLERK_PASSWORD;

/**
 * Clerk's hosted components are third-party markup we cannot patch, so their
 * violations would make this suite permanently red without telling us anything
 * actionable. Everything outside them is ours.
 */
const CLERK = [".cl-rootBox", ".cl-userButtonPopoverCard"];

test("the landing page has no WCAG A/AA violations", async ({ page }) => {
  await page.goto("/");

  await expectNoAxeViolations(page);
});

test.describe("signed in", () => {
  test.skip(
    !email || !password,
    "Set E2E_CLERK_EMAIL and E2E_CLERK_PASSWORD to audit the signed-in pages"
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/dashboard");
  });

  test("the dashboard has no WCAG A/AA violations", async ({ page }) => {
    // The page that never got the responsive pass (§9.1).
    await expectNoAxeViolations(page, CLERK);
  });

  test("the notebook page has no WCAG A/AA violations", async ({ page }) => {
    const notebook = page.getByRole("link", { name: /notebook/i }).first();

    // Nothing to audit on a fresh account; the dashboard check above still ran.
    test.skip(
      (await notebook.count()) === 0,
      "No notebook to open on this account"
    );

    await notebook.click();
    await page.waitForURL("**/notebook/**");
    await expect(page.getByRole("main")).toBeVisible();

    await expectNoAxeViolations(page, CLERK);
  });
});
