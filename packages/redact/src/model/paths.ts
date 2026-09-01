import { splitPath, fakePathSegment, isDistinctivePathSegment, hasDistinctiveSegment } from "./fakes";

/**
 * Vault-aware filesystem-path faking (the analogue of `identity.ts`'s name/email
 * machinery). {@link buildFakePath} fakes each path SEGMENT deterministically from
 * its own value — so a shared segment gets the SAME fake in every path (structure
 * preserved, navigable) — and returns per-segment `pairs` for the DISTINCTIVE
 * segments (username, custom folder, filename) so `pseudonymize` can vault each one
 * INDIVIDUALLY. That makes a recomposed / standalone segment reversible too, and
 * keeps the value atomic across the conversation.
 *
 * GENERIC segments (`Users`, `Desktop`, `Documents`, drive roots…) are left
 * VERBATIM and never vaulted — they're not identifying, and vaulting them would
 * forward-apply to the same common word in ordinary prose (over-redaction), exactly
 * the trap `isNamePart`/stopwords guard against for names. Hidden and restorable are
 * the SAME set (`isDistinctivePathSegment`, in `fakes/paths.ts`): scrambling a
 * segment we refuse to vault made every recomposed path irreversible.
 */

/** Index of the last non-empty SEGMENT (even index) in a `splitPath` parts array. */
function lastSegIndex(parts: string[]): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (i % 2 === 0 && parts[i]) return i;
  }
  return -1;
}

/**
 * Build a fake path + the `[fakeSegment, realSegment]` pairs for its DISTINCTIVE
 * segments. The filename pair carries the extension (`stock_plot.py`) so a
 * recomposed full filename reverses. `attempt` perturbs on collision (see fakePath).
 */
export function buildFakePath(
  value: string,
  attempt = 0,
  salt = 0,
  convKey?: Uint8Array,
): { fake: string; pairs: [string, string][] } {
  const { head, ext, parts } = splitPath(value);
  const lastIdx = lastSegIndex(parts);
  const pairs: [string, string][] = [];
  // Same rule as `fakePath`, and for the same reason: with no distinctive segment
  // there is nothing to hide, and a "fake" equal to the real would be rejected by the allocator.
  const keepGeneric = hasDistinctiveSegment(parts);
  let out = head;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out += parts[i];
      continue;
    }
    const seg = parts[i];
    if (!seg) continue;
    if (keepGeneric && !isDistinctivePathSegment(seg)) {
      out += seg;
      continue;
    }
    const fakeSeg = fakePathSegment(seg, attempt + salt, convKey);
    out += fakeSeg;
    if (isDistinctivePathSegment(seg)) {
      const isLast = i === lastIdx;
      pairs.push([isLast ? fakeSeg + ext : fakeSeg, isLast ? seg + ext : seg]);
    }
  }
  return { fake: out + ext, pairs };
}
