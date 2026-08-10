/**
 * Splitting narration into ElevenLabs-sized requests.
 *
 * A single text-to-speech call caps the text it accepts, so a 10-minute script
 * (~12,000 chars) used to be truncated to the first 5,000 and the rest of the
 * episode was simply never narrated (AUDIT.md §4.3). Splitting on sentence
 * boundaries and concatenating the returned MP3s narrates the whole thing.
 */

// ElevenLabs drops anything past this in one request.
export const TTS_CHAR_LIMIT = 5000;

/**
 * Hard ceiling on requests per overview. Each chunk is a paid call, so an
 * unexpectedly long script must not fan out without bound — a "long" overview
 * targets 1,500–2,000 words (~12,000 chars ≈ 3 chunks), so 8 leaves generous
 * headroom while capping the blast radius of a model that ignores the prompt.
 */
export const MAX_TTS_CHUNKS = 8;

/**
 * Split `text` into pieces of at most `limit` characters, preferring sentence
 * boundaries so a chunk never ends mid-word (which is audible as a clipped
 * syllable at the seam).
 *
 * A single sentence longer than `limit` falls back to packing whole words, and
 * only a single word longer than `limit` is cut mid-word — rare, but text must
 * never be silently dropped.
 *
 * @returns chunks in narration order; `[]` for text that is empty or whitespace.
 */
export function splitForTts(
  text: string,
  limit: number = TTS_CHAR_LIMIT
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= limit) return [trimmed];

  // Keep the punctuation with the sentence it ends: split *after* .!? plus
  // whitespace. Text with no sentence punctuation at all yields one long piece,
  // which the hard-split branch below then handles.
  const sentences = trimmed.split(/(?<=[.!?])\s+/);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  // Append one whitespace-free token, opening a new chunk when it would not
  // fit. A token that cannot fit any chunk is cut — nothing else can be done
  // with it, and dropping it would lose narration.
  const push = (token: string) => {
    if (token.length > limit) {
      flush();
      for (let i = 0; i < token.length; i += limit) {
        chunks.push(token.slice(i, i + limit));
      }
      return;
    }

    // +1 for the space that rejoins this token to the previous one.
    if (current && current.length + 1 + token.length > limit) {
      flush();
    }

    current = current ? `${current} ${token}` : token;
  };

  for (const sentence of sentences) {
    // A sentence that fits is kept whole, so chunk seams land at full stops.
    // One that does not is packed word by word instead, which keeps the seam
    // between words rather than inside one — a mid-word cut is audible.
    if (sentence.length > limit) {
      for (const word of sentence.split(/\s+/)) {
        if (word) push(word);
      }
      continue;
    }

    push(sentence);
  }

  flush();
  return chunks;
}

/**
 * Join MP3 segments into one buffer.
 *
 * Concatenating MP3 frame streams is valid — every decoder reads frame headers
 * sequentially — so no container remux is needed. The seam can carry a few ms of
 * silence, which reads as a natural pause between sentences.
 */
export function concatAudio(segments: ArrayBuffer[]): ArrayBuffer {
  const total = segments.reduce((sum, s) => sum + s.byteLength, 0);
  const merged = new Uint8Array(total);

  let offset = 0;
  for (const segment of segments) {
    merged.set(new Uint8Array(segment), offset);
    offset += segment.byteLength;
  }

  return merged.buffer;
}
