/**
 * Every position of `needle` in `hay` — the list `indexOf(needle, i + 1)` walks, in the
 * same ascending order — without scanning `hay` once per needle.
 *
 * The pipeline asks this of ONE long text for every candidate value: on a 200k-character
 * paste with thousands of candidates, the per-needle scans were the remaining quadratic
 * term of the send. For a long haystack, every K-gram position is bucketed ONCE by hash
 * (a counting sort: two typed arrays); a needle looks up its RAREST gram's bucket and each
 * candidate is confirmed with `startsWith`, so collisions cost a check, never a result.
 * Short haystacks and short needles keep the plain loop.
 */
const K = 4;
const BUCKETS = 1 << 18;
const MIN_INDEXED = 20_000;

type GramIndex = { offsets: Int32Array; positions: Int32Array };

function gram(s: string, at: number): number {
  let h = 0;
  for (let k = 0; k < K; k++) h = (Math.imul(h, 31) + s.charCodeAt(at + k)) | 0;
  return (h >>> 0) & (BUCKETS - 1);
}

function build(hay: string): GramIndex {
  const n = Math.max(0, hay.length - K + 1);
  const hashes = new Int32Array(n);
  const offsets = new Int32Array(BUCKETS + 1);
  for (let i = 0; i < n; i++) {
    const h = gram(hay, i);
    hashes[i] = h;
    (offsets[h + 1] as number)++;
  }
  for (let b = 0; b < BUCKETS; b++) offsets[b + 1] = (offsets[b + 1] as number) + (offsets[b] as number);
  const fill = offsets.slice(0, BUCKETS);
  const positions = new Int32Array(n);
  for (let i = 0; i < n; i++) positions[(fill[hashes[i] as number] as number)++] = i;
  return { offsets, positions };
}

// The few haystacks of the pass in flight (the text, its lowercased and folded copies).
const cache: { hay: string; index: GramIndex }[] = [];

function indexFor(hay: string): GramIndex {
  const hit = cache.find((c) => c.hay === hay);
  if (hit) return hit.index;
  const index = build(hay);
  cache.unshift({ hay, index });
  if (cache.length > 4) cache.pop();
  return index;
}

export function positionsOf(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  if (hay.length < MIN_INDEXED || needle.length < K) {
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) out.push(i);
    return out;
  }
  const { offsets, positions } = indexFor(hay);
  let best = 0;
  let bestSize = Infinity;
  for (let t = 0; t + K <= needle.length; t++) {
    const h = gram(needle, t);
    const size = (offsets[h + 1] as number) - (offsets[h] as number);
    if (size < bestSize) {
      best = t;
      bestSize = size;
      if (!size) return out;
    }
  }
  const h = gram(needle, best);
  for (let k = offsets[h] as number; k < (offsets[h + 1] as number); k++) {
    const i = (positions[k] as number) - best;
    if (i >= 0 && hay.startsWith(needle, i)) out.push(i);
  }
  return out;
}
