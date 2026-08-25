// Atomic fake identity for GLUED (separatorless) handles — "atelierverrier". The
// no-separator analogue of `name.ts`'s `reconstructName`: segment the value into reals the
// vault already knows and glue their canonical fakes, so one identity never splits in two.
// Pure + deterministic (the caller owns the vault).
import { capitalize } from "../../util";

/** Recase a component fake to the casing of the real span it stands in for:
 *  all-lower → lower, ALL-CAPS → upper, Title/mixed → Title. */
const recasePiece = (fake: string, span: string): string => {
  if (span === span.toLowerCase()) return fake.toLowerCase();
  if (span.length > 1 && span === span.toUpperCase()) return fake.toUpperCase();
  return capitalize(fake.toLowerCase());
};

/**
 * Reconstruct a GLUED (separatorless) entity's fake ENTIRELY from canonical fakes the
 * vault already knows — the no-separator analogue of {@link reconstructName}. A handle
 * written with NO separator ("atelierverrier") routinely decomposes into real values
 * the vault already faked ("atelier"+"verrier" → "charlotte"+"savel"). Faking it
 * through the generic ORG pool instead mints a FRESH, unrelated fake ("Brantley
 * Systems"), so ONE real identity hides behind TWO disconnected fakes — the reported
 * ORG-glue "double redaction". This segments `value` (case-insensitively) into a
 * sequence of known reals — each ≥3 letters, together covering the WHOLE value in ≥2
 * pieces — and glues each piece's canonical fake, recased to its span of `value`.
 *
 * Returns null (→ caller mints a normal fresh fake) when the value carries a separator,
 * is too short, or can't be fully covered by known reals. `segments` are the vault's
 * real originals to try; `resolveFake` maps a real to its canonical fake. Because the
 * fake is built only from OTHER fakes it never leaks the real, and it's registered by
 * the caller so it stays reversible. Pure + deterministic.
 */
export function reconstructGlued(
  value: string,
  resolveFake: (real: string) => string | undefined,
  segments: Iterable<string>,
): string | null {
  if (/[\s._@-]/.test(value)) return null; // GLUED (separatorless) values only
  const lc = value.toLowerCase();
  const n = lc.length;
  if (n < 6) return null; // too short to be a meaningful glue of ≥2 names
  // Distinctive letter-only reals, longest first (deterministic). A single fake-yielding
  // segment must be ≥3 chars so a stray 1-2 char real can't fragment an unrelated word.
  const segs = [
    ...new Set(
      [...segments]
        .filter((s) => /^[A-Za-zÀ-ÿ]{3,}$/.test(s))
        .map((s) => s.toLowerCase()),
    ),
  ].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  if (!segs.length) return null;
  // DP over cut points: reach[j] = value[0..j) is coverable; prev[j] = the segment ending there.
  const reach = new Array(n + 1).fill(false);
  const prev: (string | null)[] = new Array(n + 1).fill(null);
  reach[0] = true;
  for (let i = 0; i < n; i++) {
    if (!reach[i]) continue;
    for (const s of segs) {
      if (lc.startsWith(s, i)) {
        const j = i + s.length;
        if (!reach[j]) {
          reach[j] = true;
          prev[j] = s;
        }
      }
    }
  }
  if (!reach[n]) return null;
  const pieces: { seg: string; start: number }[] = [];
  for (let j = n; j > 0; ) {
    const s = prev[j];
    if (!s) return null;
    const i = j - s.length;
    pieces.unshift({ seg: s, start: i });
    j = i;
  }
  if (pieces.length < 2) return null; // a single canonical is handled by normal reuse
  let out = "";
  for (const { seg, start } of pieces) {
    const fake = resolveFake(seg);
    if (!fake) return null;
    out += recasePiece(fake, value.slice(start, start + seg.length));
  }
  return out;
}
