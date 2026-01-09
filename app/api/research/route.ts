import { NextRequest, NextResponse } from "next/server";
import { chatWithOpenRouter, DEFAULT_MODEL, type ModelId } from "@/lib/openrouter";

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

export async function POST(request: NextRequest) {
  try {
    const body: ResearchRequest = await request.json();
    const { topic, depth = "standard", model = DEFAULT_MODEL } = body;

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

    if (!openRouterKey) {
      return NextResponse.json({
        success: false,
        error: "OPENROUTER_API_KEY required for research mode",
        isDemo: true,
        report: generateDemoReport(topic),
      });
    }

    // Step 1: Generate search queries based on the topic
    const searchQueries = await generateSearchQueries(topic, depth, model as ModelId);

    // Step 2: Perform web searches
    const allSources: ResearchSource[] = [];

    if (tavilyKey || serperKey) {
      for (const query of searchQueries.slice(0, 3)) {
        try {
          const searchResponse = await fetch(
            new URL("/api/web-search", request.url).toString(),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, limit: 3 }),
            }
          );

          if (searchResponse.ok) {
            const data = await searchResponse.json();
            if (data.results) {
              allSources.push(
                ...data.results.map((r: { title: string; url: string; snippet: string }) => ({
                  title: r.title,
                  url: r.url,
                  snippet: r.snippet,
                }))
              );
            }
          }
        } catch (error) {
          console.error("Search error for query:", query, error);
        }
      }
    }

    // Step 3: Synthesize the research report
    const report = await synthesizeReport(topic, allSources, depth, model as ModelId);

    return NextResponse.json({
      success: true,
      topic,
      report,
      sources: allSources.slice(0, 10),
      searchQueries,
    });
  } catch (error) {
    console.error("Research API error:", error);
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

function generateDemoReport(topic: string): string {
  return `# Research Report: ${topic}

## Overview

This is a demo research report. To enable full research capabilities, please configure the following environment variables:

- \`OPENROUTER_API_KEY\` - Required for AI-powered synthesis
- \`TAVILY_API_KEY\` or \`SERPER_API_KEY\` - Required for web search

## How Fast Research Works

1. **Query Generation**: AI generates multiple search queries related to your topic
2. **Web Search**: Searches the web for relevant sources
3. **Synthesis**: AI analyzes all sources and creates a comprehensive report

## Getting Started

Add the required API keys to your \`.env.local\` file and restart the development server.

---
*This is a demo response. Configure API keys for real research capabilities.*`;
}
