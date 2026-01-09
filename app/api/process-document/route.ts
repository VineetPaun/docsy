import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
// @ts-expect-error - pdf-parse v1.x doesn't have types
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(
      `[process-document] Processing file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`
    );

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.type;
    let extractedText = "";

    if (fileType === "application/pdf") {
      // Extract text from PDF using pdf-parse v1
      try {
        console.log(
          `[process-document] Starting PDF extraction for: ${file.name}`
        );
        console.log(`[process-document] Buffer size: ${buffer.length} bytes`);

        const result = await pdfParse(buffer);

        console.log(
          `[process-document] PDF parsed - pages: ${result.numpages || 0}`
        );

        extractedText = result.text || "";

        console.log(
          `[process-document] Text extracted: ${extractedText.length} characters`
        );

        if (!extractedText || extractedText.trim().length === 0) {
          console.warn(
            `[process-document] No text extracted from PDF: ${file.name}`
          );
          extractedText =
            "[PDF content could not be extracted. The PDF may be scanned/image-based or protected.]";
        } else {
          console.log(
            `[process-document] Successfully extracted ${extractedText.length} characters from PDF`
          );
        }
      } catch (error) {
        console.error("[process-document] PDF parsing error:", error);
        console.error(
          "[process-document] Error details:",
          error instanceof Error ? error.message : String(error)
        );
        extractedText =
          "[Failed to extract PDF content. Please try a different PDF or convert to text.]";
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
      } catch (error) {
        console.error("DOCX parsing error:", error);
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
  } catch (error) {
    console.error("Document processing error:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}
