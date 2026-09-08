// The bench's INFERENCE cache — measured 2026-09-07: the two product columns (`ner` and
// `ner (Strict)`) cost 1 177,8 ms and 1 191,7 ms per case on Gretel, to within one percent,
// because the model runs TWICE over the same text: the two levels differ only by a policy
// applied AFTER detection (`disabledKinds`, notoriety), never by the inference itself. Over
// the five corpora that is 3 h 08 of model time, half of it recomputing what was just
// computed — and every rules-only change (the common case) pays the whole bill again.
//
// So the cache sits at the MODEL BOUNDARY and nowhere else: the raw token-classification
// output for one chunk of text, keyed by that text. Everything downstream — run merging,
// verbatim location, chunk re-offsetting, the local detector's filters, the rules, the
// allocator — re-runs every time. A change to any of them is therefore MEASURED, never
// masked; only the weights' own arithmetic is reused.
//
// ⚠️ This lives in `bench/` and must NEVER move into the product. Writing model output over
// user text to disk would create a new at-rest surface derived from real PII, outside the
// vault and outside the conversation's lifetime (root rule 7). The bench reads synthetic and
// public corpora, which is what makes a durable cache legitimate here.
//
// The file is scratch: machine-local, gitignored, append-only NDJSON (crash-safe — a killed
// run keeps every entry it had written), first line = the model FINGERPRINT. A different
// fingerprint — other weights, other dtype, other pinned revision, other pipeline options —
// starts the file over rather than serving a stale prediction.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** The pipeline surface the bench injects into `createNerPredict`. */
type BenchPipeline = (text: string, opts?: Record<string, unknown>) => Promise<unknown>;

export interface NerCache {
  /** Wrap a pipeline so an already-seen chunk is served from disk. */
  wrap(pipeline: BenchPipeline): BenchPipeline;
  stats(): { hits: number; misses: number; entries: number };
  /** One line for the bench's output — silent when the cache is off. */
  report(): string;
}

const OFF: NerCache = {
  wrap: (p) => p,
  stats: () => ({ hits: 0, misses: 0, entries: 0 }),
  report: () => "",
};

/**
 * Open (or create) the cache at `file` for a model identified by `fingerprint`.
 * `OPENMASQ_BENCH_NER_CACHE=0` disables it — the way to re-measure inference itself, and
 * what CI does when it publishes a latency figure.
 */
export function openNerCache(file: string, fingerprint: string): NerCache {
  if (process.env.OPENMASQ_BENCH_NER_CACHE === "0") return OFF;
  const entries = new Map<string, unknown>();
  let fresh = true;
  if (existsSync(file)) {
    const lines = readFileSync(file, "utf8").split("\n");
    if (lines[0] === fingerprint) {
      fresh = false;
      for (const line of lines.slice(1)) {
        if (!line) continue;
        // A truncated or interleaved line (two bench processes appending at once) is
        // skipped, never trusted: a cache MISS costs time, a wrong hit costs a number.
        try {
          const { k, v } = JSON.parse(line) as { k: string; v: unknown };
          if (k) entries.set(k, v);
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (fresh) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${fingerprint}\n`);
  }
  let hits = 0;
  let misses = 0;
  const key = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);
  return {
    wrap: (pipeline) => async (text, opts) => {
      const k = key(text);
      const hit = entries.get(k);
      if (hit !== undefined) {
        hits++;
        // A structuredClone per hit, because the caller (`mergeRuns`) walks the list and the
        // same chunk is served to both policies: handing out the same object twice would let
        // one pass mutate what the next one reads.
        return structuredClone(hit);
      }
      misses++;
      const raw = await pipeline(text, opts);
      // The MISS path clones too: the caller keeps the model's own object and is free to
      // walk or mutate it, while the cache holds a copy nobody else has a handle on.
      entries.set(k, structuredClone(raw));
      appendFileSync(file, `${JSON.stringify({ k, v: raw })}\n`);
      return raw;
    },
    stats: () => ({ hits, misses, entries: entries.size }),
    report: () =>
      `ner cache: ${hits} hit(s), ${misses} miss(es), ${entries.size} entries — ${file}`,
  };
}
