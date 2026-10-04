/**
 * `input.includes(c)`, asked thousands of times against ONE long text — the allocator
 * checks every fake it mints against the input. On a 200k-character paste each call is a
 * full scan, and they added up to seconds on the send.
 *
 * Same answer, cheaper NO: every K-gram of the input sets one bit of a hash bitmap, built
 * once. A query whose K-grams are not ALL marked cannot occur in the input — that answer is
 * exact. Any other query (all marked, possibly by collision, or shorter than K) falls back
 * to `includes`, so a YES is always the real one. Short inputs skip the index entirely.
 */
const K = 5;
const BITS = 1 << 22;
const MIN_INDEXED = 20_000;

function gramHash(s: string, at: number): number {
  let h = 0;
  for (let k = 0; k < K; k++) h = (Math.imul(h, 31) + s.charCodeAt(at + k)) | 0;
  return (h >>> 0) & (BITS - 1);
}

// The allocator and the side pairs of one pass share the text: one index for both.
let last: { input: string; test: (c: string) => boolean } | null = null;

export function substringTest(input: string): (c: string) => boolean {
  if (last?.input !== input) last = { input, test: makeTest(input) };
  return last.test;
}

function makeTest(input: string): (c: string) => boolean {
  if (input.length < MIN_INDEXED) return (c) => input.includes(c);
  let bitmap: Uint32Array | null = null;
  const build = (): Uint32Array => {
    const b = new Uint32Array(BITS >>> 5);
    for (let i = 0; i + K <= input.length; i++) {
      const h = gramHash(input, i);
      b[h >>> 5] |= 1 << (h & 31);
    }
    return b;
  };
  return (c) => {
    if (c.length < K) return input.includes(c);
    bitmap ??= build();
    for (let i = 0; i + K <= c.length; i++) {
      const h = gramHash(c, i);
      if (!((bitmap[h >>> 5] as number) & (1 << (h & 31)))) return false;
    }
    return input.includes(c);
  };
}
