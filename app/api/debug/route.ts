import { NextRequest, NextResponse } from "next/server";

// Debug endpoint to check document content status
// GET /api/debug?notebookId=xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const notebookId = searchParams.get("notebookId");

  return NextResponse.json({
    message: "Debug endpoint",
    notebookId,
    timestamp: new Date().toISOString(),
    env: {
      hasOpenRouter: !!process.env.OPENROUTER_API_KEY,
      hasGoogleApi: !!process.env.GOOGLE_API_KEY,
      hasQdrant: !!process.env.QDRANT_URL,
      qdrantUrl: process.env.QDRANT_URL?.replace(/\/\/.*@/, "//***@"), // Hide credentials
    },
  });
}

// POST to test PDF parsing directly
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    // @ts-expect-error - pdf-parse v1.x doesn't have types
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    
    const buffer = Buffer.from(await file.arrayBuffer());
    
    console.log(`[debug] Testing PDF: ${file.name}, size: ${buffer.length}`);
    
    const result = await pdfParse(buffer);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: buffer.length,
      totalPages: result.numpages || 0,
      textLength: result.text?.length || 0,
      textPreview: result.text?.substring(0, 500) || "",
    });
  } catch (error) {
    console.error("[debug] PDF test error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
