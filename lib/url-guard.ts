/**
 * SSRF guard for every server-side fetch of a user-supplied URL.
 *
 * Without this, `/api/process-url` is an internal-network scanner: it fetches
 * whatever the caller names and returns the body to them, which reaches cloud
 * metadata endpoints (169.254.169.254), the local Qdrant instance, and
 * `file://`. See AUDIT.md §3.3.
 *
 * Protections applied here:
 *  - protocol allowlist (http/https only)
 *  - DNS resolution + private/loopback/link-local/reserved address blocking
 *  - redirects followed manually so every hop is re-validated
 *  - request timeout
 *  - response size cap (Content-Length *and* streamed byte count)
 *  - response Content-Type allowlist
 *
 * Known limitation: a DNS rebinding attack can still return a public address
 * at validation time and a private one at connect time. Closing that needs a
 * custom agent that pins the validated IP; documented rather than solved.
 */

import { lookup } from "node:dns/promises";

/** Thrown for any URL we refuse to fetch. Callers map this to a 400. */
export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/** Only these schemes are ever fetched. Blocks file:, gopher:, data:, etc. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Hard ceilings — a 2 GB response would OOM the serverless function. */
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

/**
 * True if an IPv4 dotted-quad falls in a range that is not publicly routable.
 * Covers RFC1918 private space, loopback, link-local (cloud metadata),
 * CGNAT, benchmarking, documentation, multicast and reserved space.
 */
function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;

  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51) return true; // 198.51.100.0/24 documentation
  if (a === 203 && b === 0) return true; // 203.0.113.0/24 documentation
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved

  return false;
}

/**
 * True if an IPv6 address is not publicly routable. IPv4-mapped addresses
 * (`::ffff:10.0.0.1`) are unwrapped and checked as IPv4.
 */
function isPrivateIPv6(address: string): boolean {
  const addr = address.toLowerCase().split("%")[0]; // strip zone index

  if (addr === "::" || addr === "::1") return true; // unspecified + loopback

  // IPv4-mapped / IPv4-compatible — check the embedded v4 address.
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);

  const firstHextet = parseInt(addr.split(":")[0] || "0", 16);
  if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((firstHextet & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  return false;
}

/**
 * Validate a user-supplied URL and confirm every address its hostname
 * resolves to is publicly routable.
 *
 * @throws {BlockedUrlError} on a bad scheme, unresolvable host, or any
 *   resolved address in private/reserved space.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError("Invalid URL format");
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new BlockedUrlError("Only http and https URLs are supported");
  }

  if (!parsed.hostname) {
    throw new BlockedUrlError("URL has no hostname");
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError("Could not resolve hostname");
  }

  if (addresses.length === 0) {
    throw new BlockedUrlError("Could not resolve hostname");
  }

  // Every resolved address must be public — a host with one public and one
  // private A record is still an attack path.
  for (const { address, family } of addresses) {
    const blocked =
      family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
    if (blocked) {
      throw new BlockedUrlError("Requests to this host are not allowed");
    }
  }

  return parsed;
}

export interface SafeFetchOptions {
  /** Extra request headers (User-Agent, Accept, ...). */
  headers?: Record<string, string>;
  /** Reject responses whose Content-Type matches none of these prefixes. */
  allowedContentTypes?: string[];
  /** Abort once this many response bytes have been read. */
  maxBytes?: number;
  /** Abort the whole request after this long. */
  timeoutMs?: number;
}

/**
 * Fetch a user-supplied URL as text with SSRF, timeout, size and content-type
 * protections. Redirects are followed manually so each hop is re-validated —
 * a public URL that 302s to 169.254.169.254 is rejected at the second hop.
 *
 * @returns the response body plus the final URL actually fetched.
 * @throws {BlockedUrlError} if any hop fails validation.
 * @throws {Error} on a non-2xx response, timeout, or oversized body.
 */
export async function safeFetchText(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<{ url: string; text: string; contentType: string }> {
  const {
    headers = {},
    allowedContentTypes,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let currentUrl = rawUrl;
  let response: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await assertPublicUrl(currentUrl);

    response = await fetch(validated.toString(), {
      headers,
      redirect: "manual", // resolve hops ourselves so each one is validated
      signal: AbortSignal.timeout(timeoutMs),
    });

    // 3xx with a Location header — validate the next hop and continue.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;

      // Drain the redirect body so the socket can be reused.
      await response.body?.cancel();
      currentUrl = new URL(location, validated).toString();
      continue;
    }

    break;
  }

  if (!response) {
    throw new Error("Failed to fetch URL");
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Too many redirects");
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (allowedContentTypes && allowedContentTypes.length > 0) {
    const bare = contentType.split(";")[0].trim().toLowerCase();
    const allowed = allowedContentTypes.some((prefix) =>
      bare.startsWith(prefix.toLowerCase())
    );
    if (!allowed) {
      await response.body?.cancel();
      throw new BlockedUrlError(`Unsupported content type: ${bare || "unknown"}`);
    }
  }

  // Trust Content-Length when present, but still count bytes as we read —
  // the header is advisory and can understate the real body size.
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error("Response too large");
  }

  const reader = response.body?.getReader();
  if (!reader) return { url: currentUrl, text: "", contentType };

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    url: currentUrl,
    text: new TextDecoder().decode(buffer),
    contentType,
  };
}
