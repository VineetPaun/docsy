/**
 * The landing page, unauthenticated.
 *
 * Runnable without a session, which makes it the one E2E check that needs
 * nothing but a booted app. It covers the keyboard path added in AUDIT.md §9.4
 * — the dropzone used to be a `div onClick` around a `display:none` input,
 * reachable only with a mouse.
 */

import { expect, test } from "@playwright/test";

test("the landing page renders and offers a way in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
});

test("the dropzone's file input is reachable by keyboard", async ({ page }) => {
  await page.goto("/");

  const input = page.locator("#landing-document-input");

  // `sr-only`, not `hidden`: visually gone, still focusable.
  await expect(input).toBeAttached();
  await input.focus();
  await expect(input).toBeFocused();
});
