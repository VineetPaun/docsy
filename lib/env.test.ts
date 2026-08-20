/**
 * Startup environment check (AUDIT.md §10).
 *
 * Worth a test because the check runs before anything else and a false pass is
 * indistinguishable from having no check at all.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { assertRequiredEnv, missingRequiredEnv } from "./env";

const complete = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  CLERK_SECRET_KEY: "sk_test_x",
};

test("a complete environment reports nothing missing", () => {
  expect(missingRequiredEnv(complete)).toEqual([]);
  expect(() => assertRequiredEnv(complete)).not.toThrow();
});

test("an absent variable is reported", () => {
  expect(
    missingRequiredEnv({ ...complete, CLERK_SECRET_KEY: undefined })
  ).toEqual(["CLERK_SECRET_KEY"]);
});

test("a blank or whitespace value counts as absent", () => {
  expect(missingRequiredEnv({ ...complete, CLERK_SECRET_KEY: "" })).toEqual([
    "CLERK_SECRET_KEY",
  ]);
  expect(missingRequiredEnv({ ...complete, CLERK_SECRET_KEY: "  " })).toEqual([
    "CLERK_SECRET_KEY",
  ]);
});

test("names every missing variable, not just the first", () => {
  expect(() => assertRequiredEnv({})).toThrow(
    /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY/
  );
});

test("optional variables are not required", () => {
  // Convex has a mock-data path, and the feature keys 503 with their own name.
  expect(missingRequiredEnv(complete)).toEqual([]);
});
