import { normalizeMem } from "./memory";
import type { Extraction, ExtractedFact } from "./extractParse";

/**
 * Finish what one extraction started.
 *
 * A single call is capped (`factLimitFor`), so a long answer — « retiens tout ça » over a
 * 20-row table — came back truncated at the ceiling with nothing tracking the remainder.
 * Worse, the later ambient passes re-read the same slice and re-picked whatever they
 * happened to see, so entities were captured in an arbitrary order and most never at all
 * (measured: 11 cards for ~40 entities, and broken pairs — the company without its CEO).
 *
 * So: when a pass FILLS its ceiling, ask again for what is missing — the already-captured
 * entities are handed to the next prompt as an exclusion list. Stops as soon as a pass
 * comes back short (nothing left) or adds nothing new (the model is repeating itself),
 * and never exceeds `maxPasses` — each pass is a real model call, so the bound is the
 * budget, not an optimisation.
 */
export interface SweepOptions {
  /** Facts one call may return — the ceiling a full pass hits. */
  limit: number;
  /** Hard bound on model calls, the first one included. */
  maxPasses?: number;
  /** Entities already in memory before the sweep — excluded from pass 1. */
  known?: readonly string[];
}

export interface SweepResult {
  facts: ExtractedFact[];
  /** Profile from the FIRST pass that offered one (a later pass sees a narrower slice). */
  profile?: string;
  passes: number;
  /** True when the sweep stopped on `maxPasses` with the last pass still full — there is
   *  probably more to capture, and the caller may say so rather than imply completeness. */
  truncated: boolean;
}

export const DEFAULT_MAX_PASSES = 4;

/**
 * `runPass(exclude)` performs ONE extraction and returns its parsed result (or null on a
 * failure the caller already handled). Keeping the call injected is what makes the sweep
 * testable without a model.
 */
export async function sweepExtraction(
  runPass: (exclude: string[]) => Promise<Extraction | null>,
  opts: SweepOptions,
): Promise<SweepResult> {
  const maxPasses = Math.max(1, opts.maxPasses ?? DEFAULT_MAX_PASSES);
  const seen = new Set((opts.known ?? []).map((k) => normalizeMem(k)).filter(Boolean));
  // The exclusion list the NEXT prompt carries: what memory already holds, plus what this
  // sweep has captured. Kept in insertion order so the newest captures are never the ones
  // dropped by the prompt's own cap.
  const exclude: string[] = [...(opts.known ?? [])];
  const facts: ExtractedFact[] = [];
  let profile: string | undefined;
  let passes = 0;
  let lastWasFull = false;

  while (passes < maxPasses) {
    const out = await runPass([...exclude]);
    passes += 1;
    if (!out) break; // the caller handles the failure; a partial sweep is still worth keeping
    if (profile === undefined && out.profile) profile = out.profile;
    const fresh = out.facts.filter((f) => {
      const key = normalizeMem(f.entity);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      exclude.push(f.entity);
      return true;
    });
    facts.push(...fresh);
    lastWasFull = out.facts.length >= opts.limit;
    // Short pass ⇒ nothing left. No NEW entity ⇒ the model is repeating itself, and
    // another call would too.
    if (!lastWasFull || !fresh.length) return { facts, profile, passes, truncated: false };
  }
  return { facts, profile, passes, truncated: lastWasFull };
}
