import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { requireApiAuth } from "@/lib/api-auth";

// Matches the "up to 10MB" promise the upload UI makes. The whole file is read
// into a Buffer below, so an uncapped upload is a memory-exhaustion vector.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Parsing a large PDF can outlast the default serverless cutoff.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // Previously an open door into the PDF parser for anonymous callers.
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Maximum size is 10MB." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.type;
    let extractedText = "";

    if (fileType === "application/pdf") {
      // pdf-parse v2: class-based API, real types, and per-page text.
      // `parser.destroy()` releases the pdf.js worker — skipping it leaks a
      // worker per request.
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        extractedText = result.text || "";

        if (!extractedText || extractedText.trim().length === 0) {
          extractedText =
            "[PDF content could not be extracted. The PDF may be scanned/image-based or protected.]";
        }
      } catch {
        extractedText =
          "[Failed to extract PDF content. Please try a different PDF or convert to text.]";
      } finally {
        await parser.destroy();
      }
    } else if (
      fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileType === "application/msword"
    ) {
      // Extract text from DOCX
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch {
        extractedText = "[Failed to extract DOCX content]";
      }
    } else if (fileType === "text/plain" || fileType === "text/markdown") {
      // Plain text files
      extractedText = buffer.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[^\S\n]+/g, " ") // Normalize whitespace
      .trim();

    // Truncate if too long (to prevent token limits)
    const MAX_LENGTH = 50000;
    if (extractedText.length > MAX_LENGTH) {
      extractedText =
        extractedText.slice(0, MAX_LENGTH) + "\n\n[Content truncated...]";
    }

    return NextResponse.json({
      content: extractedText,
      fileName: file.name,
      fileType: file.type,
      characterCount: extractedText.length,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
