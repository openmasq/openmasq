// Shared machinery for the checksum-valid id fakers. A fake for a checksummed
// scheme must PASS the scheme's own validator (the fakeCard/fakeIban rationale,
// generalised): a fake that fails its checksum is visible to any validating
// tool/agent and invites the model to "correct" it — and a corrected fake no
// longer reverse-maps. Every generator here builds a candidate and then REPAIRS
// its check positions against the ENGINE's validator itself, so the generator
// can never drift from what detection considers valid (rule 9: the checksum
// algorithm keeps ONE home, `engine/validators`).
import { hashString } from "../primitives";

export type Rng = (n: number) => number;

/** Deterministic LCG seeded on the COMPACT value (alnum only) + salt — the
 *  fakeDigits doctrine: the same id under any spacing/grouping yields the same
 *  fake, re-laid under each spelling's own separators. */
export function rngFor(compact: string, salt: number): Rng {
  let h = (hashString(compact) + salt) >>> 0 || 1;
  return (n: number) => {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    return h % n;
  };
}

export const DIGITS = "0123456789";
export const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** `n` chars drawn from `cs`. */
export function draw(rng: Rng, n: number, cs: string = DIGITS): string {
  let out = "";
  for (let i = 0; i < n; i++) out += cs[rng(cs.length)];
  return out;
}

/** Two-digit zero-padded. */
export const p2 = (n: number): string => String(n).padStart(2, "0");
/** Three-digit zero-padded. */
export const p3 = (n: number): string => String(n).padStart(3, "0");

/** A structurally valid, boring date triple (day 1-28, month 1-12). */
export function fakeDMY(rng: Rng): { d: string; m: string; y: string } {
  return { d: p2(1 + rng(28)), m: p2(1 + rng(12)), y: p2(rng(100)) };
}

/** Brute-force the CHECK positions of `candidate` against the scheme's own
 *  validator: try every charset combination at the given indices (≤2 positions
 *  in practice) and return the first that validates — or null when the body
 *  admits no valid check (some mod-11 bodies don't; the caller retries with a
 *  fresh body). Using the validator itself is what guarantees parity. */
export function repair(
  candidate: string,
  specs: Array<{ i: number; cs: string }>,
  valid: (s: string) => boolean,
): string | null {
  const chars = candidate.split("");
  const rec = (k: number): string | null => {
    if (k === specs.length) {
      const s = chars.join("");
      return valid(s) ? s : null;
    }
    for (const c of specs[k].cs) {
      chars[specs[k].i] = c;
      const r = rec(k + 1);
      if (r) return r;
    }
    return null;
  };
  return rec(0);
}

/** Repair the LAST digit — the most common check-digit position. */
export function repairLast(candidate: string, valid: (s: string) => boolean): string | null {
  return repair(candidate, [{ i: candidate.length - 1, cs: DIGITS }], valid);
}

/** The value stripped to its alphanumerics — the canonical form the schemes
 *  reason on (separators/wraps are LAYOUT, restored by `relayId`). */
export function compactId(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "");
}

/** Re-lay a fake compact id under the ORIGINAL value's separators, with a
 *  mid-value line WRAP flattened to one space — exactly like `fakeDigits`: a
 *  model normalises line breaks when echoing, and a fake carrying the
 *  original's newline no longer reverse-maps. */
export function relayId(value: string, fakeCompact: string): string {
  const laid = value.replace(/[ \t]*\r?\n[ \t]*/g, " ");
  let i = 0;
  return laid.replace(/[A-Za-z0-9]/g, () => fakeCompact[i++] ?? "");
}
