import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Running total of bytes this account has stored, maintained by
    // convex/lib/quota.ts on every source create, content update and delete.
    // Optional because rows created before the quota landed have no total;
    // treated as 0, so an existing account starts from an undercount.
    storageBytes: v.optional(v.number()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  notebooks: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Canvas/Editor content
    canvasContent: v.optional(v.string()), // JSON string for editor state
    canvasHtml: v.optional(v.string()), // Rendered HTML for preview
    canvasLastEditedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    // Dashboard order (most recently updated first), read straight from the
    // index instead of collecting every notebook and sorting.
    .index("by_user_updated", ["userId", "updatedAt"]),

  documents: defineTable({
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    name: v.string(),
    type: v.string(), // pdf, docx, txt, etc.
    storageId: v.optional(v.string()),
    content: v.optional(v.string()), // extracted text content
    createdAt: v.number(),
    // New fields for URL/YouTube sources
    sourceType: v.optional(v.string()), // "file" | "url" | "youtube"
    sourceUrl: v.optional(v.string()), // Original URL for web/youtube sources
    thumbnailUrl: v.optional(v.string()), // Thumbnail for YouTube videos
    metadata: v.optional(v.string()), // JSON string for additional metadata (author, duration, etc.)
    // Stored file size + extracted text length, counted against the account's
    // quota. Recorded here so a delete can subtract without re-reading the
    // storage metadata of a file it is about to remove.
    bytes: v.optional(v.number()),
    // "indexed" | "skipped" | "failed" — whether this source made it into the
    // vector store. Without it a source that never embedded looks identical to
    // one that did, while silently contributing nothing to any answer
    // (AUDIT.md §9.6). Absent on rows created before it existed.
    indexStatus: v.optional(v.string()),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"])
    // Newest-first listing without loading every row and sorting in JS.
    .index("by_notebook_created", ["notebookId", "createdAt"]),

  // Audio overviews for NotebookLM-style podcast generation
  audioOverviews: defineTable({
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    scriptText: v.optional(v.string()), // The generated script
    audioStorageId: v.optional(v.string()), // Convex storage ID for audio file
    // "pending" | "generating_script" | "synthesizing" — non-terminal, written
    // by /api/audio-overview as it works. Terminal: "ready", "script_only"
    // (script but no MP3), "failed". Legacy rows may hold "generating"/"error".
    status: v.string(),
    errorMessage: v.optional(v.string()),
    duration: v.optional(v.number()), // Audio duration in seconds
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),

  // One fixed-window counter per user per rate-limited route (AUDIT.md §3.4).
  // Convex rather than Redis because it deploys with the app and needs no new
  // env var — a missing one here would fail silently, which is this repo's
  // most common failure mode.
  rateLimits: defineTable({
    userId: v.id("users"),
    key: v.string(), // route bucket — see RATE_LIMITS in convex/users.ts
    windowStart: v.number(),
    count: v.number(),
  }).index("by_user_key", ["userId", "key"]),

  // Chat messages for notebook conversations
  messages: defineTable({
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    role: v.string(), // "user" | "assistant"
    content: v.string(),
    timestamp: v.number(),
    sources: v.optional(v.array(v.string())),
    citations: v.optional(v.string()), // JSON string of Citation[]
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"])
    // Transcript order. Chat history is the fastest-growing table here, so it
    // is the one that must never be read whole.
    .index("by_notebook_time", ["notebookId", "timestamp"]),

  // Svix delivery ids already applied, so a redelivered event is acknowledged
  // instead of re-run (AUDIT.md §10). Upsert and delete are both idempotent on
  // their own; what this stops is a *replayed old* event overwriting a newer
  // profile.
  webhookEvents: defineTable({
    svixId: v.string(),
    seenAt: v.number(),
  })
    .index("by_svix_id", ["svixId"])
    .index("by_seen_at", ["seenAt"]),
});
