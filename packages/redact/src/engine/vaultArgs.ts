import { unredact } from "./vault";
import type { Vault } from "../types";

/**
 * Restore MUTATED multi-word fakes in an outward arg. A model sometimes "corrects" a
 * scrambled fake into a plausible name by TRUNCATING its last word ("Léa Croshml" →
 * "Léa Cros", measured on the live web) — the exact-match restore then misses it and
 * the dispatched query carries the degraded fake (a search about nobody). Only the
 * OUTWARD direction (args), where restoring toward the REAL value is the wanted
 * behaviour. Strict on purpose: leading words verbatim, last word must be one of the
 * fake's own prefixes (length ≥ max(4, len−4)) as a WHOLE word — "Léa Berliand" never
 * matches, and an AMBIGUOUS pattern (two fakes sharing it) is skipped.
 */
function restoreMutatedFakes(input: string, vault: Vault): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Group the multi-word fakes by their LEADING words: the truncated last word must
  // identify EXACTLY ONE fake of its group, else nothing is guessed.
  const groups = new Map<string, { last: string; minLen: number; real: string }[]>();
  for (const [fake, real] of Object.entries(vault)) {
    const words = fake.trim().split(/\s+/);
    const last = words[words.length - 1];
    if (words.length < 2 || last.length < 5) continue;
    const head = words.slice(0, -1).join(" ").toLowerCase();
    const list = groups.get(head) ?? [];
    list.push({ last, minLen: Math.max(4, last.length - 4), real });
    groups.set(head, list);
  }
  let out = input;
  for (const [head, list] of groups) {
    const headPat = head.split(" ").map(esc).join("[ +]");
    // A truncated whole-word tail: 4+ letters, shorter than the longest fake tail.
    const re = new RegExp(`\\b${headPat}[ +]([\\p{L}\\d]{4,})\\b`, "giu");
    out = out.replace(re, (m, tail: string) => {
      const t = tail.toLowerCase();
      const hits = list.filter(
        (f) => t.length >= f.minLen && t.length < f.last.length && f.last.toLowerCase().startsWith(t),
      );
      return hits.length === 1 ? hits[0].real : m;
    });
  }
  return out;
}

/**
 * Restore a SINGLE-TOKEN fake the model MUTATED in its REPLY — measured shape: a long
 * scrambled filename whose tail is duplicated (« …-YRI-nKVc.csv » rewritten as
 * « …-YRI-nKVnKV-nKV-nKV.csv », log 02/08): the exact-match misses it, and the user
 * reads gibberish in place of THEIR OWN file. Repaired only when EVERYTHING holds:
 *  - the text's token is long (≥ 16), carries a digit AND a separator (`-_.`) —
 *    the shape of a scramble, never of an ordinary word;
 *  - it shares with the fake a prefix ≥ max(16, 75% of the fake) AND ≥ 60% of the token
 *    (the double threshold stops a short "sibling" fake sharing a path's directory
 *    prefix from stealing the repair);
 *  - ONLY ONE fake satisfies this — two candidates ⇒ we don't guess.
 * DISPLAY path ONLY ({@link unredactReply}): at worst the user sees a
 * real name where the model wrote noise — never a byte sent outward.
 */
function restoreMutatedTokens(input: string, vault: Vault): string {
  const fakes = Object.entries(vault).filter(
    ([f]) => f.length >= 16 && !/\s/.test(f) && /\d/.test(f) && /[-_.]/.test(f),
  );
  if (!fakes.length) return input;
  const TOKEN = /[A-Za-z0-9À-ÿ/\\][A-Za-z0-9À-ÿ._/\\-]{15,}/g;
  return input.replace(TOKEN, (tok) => {
    if (tok in vault || !/\d/.test(tok) || !/[-_.]/.test(tok)) return tok;
    let hit: string | null = null;
    for (const [fake, real] of fakes) {
      if (tok === fake) return tok; // exact = unredact's job, already done
      const n = Math.min(tok.length, fake.length);
      let common = 0;
      while (common < n && tok[common] === fake[common]) common++;
      if (common < Math.max(16, Math.ceil(fake.length * 0.75))) continue;
      if (common < Math.ceil(tok.length * 0.6)) continue;
      if (hit !== null && hit !== real) return tok; // ambiguous: abstain
      hit = real;
    }
    return hit ?? tok;
  });
}

/** De-redact a model REPLY for display: the exact reverse pass, then the repair of the
 *  MUTATED fakes above. This is the display `fromWire` function — never the
 *  one for outward args (`unredactArgs`), where guessing would send the guess to a server. */
export function unredactReply(input: string, vault: Vault): string {
  return restoreMutatedTokens(unredact(input, vault), vault);
}

/**
 * De-redact tool-call ARGUMENTS: like {@link unredact}, but also restores a fake
 * value that appears URL-ENCODED inside a URL arg. A model that drops a fake into a
 * query string writes `q=Adam+Bernardbqt` (space → `+`) or `%20`, which the plain
 * literal `unredact` never matches (it looks for the space form) — so the FAKE
 * leaked to the real server (the agent browser searched the FAKE, not the real
 * value; a REST connector sent the fake in its URL). We add each fake's `+`- and
 * percent-encoded forms → the correspondingly-encoded REAL value, so the restore
 * keeps the URL valid. No-op overhead when no fake needs encoding.
 */
export function unredactArgs(input: string, vault: Vault): string {
  let merged: Vault | undefined;
  for (const [fake, real] of Object.entries(vault)) {
    if (!fake) continue;
    const plusFake = fake.replace(/ /g, "+");
    const pctFake = encodeURIComponent(fake);
    // The form a search box / model ACTUALLY produces: space → `+`, every OTHER special
    // char percent-encoded ("Fenwick & Co" → "Fenwick+%26+Co"). The two forms above miss
    // it — `plus` keeps `&` literal, `pct` uses `%20` for the space — so a fake with BOTH
    // a space AND a special char (`&`, `/`, `?`…) leaked to the search engine un-restored
    // (the reported navigation redaction bug). This mixed form covers it.
    const plusPctFake = pctFake.replace(/%20/g, "+");
    const addPlus = plusFake !== fake;
    const addPct = pctFake !== fake && pctFake !== plusFake;
    const addPlusPct = plusPctFake !== fake && plusPctFake !== plusFake && plusPctFake !== pctFake;
    if (!addPlus && !addPct && !addPlusPct) continue;
    merged ??= { ...vault };
    if (addPlus && !(plusFake in merged)) merged[plusFake] = real.replace(/ /g, "+");
    if (addPct && !(pctFake in merged)) merged[pctFake] = encodeURIComponent(real);
    if (addPlusPct && !(plusPctFake in merged))
      merged[plusPctFake] = encodeURIComponent(real).replace(/%20/g, "+");
  }
  return restoreMutatedFakes(unredact(input, merged ?? vault), vault);
}
