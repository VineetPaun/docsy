/**
 * Server-side file type detection (AUDIT.md §3.5).
 *
 * Ingestion used to dispatch on `file.type` — the MIME string the *browser*
 * chose to send. Renaming `payload.exe` to `report.pdf` was enough to hand it
 * straight to the PDF parser. Content decides the type here; the declared MIME
 * is not consulted at all.
 */

/** The kinds of file the ingestion pipeline can extract text from. */
export type SniffedFileType = "pdf" | "docx" | "doc" | "text";

/** Byte signatures, longest-first so a prefix cannot shadow a longer match. */
const SIGNATURES: Array<{ type: SniffedFileType; bytes: number[] }> = [
  // Legacy OLE compound file — .doc, .xls, .ppt all share it.
  { type: "doc", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  // "%PDF"
  { type: "pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  // "PK\x03\x04" — a zip container. .docx is a zip; so is every other OOXML
  // file and every plain archive, so this only narrows it to "zip-shaped".
  { type: "docx", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

/** How much of the file to inspect when deciding whether it is text. */
const TEXT_PROBE_BYTES = 8192;

/**
 * Identify a buffer by its contents.
 *
 * Text is the fallback rather than a signature, because plain text has none.
 * A NUL byte is the discriminator: it cannot appear in valid UTF-8 text but is
 * ubiquitous in executables and other binaries.
 *
 * @returns the detected type, or null when the bytes match nothing supported.
 */
export function sniffFileType(buffer: Buffer): SniffedFileType | null {
  for (const { type, bytes } of SIGNATURES) {
    if (buffer.length < bytes.length) continue;
    if (bytes.every((byte, i) => buffer[i] === byte)) return type;
  }

  const probe = buffer.subarray(0, TEXT_PROBE_BYTES);

  // An empty file is not text worth extracting.
  if (probe.length === 0) return null;
  if (probe.includes(0x00)) return null;

  // Reject anything that is not valid UTF-8. `fatal` throws rather than
  // substituting replacement characters, which is what makes this a check
  // instead of a coercion. `stream: true` matters: the probe is a fixed-size
  // cut, so a multi-byte character can straddle the end — without it, any text
  // file over 8 KB would be rejected roughly one time in four.
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(probe, { stream: true });
  } catch {
    return null;
  }

  return "text";
}
