import { NextRequest, NextResponse } from "next/server";
import { chatWithOpenRouter, resolveModel, type ModelId } from "@/lib/openrouter";
import { requireApiAuth } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";

interface ResearchRequest {
  topic: string;
  depth?: "quick" | "standard" | "deep";
  model?: string;
}

interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

// Two LLM calls plus a fan-out of web searches; well past the default cutoff.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Each call fans out to 3 web searches + 2 LLM calls — expensive to leave open.
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;

  const limited = await enforceRateLimit("research");
  if (limited) return limited;

  try {
    const body: ResearchRequest = await request.json();
    const { topic, depth = "standard", model } = body;

    if (!topic) {
      return NextResponse.json(
        { error: "Missing required field: topic" },
        { status: 400 }
      );
    }

    // Check for required API keys
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    // Returned a canned "demo report" with a 200 before, so a deploy missing
    // the key produced plausible-looking output (AUDIT.md §6.6).
    if (!openRouterKey) {
      return NextResponse.json(
        {
          error:
            "Research is unavailable: OPENROUTER_API_KEY is not configured",
        },
        { status: 503 }
      );
    }

    // Step 1: Generate search queries based on the topic
    // One resolve for both calls — see lib/openrouter.ts.
    const selectedModel = await resolveModel(model);

    const searchQueries = await generateSearchQueries(topic, depth, selectedModel);

    // Step 2: Perform web searches
    const allSources: ResearchSource[] = [];

    if (tavilyKey || serperKey) {
      // Run the sub-searches concurrently — awaiting them in a loop made
      // research take as long as the sum of every upstream call.
      const searches = await Promise.allSettled(
        searchQueries.slice(0, 3).map(async (query) => {
          const searchResponse = await fetch(
            new URL("/api/web-search", request.url).toString(),
            {
              method: "POST",
              // /api/web-search now requires a session, so the caller's
              // credentials must ride along on this internal hop —
              // otherwise it 401s and research silently finds no sources.
              headers: {
                "Content-Type": "application/json",
                cookie: request.headers.get("cookie") ?? "",
                authorization: request.headers.get("authorization") ?? "",
              },
              body: JSON.stringify({ query, limit: 3 }),
            }
          );

          if (!searchResponse.ok) return [];

          const data = await searchResponse.json();
          return (data.results ?? []).map(
            (r: { title: string; url: string; snippet: string }) => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
            })
          ) as ResearchSource[];
        })
      );

      // A failed sub-search is non-fatal; keep the sources we did get.
      for (const search of searches) {
        if (search.status === "fulfilled") allSources.push(...search.value);
      }
    }

    // Step 3: Synthesize the research report
    const report = await synthesizeReport(
      topic,
      allSources,
      depth,
      selectedModel
    );

    return NextResponse.json({
      success: true,
      topic,
      report,
      sources: allSources.slice(0, 10),
      searchQueries,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to perform research" },
      { status: 500 }
    );
  }
}

async function generateSearchQueries(
  topic: string,
  depth: string,
  model: ModelId
): Promise<string[]> {
  const numQueries = depth === "quick" ? 2 : depth === "deep" ? 5 : 3;

  const response = await chatWithOpenRouter(
    [
      {
        role: "system",
        content: `You are a research assistant. Generate ${numQueries} diverse search queries to research the given topic. Return only the queries, one per line, no numbering or bullets.`,
      },
      {
        role: "user",
        content: `Generate search queries for researching: ${topic}`,
      },
    ],
    model,
    { temperature: 0.7, maxTokens: 300 }
  );

  return response
    .split("\n")
    .map((q) => q.trim())
    .filter((q) => q.length > 0)
    .slice(0, numQueries);
}

async function synthesizeReport(
  topic: string,
  sources: ResearchSource[],
  depth: string,
  model: ModelId
): Promise<string> {
  const sourceContext =
    sources.length > 0
      ? sources
          .map((s, i) => `[${i + 1}] ${s.title}\n${s.snippet}`)
          .join("\n\n")
      : "No web sources available.";

  const lengthGuide =
    depth === "quick"
      ? "Write a brief 2-3 paragraph summary."
      : depth === "deep"
        ? "Write a comprehensive report with sections, analysis, and recommendations (500-800 words)."
        : "Write a detailed summary with key findings and insights (300-500 words).";

  const response = await chatWithOpenRouter(
    [
      {
        role: "system",
        content: `You are a research analyst. Synthesize the provided sources into a well-structured research report. ${lengthGuide}

Use markdown formatting with:
- Clear headings
- Bullet points for key findings
- Citations using [1], [2], etc. when referencing sources

Be objective and thorough.`,
      },
      {
        role: "user",
        content: `Research topic: ${topic}

Sources:
${sourceContext}

Generate a research report on this topic.`,
      },
    ],
    model,
    { temperature: 0.7, maxTokens: depth === "deep" ? 2000 : 1000 }
  );

  return response;
}
