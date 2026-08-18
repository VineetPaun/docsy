/**
 * Turn a follow-up question into one that can be embedded (AUDIT.md §7).
 *
 * Retrieval embeds the user's message verbatim, so "what about the second one?"
 * becomes a vector for the words "second one" — nothing to do with the topic,
 * and the search comes back empty or wrong. The fix is to rewrite the follow-up
 * into a standalone question using the conversation so far.
 *
 * ponytail: rewriting costs an extra LLM call, so it only happens when the
 * question actually reads as context-dependent (`needsRewrite`). A failed or
 * suspicious rewrite falls back to the original text — a worse query is
 * recoverable, a wrong one is not.
 */

import { chatWithOpenRouter, type ModelId } from "./openrouter";

/** A rewrite longer than this is the model explaining itself, not rewriting. */
const MAX_REWRITE_CHARS = 300;

/**
 * Signals that a question cannot stand on its own.
 *
 * Bare pronouns, deictics and comparatives — plus anything very short, which is
 * almost always shorthand for the previous turn ("and the costs?").
 */
const CONTEXT_DEPENDENT = [
  /^(and|but|so|also|what about|how about|why|why not|then)\b/i,
  /\b(it|its|it's|they|them|their|that|those|these|this|he|she|his|her)\b/i,
  /\b(the (first|second|third|last|other|previous|latter|former)|the same)\b/i,
  /\b(instead|as well|too|again|more|less|elaborate|expand)\b/i,
];

/**
 * Whether a question needs the conversation to make sense.
 *
 * Exported for `lib/query-rewrite.test.ts`.
 */
export function needsRewrite(question: string, hasHistory: boolean): boolean {
  if (!hasHistory) return false;

  const text = question.trim();
  if (!text) return false;

  // Six words or fewer is shorthand far more often than it is a full question.
  if (text.split(/\s+/).length <= 6) return true;

  return CONTEXT_DEPENDENT.some((pattern) => pattern.test(text));
}

/**
 * Accept a rewrite only if it looks like a question rather than commentary.
 *
 * The model is being asked to transform untrusted user text, so the output is
 * treated as untrusted too: one line, bounded length, no preamble, or the
 * original wins.
 *
 * Exported for `lib/query-rewrite.test.ts`.
 */
export function sanitiseRewrite(
  rewritten: string,
  original: string
): string {
  const first = rewritten.trim().split("\n")[0]?.trim() ?? "";

  // Models like to answer with `Standalone question: …`.
  const stripped = first.replace(/^[a-z ]{0,24}question:\s*/i, "").trim();

  if (!stripped || stripped.length > MAX_REWRITE_CHARS) return original;

  // A rewrite that lost most of the question is worse than no rewrite.
  if (stripped.length < 3) return original;

  return stripped;
}

const REWRITE_SYSTEM_PROMPT = `You rewrite the user's latest message into a single standalone search query.

Rules:
- Resolve pronouns and references using the conversation.
- Keep the user's own terminology; do not add facts.
- Reply with the rewritten question only. No preamble, no explanation, one line.`;

/**
 * Rewrite `question` into a standalone query, or return it unchanged.
 *
 * Never throws: retrieval must still run if the rewrite call fails.
 */
export async function rewriteQuery(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
  model: ModelId
): Promise<string> {
  if (!needsRewrite(question, history.length > 0)) return question;

  // The last two turns are enough to resolve a reference, and keep the extra
  // call cheap.
  const context = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
    .join("\n");

  try {
    const rewritten = await chatWithOpenRouter(
      [
        { role: "system", content: REWRITE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Conversation:\n${context}\n\nLatest message: ${question}`,
        },
      ],
      model,
      { temperature: 0, maxTokens: 120 }
    );

    return sanitiseRewrite(rewritten, question);
  } catch {
    return question;
  }
}
