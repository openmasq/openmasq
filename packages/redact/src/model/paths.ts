import { splitPath, fakePathSegment, isDistinctivePathSegment, hasDistinctiveSegment } from "./fakes";
import type { NotorietyOpts } from "./notorious";
import { usernameIndex, fakeUsername, fakeSegmentText } from "./pathText";

/**
 * Vault-aware filesystem-path faking (the analogue of `identity.ts`'s name/email
 * machinery). A path is masked LIKE A SENTENCE: the root, the generic folders, the
 * extension, the separators, the counters and every meaning word stay; the USERNAME becomes
 * a realistic account name; the ENTITIES found in a segment (`pseudonymize/pathEntities.ts`)
 * take THEIR OWN vault fakes — a company in a file name and in a message is one fake; an
 * identifier token gets a same-shape fake; at Strict a word no lexicon vouches for becomes a
 * pronounceable stand-in (`pathText/`).
 *
 * Each CHANGED distinctive segment is vaulted beside the path (`pairs`), so a recomposed /
 * standalone segment reverses too. GENERIC segments (`Users`, `Desktop`…) are left
 * VERBATIM and never vaulted — vaulting them would forward-apply to the same common word in
 * prose. Hidden and restorable are the SAME set: what a segment hides is either an entity
 * (vaulted as itself) or part of a changed segment (vaulted as that segment).
 *
 * Fail CLOSED: no `sem`, a failed segment detection, or an entity with no vault fake ⇒ the
 * segment gets the full scramble (`fakePathSegment`), never verbatim.
 *
 * ⚠️ ACCEPTED RESIDUAL (said to the user — the help site and the category's in-app detail):
 * below Strict, a word of a file or folder name that no detector, no file-name heuristic and
 * no earlier mask recognised is sent AS IS (« Rénovation cuisine Dumoulard » keeps
 * « Dumoulard »). At Strict it becomes a pronounceable stand-in. Counters, years and 4-digit
 * numbers are kept at every level (« 2025-0147 »).
 */
export interface PathSemantics {
  strict: boolean;
  notoriety: NotorietyOpts;
  /** Segment detection failed: scramble every distinctive segment. */
  failed: boolean;
  /** Real entity values inside this path — allocated before it. */
  entities: readonly string[];
  /** The vault fake of one of them. */
  resolve: (real: string) => string | undefined;
  /** The real value a fake already stands for in the vault, if any. */
  ownerOf?: (fake: string) => string | undefined;
}

/** Index of the last non-empty SEGMENT (even index) in a `splitPath` parts array. */
function lastSegIndex(parts: string[]): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (i % 2 === 0 && parts[i]) return i;
  }
  return -1;
}

/**
 * Build a fake path + the `[fakeSegment, realSegment]` pairs for its CHANGED distinctive
 * segments. The filename pair carries the extension (`stock_plot.py`) so a recomposed full
 * filename reverses. `attempt` perturbs on collision (see fakePath).
 */
export function buildFakePath(
  value: string,
  attempt = 0,
  salt = 0,
  convKey?: Uint8Array,
  sem?: PathSemantics,
): { fake: string; pairs: [string, string][] } {
  const { head, ext, parts } = splitPath(value);
  const lastIdx = lastSegIndex(parts);
  const user = usernameIndex(head, parts);
  const pairs: [string, string][] = [];
  // With no distinctive segment there is nothing to keep readable, and a "fake" equal to
  // the real would be rejected by the allocator: every segment is replaced then.
  const keepGeneric = hasDistinctiveSegment(parts);
  const a = attempt + salt;
  const ctx = sem && !sem.failed ? { ...sem, attempt: a, convKey } : undefined;
  let out = head;
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out += parts[i];
      continue;
    }
    const seg = parts[i];
    if (!seg) continue;
    let fakeSeg: string;
    if (keepGeneric && !isDistinctivePathSegment(seg)) fakeSeg = seg;
    else if (keepGeneric && i === user) {
      const owner = sem?.ownerOf;
      fakeSeg = fakeUsername(seg, a, convKey, (c) => !owner || [undefined, seg].includes(owner(c)));
    }
    else fakeSeg = (ctx && fakeSegmentText(seg, ctx, !keepGeneric)) ?? fakePathSegment(seg, a, convKey);
    out += fakeSeg;
    if (fakeSeg !== seg && isDistinctivePathSegment(seg)) {
      const isLast = i === lastIdx;
      pairs.push([isLast ? fakeSeg + ext : fakeSeg, isLast ? seg + ext : seg]);
    }
  }
  return { fake: out + ext, pairs };
}
