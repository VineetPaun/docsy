/**
 * Magic-byte detection (AUDIT.md §3.5).
 *
 * This is a trust boundary: it is the only thing standing between an arbitrary
 * uploaded blob and the PDF/DOCX parsers, now that `file.type` is ignored.
 *
 * Run: `bun test`
 */

import { expect, test } from "bun:test";
import { sniffFileType } from "./file-type";

const bytes = (...values: number[]) => Buffer.from(values);

test("recognises supported signatures", () => {
  // "%PDF-1.7"
  expect(sniffFileType(Buffer.from("%PDF-1.7\n..."))).toBe("pdf");
  // "PK\x03\x04" — zip container, which is what a .docx is
  expect(sniffFileType(bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00))).toBe("docx");
  // OLE compound file — legacy .doc
  expect(
    sniffFileType(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))
  ).toBe("doc");
});

test("treats signature-less UTF-8 as text", () => {
  expect(sniffFileType(Buffer.from("# Heading\n\nplain words"))).toBe("text");
  // Multi-byte characters are text, not binary.
  expect(sniffFileType(Buffer.from("café — naïve — 日本語"))).toBe("text");
});

test("rejects binaries, including a spoofed extension", () => {
  // A PE executable: "MZ" then a NUL. Renaming it report.pdf changes nothing,
  // because the declared MIME type is never consulted.
  expect(sniffFileType(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00))).toBeNull();
  // PNG — a real file, just not one we extract text from.
  expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBeNull();
  // Invalid UTF-8 with no NUL byte: caught by the decoder, not the NUL scan.
  expect(sniffFileType(bytes(0xff, 0xfe, 0xff, 0xfe))).toBeNull();
  expect(sniffFileType(Buffer.alloc(0))).toBeNull();
});

test("a multi-byte character straddling the 8 KB probe is still text", () => {
  // The probe is a fixed 8192-byte cut. Put the two bytes of "é" (C3 A9)
  // across that boundary: without stream-mode decoding this file is rejected.
  const text = "a".repeat(8191) + "é" + "b".repeat(100);
  const buffer = Buffer.from(text);

  expect(buffer[8191]).toBe(0xc3);
  expect(buffer[8192]).toBe(0xa9);
  expect(sniffFileType(buffer)).toBe("text");
});
