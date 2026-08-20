/**
 * SSRF guard (AUDIT.md §3.3, §3.6).
 *
 * These are the addresses that turn `/api/process-url` into an internal network
 * scanner, so the classifier gets a test even though the fetch path cannot be
 * exercised without a network. IP literals resolve through `dns.lookup` without
 * touching a resolver, so nothing here goes off-machine.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { BlockedUrlError, assertPublicUrl } from "./url-guard";

const blocked = async (url: string) => {
  try {
    await assertPublicUrl(url);
    return null;
  } catch (error) {
    return error;
  }
};

test("rejects non-http protocols", async () => {
  expect(await blocked("file:///etc/passwd")).toBeInstanceOf(BlockedUrlError);
  expect(await blocked("gopher://example.com")).toBeInstanceOf(BlockedUrlError);
  expect(await blocked("data:text/html,hi")).toBeInstanceOf(BlockedUrlError);
});

test("rejects loopback and private space", async () => {
  expect(await blocked("http://127.0.0.1:6333/collections")).toBeInstanceOf(
    BlockedUrlError
  );
  expect(await blocked("http://10.0.0.5/")).toBeInstanceOf(BlockedUrlError);
  expect(await blocked("http://192.168.1.1/")).toBeInstanceOf(BlockedUrlError);
  expect(await blocked("http://172.16.0.1/")).toBeInstanceOf(BlockedUrlError);
});

test("rejects the cloud metadata endpoint", async () => {
  // The one that leaks instance credentials.
  expect(await blocked("http://169.254.169.254/latest/meta-data/")).toBeInstanceOf(
    BlockedUrlError
  );
});

test("rejects IPv6 loopback and unique-local", async () => {
  expect(await blocked("http://[::1]/")).toBeInstanceOf(BlockedUrlError);
  expect(await blocked("http://[fd00::1]/")).toBeInstanceOf(BlockedUrlError);
  expect(await blocked("http://[fe80::1]/")).toBeInstanceOf(BlockedUrlError);
});

test("rejects an IPv4-mapped IPv6 private address", async () => {
  // ::ffff:10.0.0.1 is 10.0.0.1 wearing a hat.
  expect(await blocked("http://[::ffff:10.0.0.1]/")).toBeInstanceOf(
    BlockedUrlError
  );
});

test("rejects a malformed URL and a hostless one", async () => {
  expect(await blocked("not a url")).toBeInstanceOf(BlockedUrlError);
  expect(await blocked("http://")).toBeInstanceOf(BlockedUrlError);
});
