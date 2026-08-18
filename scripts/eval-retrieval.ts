/**
 * Retrieval eval harness (AUDIT.md §7).
 *
 * Every retrieval improvement — reranking, hybrid search, chunking changes — is
 * unmeasurable without this. Run it before and after a change; if hit-rate and
 * MRR do not move, the change did nothing, and AI failures are silent enough
 * that "it feels better" is not evidence.
 *
 * Usage:
 *
 *   cp eval/questions.example.json eval/questions.json   # then edit it
 *   bun run eval <notebookId>
 *
 * It reads `.env.local` (Bun loads it automatically) and needs the same
 * retrieval variables `/api/chat` does: GOOGLE_API_KEY (or GEMINI_API_KEY) and
 * QDRANT_URL / QDRANT_API_KEY. Nothing is written — this only queries.
 *
 * ponytail: retrieval only. Answer faithfulness needs a judge model and a
 * ground-truth answer per question, which is a bigger commitment than the thing
 * it grades; add it when retrieval stops being the bottleneck.
 */

import { generateEmbedding } from "../lib/embeddings";
import { retrievalLimitFor, searchChunks } from "../lib/qdrant";

/** One eval case. `expectSources` matches loosely against a source's name. */
interface EvalCase {
  question: string;
  expectSources: string[];
}

const QUESTIONS_PATH = "eval/questions.json";

// Matches the widest window the app will ask for, so the eval measures the
// retriever rather than a narrower slice of it.
const EVAL_LIMIT = retrievalLimitFor(1_000_000);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const notebookId = process.argv[2];

if (!notebookId) {
  fail("Usage: bun run eval <notebookId>");
}

if (!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) {
  fail("GOOGLE_API_KEY is not set — embedding the questions needs it.");
}

if (!process.env.QDRANT_URL) {
  fail("QDRANT_URL is not set — there is nothing to search.");
}

const file = Bun.file(QUESTIONS_PATH);

if (!(await file.exists())) {
  fail(
    `${QUESTIONS_PATH} not found. Copy eval/questions.example.json to it and write 20-30 questions about a notebook you control.`
  );
}

const cases = (await file.json()) as EvalCase[];

if (!Array.isArray(cases) || cases.length === 0) {
  fail(`${QUESTIONS_PATH} is empty.`);
}

/** Rank (1-based) of the first result from an expected source, or 0 for a miss. */
function firstExpectedRank(
  names: string[],
  expectSources: string[]
): number {
  const wanted = expectSources.map((s) => s.toLowerCase());

  for (let i = 0; i < names.length; i++) {
    const name = names[i].toLowerCase();
    if (wanted.some((w) => name.includes(w))) return i + 1;
  }

  return 0;
}

let hits = 0;
let hitsAt3 = 0;
let reciprocalRankTotal = 0;
const rows: string[] = [];

for (const evalCase of cases) {
  const embedding = await generateEmbedding(evalCase.question);
  const results = await searchChunks(embedding, notebookId, {
    limit: EVAL_LIMIT,
  });

  const names = results.map((r) => r.documentName ?? "");
  const rank = firstExpectedRank(names, evalCase.expectSources);

  if (rank > 0) {
    hits++;
    if (rank <= 3) hitsAt3++;
    reciprocalRankTotal += 1 / rank;
  }

  const verdict = rank === 0 ? "MISS" : `rank ${rank}`;
  const top = names[0] ? ` (top: ${names[0]})` : " (no results)";

  rows.push(
    `${rank === 0 ? "✗" : "✓"} ${verdict.padEnd(8)} ${evalCase.question.slice(0, 60)}${top}`
  );
}

const total = cases.length;
const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;

process.stdout.write(
  [
    "",
    ...rows,
    "",
    `cases         ${total}`,
    `hit@${EVAL_LIMIT}        ${hits}/${total} (${pct(hits)})`,
    `hit@3         ${hitsAt3}/${total} (${pct(hitsAt3)})`,
    `MRR           ${(reciprocalRankTotal / total).toFixed(3)}`,
    "",
    "hit@3 and MRR are the numbers to watch: hit@20 stays high long after",
    "precision has rotted, because the answer is in there somewhere.",
    "",
  ].join("\n")
);
