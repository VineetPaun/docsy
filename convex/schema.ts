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
  }).index("by_user", ["userId"]),

  documents: defineTable({
    notebookId: v.id("notebooks"),
    userId: v.id("users"),
    name: v.string(),
    type: v.string(), // pdf, docx, txt, etc.
    storageId: v.optional(v.string()),
    content: v.optional(v.string()), // extracted text content
    createdAt: v.number(),
  })
    .index("by_notebook", ["notebookId"])
    .index("by_user", ["userId"]),
});
