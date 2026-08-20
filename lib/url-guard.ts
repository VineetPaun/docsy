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
 *  - **the validated address is pinned for the connection**, so the name cannot
 *    resolve to something else between the check and the connect (DNS
 *    rebinding). This is why the fetch goes through `node:https` rather than
 *    `fetch`: `lookup` is the only hook that decides where the socket lands,
 *    and `fetch` has no equivalent
 *  - redirects followed manually so every hop is re-validated and re-pinned
 *  - request timeout
 *  - response size cap (Content-Length *and* streamed byte count)
 *  - response Content-Type allowlist
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
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
 * Validate a user-supplied URL and return it alongside the address the
 * connection must use.
 *
 * The returned address is the one the caller has to connect to. Resolving
 * again at connect time is the rebinding hole: the second lookup can answer
 * with 169.254.169.254 after the first answered with a public address.
 *
 * @throws {BlockedUrlError} on a bad scheme, unresolvable host, or any
 *   resolved address in private/reserved space.
 */
async function resolvePublicUrl(
  rawUrl: string
): Promise<{ url: URL; address: string; family: number }> {
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

  return { url: parsed, address: addresses[0].address, family: addresses[0].family };
}

/**
 * Validate a user-supplied URL, throwing if it is not safe to fetch.
 *
 * Kept for callers that only need the check (`/api/process-url` validates a
 * YouTube thumbnail URL it never fetches server-side).
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  const { url } = await resolvePublicUrl(rawUrl);
  return url;
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

/** One request to one pinned address, with the body read under a cap. */
interface PinnedResponse {
  status: number;
  location: string | null;
  contentType: string;
  text: string;
}

/**
 * Perform a single GET against a **specific IP**, using the URL's hostname for
 * TLS and the `Host` header.
 *
 * `fetch` cannot express this: it resolves the name itself, at connect time,
 * with no hook in between — which is precisely the window a rebinding attack
 * needs. `node:https` takes a `lookup`, so the socket lands on the address that
 * was validated and nothing else.
 *
 * A redirect returns without reading the body: the destination still has to be
 * re-validated and re-pinned before anything is downloaded from it.
 */
function fetchPinned(
  url: URL,
  address: string,
  family: number,
  options: {
    headers: Record<string, string>;
    allowedContentTypes?: string[];
    maxBytes: number;
    timeoutMs: number;
  }
): Promise<PinnedResponse> {
  const isHttps = url.protocol === "https:";
  const send = isHttps ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const requestOptions: RequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { ...options.headers, host: url.host },
      // The pin. Node calls this instead of DNS, so the connection cannot be
      // redirected to an address that was never checked.
      lookup: (hostname, lookupOptions, callback) => {
        if (lookupOptions && (lookupOptions as { all?: boolean }).all) {
          (callback as unknown as (
            err: null,
            addresses: { address: string; family: number }[]
          ) => void)(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
      // Certificate and SNI still belong to the hostname, not the IP, so a
      // pinned connection is not a downgraded one.
      servername: isHttps ? url.hostname : undefined,
    };

    const request = send(requestOptions, (response) => {
      const status = response.statusCode ?? 0;
      const contentType = String(response.headers["content-type"] ?? "");

      if (status >= 300 && status < 400) {
        response.destroy();
        resolve({
          status,
          location: (response.headers.location as string) ?? null,
          contentType,
          text: "",
        });
        return;
      }

      if (options.allowedContentTypes?.length) {
        const bare = contentType.split(";")[0].trim().toLowerCase();
        const allowed = options.allowedContentTypes.some((prefix) =>
          bare.startsWith(prefix.toLowerCase())
        );
        if (!allowed) {
          response.destroy();
          reject(
            new BlockedUrlError(`Unsupported content type: ${bare || "unknown"}`)
          );
          return;
        }
      }

      // Advisory, but free to check before downloading anything.
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > options.maxBytes) {
        response.destroy();
        reject(new Error("Response too large"));
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;

      response.on("data", (chunk: Buffer) => {
        received += chunk.byteLength;
        // Counted as it arrives: Content-Length can understate the real body.
        if (received > options.maxBytes) {
          response.destroy();
          request.destroy();
          reject(new Error("Response too large"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () =>
        resolve({
          status,
          location: null,
          contentType,
          text: Buffer.concat(chunks).toString("utf8"),
        })
      );

      response.on("error", reject);
    });

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error("Request timed out"));
    });

    request.on("error", reject);
    request.end();
  });
}

/**
 * Fetch a user-supplied URL as text with SSRF, rebinding, timeout, size and
 * content-type protections. Redirects are followed manually so every hop is
 * re-validated — a public URL that 302s to 169.254.169.254 is rejected at the
 * second hop, and each hop connects to the address that hop validated.
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

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url, address, family } = await resolvePublicUrl(currentUrl);

    const response = await fetchPinned(url, address, family, {
      headers,
      allowedContentTypes,
      maxBytes,
      timeoutMs,
    });

    if (response.status >= 300 && response.status < 400 && response.location) {
      currentUrl = new URL(response.location, url).toString();
      continue;
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    return {
      url: currentUrl,
      text: response.text,
      contentType: response.contentType,
    };
  }

  throw new Error("Too many redirects");
}
