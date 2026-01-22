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
  }).index("by_user", ["userId"]),

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
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),

  // Audio overviews for NotebookLM-style podcast generation
  audioOverviews: defineTable({
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    scriptText: v.optional(v.string()), // The generated script
    audioStorageId: v.optional(v.string()), // Convex storage ID for audio file
    status: v.string(), // "pending" | "generating_script" | "synthesizing" | "ready" | "failed"
    errorMessage: v.optional(v.string()),
    duration: v.optional(v.number()), // Audio duration in seconds
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),

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
    .index("by_user", ["userId"]),
});
