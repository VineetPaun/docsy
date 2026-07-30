import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

interface WebSearchRequest {
  query: string;
  limit?: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export async function POST(request: NextRequest) {
  // Was a free anonymous proxy onto the Tavily/Serper keys.
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  try {
    const body: WebSearchRequest = await request.json();
    const { query, limit = 5 } = body;

    if (!query) {
      return NextResponse.json(
        { error: "Missing required field: query" },
        { status: 400 }
      );
    }

    // Try Tavily first, then Serper
    const tavilyKey = process.env.TAVILY_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    if (tavilyKey) {
      return await searchWithTavily(query, limit, tavilyKey);
    }
    if (serperKey) {
      return await searchWithSerper(query, limit, serperKey);
    }

    // Unconfigured used to return three fabricated example.com results with
    // `success: true`, which no caller distinguished from real ones
    // (AUDIT.md §6.6).
    return NextResponse.json(
      {
        error:
          "Web search is unavailable: set TAVILY_API_KEY or SERPER_API_KEY",
      },
      { status: 503 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to perform web search" },
      { status: 500 }
    );
  }
}

async function searchWithTavily(
  query: string,
  limit: number,
  apiKey: string
): Promise<NextResponse> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: limit,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to search with Tavily");
  }

  const data = await response.json();

  const results: SearchResult[] = data.results.map((r: {
    title: string;
    url: string;
    content: string;
  }) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    source: new URL(r.url).hostname,
  }));

  return NextResponse.json({
    success: true,
    results,
    answer: data.answer,
    query,
  });
}

async function searchWithSerper(
  query: string,
  limit: number,
  apiKey: string
): Promise<NextResponse> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      q: query,
      num: limit,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to search with Serper");
  }

  const data = await response.json();

  const results: SearchResult[] = (data.organic || []).map((r: {
    title: string;
    link: string;
    snippet: string;
  }) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet,
    source: new URL(r.link).hostname,
  }));

  return NextResponse.json({
    success: true,
    results,
    query,
  });
}
