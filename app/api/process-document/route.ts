import type { NextRequest } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { ApiError, badRequest, withApiHandler } from "@/lib/api-handler";
import { sniffFileType } from "@/lib/file-type";

// Matches the "up to 10MB" promise the upload UI makes. The whole file is read
// into a Buffer below, so an uncapped upload is a memory-exhaustion vector.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Parsing a large PDF can outlast the default serverless cutoff.
export const maxDuration = 120;

export const POST = withApiHandler(
  async (request: NextRequest) => {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      throw badRequest("No file provided");
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new ApiError(413, "File is too large. Maximum size is 10MB.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dispatch on the bytes, never on `file.type` — that string is chosen by
    // the browser. AUDIT.md §3.5.
    const fileType = sniffFileType(buffer);

    if (!fileType) {
      throw badRequest(
        "Unsupported or unrecognised file. Upload a PDF, DOCX, or text file."
      );
    }

    let extractedText = "";

    // Set when extraction fails, to reject the upload with a reason instead of
    // storing a placeholder string as the document's content (AUDIT.md §4.10).
    let failure: string | null = null;

    if (fileType === "pdf") {
      // pdf-parse v2: class-based API, real types, and per-page text.
      // `parser.destroy()` releases the pdf.js worker — skipping it leaks a
      // worker per request.
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();

        // Join pages with a form feed rather than using `result.text`:
        // `chunkTextWithPositions` counts \f to derive a chunk's page number,
        // and \f is whitespace, so it adds no visible noise to a citation the
        // way a "--- Page 2 ---" marker would. AUDIT.md §4.9.
        extractedText = result.pages?.length
          ? result.pages.map((p) => p.text).join("\f")
          : result.text || "";

        if (!extractedText || extractedText.trim().length === 0) {
          failure =
            "No text found in this PDF. It looks scanned or image-based — try a text PDF, or convert it first.";
        }
      } catch {
        failure =
          "This PDF could not be read. It may be encrypted or damaged — try converting it to text.";
      } finally {
        await parser.destroy();
      }
    } else if (fileType === "docx" || fileType === "doc") {
      // Extract text from DOCX. Legacy .doc lands here too; mammoth cannot
      // read OLE files, so it fails into the message below — same as before.
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch {
        failure =
          fileType === "doc"
            ? "Legacy .doc files are not supported. Save it as .docx and try again."
            : "This DOCX could not be read. It may be damaged.";
      }
    } else {
      // Plain text — validated as UTF-8 by the sniffer.
      extractedText = buffer.toString("utf-8");
    }

    // Refuse the upload rather than returning a placeholder as the content.
    // The old behaviour stored "[PDF content could not be extracted...]" as the
    // document text and fed it to the LLM as a source (AUDIT.md §4.10).
    if (failure) {
      throw new ApiError(422, failure);
    }

    // Clean up the extracted text. The whitespace class deliberately spares
    // \f as well as \n: form feeds are the page markers joined above, and
    // collapsing them to spaces would silently kill every page number
    // downstream (AUDIT.md §4.9).
    extractedText = extractedText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[^\S\n\f]+/g, " ") // Normalize whitespace
      .trim();

    // An empty text file gets the same treatment — a source with no content is
    // not a source.
    if (extractedText.length === 0) {
      throw new ApiError(422, "This file contains no readable text.");
    }

    // Truncate if too long (to prevent token limits)
    const MAX_LENGTH = 50000;
    if (extractedText.length > MAX_LENGTH) {
      extractedText =
        extractedText.slice(0, MAX_LENGTH) + "\n\n[Content truncated...]";
    }

    return {
      content: extractedText,
      fileName: file.name,
      // The detected type, not the one the browser claimed.
      fileType,
      characterCount: extractedText.length,
    };
  },
  { fallbackMessage: "Failed to process document" }
);
