/**
 * From what the engine REDACTED to character spans on the input — the engine's own
 * substitution rules, replayed to collect offsets instead of substituting.
 *
 * `pseudonymize` returns the vault (token → real value) and a text where every value has
 * been swapped by `applyVault` (every standalone occurrence, longest value first, never
 * inside a word) then `applyVaultVariants` (case and spacing variants of the same value).
 * Nothing in that result carries offsets, so this walks the SAME regexes over the ORIGINAL
 * text; the spans below are the characters the product replaced, no more, no less.
 * (`exclude` and the URL guard are not replayed: this bench runs with every category on and
 * the URL category at its default.)
 */
import { escapeRegExp, isWordGlued, variantOccurrences } from "../../src/index";
import type { PredSpan } from "./metric";

export function vaultSpans(input: string, vault: Readonly<Record<string, string>>): PredSpan[] {
  const values = [...new Set(Object.values(vault).filter((v) => v.length > 0))].sort((a, b) => b.length - a.length);
  if (!values.length) return [];
  const out: PredSpan[] = [];
  const re = new RegExp(values.map(escapeRegExp).join("|"), "g");
  for (let m = re.exec(input); m; m = re.exec(input)) {
    if (!isWordGlued(input, m.index, m[0])) out.push([m.index, m.index + m[0].length]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  for (const value of values) {
    const singleWord = value.split(/[\s._-]+/).filter(Boolean).length <= 1;
    for (const occ of variantOccurrences(input, value)) {
      if (occ === value) continue;
      if (singleWord && !/\p{Lu}/u.test(occ)) continue;
      const r = new RegExp(escapeRegExp(occ), "g");
      for (let k = r.exec(input); k; k = r.exec(input)) {
        if (!isWordGlued(input, k.index, k[0])) out.push([k.index, k.index + k[0].length]);
        if (k.index === r.lastIndex) r.lastIndex++;
      }
    }
  }
  return merge(out);
}

/** Sorted, overlap-free spans — what every scorer expects. */
export function merge(spans: PredSpan[]): PredSpan[] {
  const s = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: PredSpan[] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
