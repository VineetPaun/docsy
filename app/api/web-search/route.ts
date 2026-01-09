import { NextRequest, NextResponse } from "next/server";

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
    } else if (serperKey) {
      return await searchWithSerper(query, limit, serperKey);
    }

    // No API key configured - return demo response
    return NextResponse.json({
      success: true,
      results: generateDemoResults(query),
      isDemo: true,
      message: "Web search requires TAVILY_API_KEY or SERPER_API_KEY",
    });
  } catch (error) {
    console.error("Web search API error:", error);
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
    const error = await response.text();
    console.error("Tavily API error:", error);
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
    const error = await response.text();
    console.error("Serper API error:", error);
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

function generateDemoResults(query: string): SearchResult[] {
  return [
    {
      title: `Results for "${query}" - Demo`,
      url: "https://example.com/result-1",
      snippet: `This is a demo search result for "${query}". Add TAVILY_API_KEY or SERPER_API_KEY to enable real web search.`,
      source: "example.com",
    },
    {
      title: `Understanding ${query} - Demo Article`,
      url: "https://example.com/result-2",
      snippet: `Learn more about ${query} in this comprehensive guide. This is a placeholder result.`,
      source: "example.com",
    },
    {
      title: `${query} Best Practices - Demo`,
      url: "https://example.com/result-3",
      snippet: `Discover best practices for ${query}. Configure a search API key for real results.`,
      source: "example.com",
    },
  ];
}
