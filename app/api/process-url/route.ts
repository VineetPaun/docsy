import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { badRequest, withApiHandler } from "@/lib/api-handler";
import {
  assertPublicUrl,
  BlockedUrlError,
  safeFetchText,
} from "@/lib/url-guard";

interface ProcessUrlRequest {
  url: string;
}

interface ProcessedContent {
  title: string;
  content: string;
  description?: string;
  author?: string;
  publishedDate?: string;
  siteName?: string;
  thumbnailUrl?: string;
  sourceType: "url" | "youtube";
  videoId?: string;
  duration?: string;
}

// Extract YouTube video ID from various URL formats
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Fetch YouTube transcript using youtube-transcript API
async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  try {
    // Try using the unofficial transcript API
    const { text: html } = await safeFetchText(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      }
    );

    // Extract captions URL from the page
    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) {
      return "";
    }

    try {
      const captionTracks = JSON.parse(captionMatch[1]);
      // Prefer English captions
      const englishTrack = captionTracks.find(
        (track: { languageCode: string }) =>
          track.languageCode === "en" || track.languageCode?.startsWith("en")
      );
      const captionTrack = englishTrack || captionTracks[0];

      if (!captionTrack?.baseUrl) {
        return "";
      }

      // Fetch the actual transcript. `baseUrl` comes out of YouTube's page
      // markup, so it is untrusted input and goes through the same guard.
      const { text: transcriptXml } = await safeFetchText(captionTrack.baseUrl);

      // Parse XML transcript
      const $ = cheerio.load(transcriptXml, { xmlMode: true });
      const lines: string[] = [];

      $("text").each((_, element) => {
        const text = $(element)
          .text()
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"');
        lines.push(text);
      });

      return lines.join(" ");
    } catch {
      return "";
    }
  } catch {
    return "";
  }
}

// Fetch YouTube video metadata
async function fetchYouTubeMetadata(
  videoId: string
): Promise<Partial<ProcessedContent>> {
  try {
    const { text } = await safeFetchText(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );

    const data = JSON.parse(text);

    return {
      title: data.title || "YouTube Video",
      author: data.author_name,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      siteName: "YouTube",
    };
  } catch {
    return {
      title: "YouTube Video",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

// Process a regular webpage
async function processWebpage(url: string): Promise<ProcessedContent> {
  // safeFetchText enforces the SSRF, redirect, timeout and size rules.
  const { text: html } = await safeFetchText(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Docsy/1.0; +https://docsy.app)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    allowedContentTypes: [
      "text/html",
      "application/xhtml+xml",
      "text/plain",
      "text/markdown",
    ],
  });

  const $ = cheerio.load(html);

  // Remove unwanted elements
  $(
    "script, style, nav, header, footer, aside, iframe, noscript, .advertisement, .ads, .sidebar, .comments"
  ).remove();

  // Extract metadata
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    "Untitled";

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content");

  const author =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content");

  const publishedDate =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="date"]').attr("content");

  const siteName =
    $('meta[property="og:site_name"]').attr("content") || new URL(url).hostname;

  const thumbnailUrl =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content");

  // Try to find the main content
  let mainContent = "";
  const contentSelectors = [
    "article",
    "main",
    '[role="main"]',
    ".post-content",
    ".article-content",
    ".entry-content",
    ".content",
    "#content",
    ".post",
  ];

  for (const selector of contentSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      mainContent = element.html() || "";
      break;
    }
  }

  // Fallback to body content
  if (!mainContent) {
    mainContent = $("body").html() || "";
  }

  // Convert HTML to Markdown
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Add rules to handle specific elements
  turndownService.addRule("removeEmptyLinks", {
    filter: (node) => {
      return (
        node.nodeName === "A" &&
        (!node.textContent || node.textContent.trim() === "")
      );
    },
    replacement: () => "",
  });

  let markdown = turndownService.turndown(mainContent);

  // Clean up the markdown
  markdown = markdown
    .replace(/\n{3,}/g, "\n\n") // Remove excessive newlines
    .replace(/\[([^\]]*)\]\(\s*\)/g, "$1") // Remove empty links
    .trim();

  // Truncate if too long
  const MAX_LENGTH = 50000;
  if (markdown.length > MAX_LENGTH) {
    markdown = markdown.slice(0, MAX_LENGTH) + "\n\n[Content truncated...]";
  }

  return {
    title: title.trim(),
    content: markdown,
    description,
    author,
    publishedDate,
    siteName,
    thumbnailUrl,
    sourceType: "url",
  };
}

// Process a YouTube video
async function processYouTube(
  url: string,
  videoId: string
): Promise<ProcessedContent> {
  const [metadata, transcript] = await Promise.all([
    fetchYouTubeMetadata(videoId),
    fetchYouTubeTranscript(videoId),
  ]);

  let content = `# ${metadata.title || "YouTube Video"}\n\n`;
  content += `**Source:** ${url}\n`;
  if (metadata.author) content += `**Channel:** ${metadata.author}\n`;
  content += `\n---\n\n`;

  if (transcript) {
    content += `## Transcript\n\n${transcript}`;
  } else {
    content += `*No transcript available for this video. The video may not have captions enabled.*`;
  }

  return {
    title: metadata.title || "YouTube Video",
    content,
    author: metadata.author,
    thumbnailUrl: metadata.thumbnailUrl,
    siteName: "YouTube",
    sourceType: "youtube",
    videoId,
  };
}

export const POST = withApiHandler(
  async (request: NextRequest) => {
    const body: ProcessUrlRequest = await request.json();
    const { url } = body;

    if (!url) {
      throw badRequest("URL is required");
    }

    // Reject non-http(s) schemes and private/loopback/link-local targets
    // before doing any work. Each fetch below re-validates independently,
    // including after redirects.
    await assertPublicUrl(url);

    // Check if it's a YouTube URL
    const videoId = extractYouTubeVideoId(url);

    const result: ProcessedContent = videoId
      ? await processYouTube(url, videoId)
      : await processWebpage(url);

    return {
      success: true,
      ...result,
      url,
      characterCount: result.content.length,
    };
  },
  {
    fallbackMessage: "Failed to process URL",
    // A blocked URL is the one internal error worth showing verbatim: the
    // reason is about the address the caller sent, so a generic 500 would hide
    // information they need. Everything else keeps its detail server-side.
    expose: (error) =>
      error instanceof BlockedUrlError ? badRequest(error.message) : null,
  }
);
