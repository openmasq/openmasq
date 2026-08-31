import { fixElisions } from "./elision";
import { dateReformPairs } from "./dateForms";
import { placeFragments } from "./geo/composite";
import type { Vault } from "../types";
import { redactionCategory } from "../kinds";
import {
  accentTolerantSource,
  escapeRegExp,
  foldAccents,
  isWordGlued,
  replaceStandalone,
  variantOccurrences,
} from "../util";
import type { UrlOccurrenceGuard } from "./urls";

/**
 * Reverse a redaction: replace every known token (bracket placeholder, fake
 * value, or number token) with its original value. Done in a single
 * left-to-right pass over a combined pattern (longest token first) so a restored
 * original is never re-scanned and tokens that are substrings of one another
 * (e.g. `n1` vs `n12`) can't corrupt each other.
 */
export function unredact(input: string, vault: Vault): string {
  // REPAIRS, read-only, derived at restore time — an EXISTING entry always wins:
  // (1) composite-place fragments (pre-`placeAliases` vaults kept the invented town);
  // (2) the LONG form of a date fake — the user read a FALSE date as a fact (`dateForms.ts`).
  const derived = Object.entries(vault).flatMap(([fake, real]) =>
    placeFragments(real, fake).concat(dateReformPairs(fake, real)),
  );
  if (derived.length) {
    const patched: Vault = { ...vault };
    for (const [f, r] of derived) if (patched[f] === undefined) patched[f] = r;
    vault = patched;
  }
  const tokens = Object.keys(vault)
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return input;
  // SEPARATOR-tolerant: the model may wrap a multi-word token across lines
  // ("Marc\nCharvet") OR SLUGIFY it — a fake company "Oslen Group" becomes
  // "oslen-group" / "oslen_group" in a FILENAME or URL ("procès-verbal-…-oslen-group.txt"),
  // which a space-only match never reversed → the fake leaked. Treat any run of
  // whitespace / `-` / `_` between a token's words as one separator (in both the
  // match pattern and the collapse key), so a slugified fake still restores.
  const collapse = (s: string) => s.replace(/[\s_-]+/g, " ");
  const byCollapsed = new Map<string, string>();
  // CASE-INSENSITIVE fallback map (lowercased key → original). Models routinely
  // UPPER-CASE a fake name/company in formal output (a legal "PROCÈS-VERBAL … OSLEN
  // GROUP … Madame Jade SAVEL"), and a case-sensitive reverse then left the fake (or a
  // hybrid "Julien SAVEL" — first name reversed via its alias, surname not). Resolving
  // a match case-insensitively restores it. First (longest-first) wins on a collision;
  // any collision is only a value-CASING difference (same identity), never a wrong one.
  const byLower = new Map<string, { value: string; risky: boolean; ambiguous?: boolean }>();
  // A token whose CASE-INSENSITIVE restore would over-reach: a number token ("n1") or a
  // very short scramble (≤3, one word) collides with an ordinary differently-cased word
  // in the reply ("N1", a 2-3 letter acronym) → the plain value substitution would then
  // rewrite that word to a real sensitive value. Such tokens restore ONLY on an EXACT-CASE
  // match; longer / multi-word fakes (names, companies) keep the case-insensitive restore
  // (models UPPER-CASE them in formal output).
  const isRisky = (c: string) => /^n\d+$/i.test(c) || (c.length <= 3 && !c.includes(" "));
  // FALLBACK TO THE FOLDED FORM (no diacritics) — the model sometimes RE-SPELLS a
  // fake: « Quémener » comes back « Quéméner », it "corrects" toward the spelling it knows.
  // A single mark of difference, and case alone is no longer enough: the user would then read THE
  // FAKE instead of their data. Same safeguards as `byLower` — never on a
  // risky token, never when two different reals fold onto the same key.
  const byFolded = new Map<string, { value: string; risky: boolean; ambiguous?: boolean }>();
  for (const t of tokens) {
    const c = collapse(t);
    byCollapsed.set(c, vault[t]);
    const cf = foldAccents(c).toLowerCase();
    const priorF = byFolded.get(cf);
    if (!priorF) byFolded.set(cf, { value: vault[t], risky: isRisky(c) });
    else if (priorF.value.toLowerCase() !== vault[t].toLowerCase()) priorF.ambiguous = true;
    const cl = c.toLowerCase();
    const prior = byLower.get(cl);
    if (!prior) byLower.set(cl, { value: vault[t], risky: isRisky(c) });
    // audit: two DIFFERENT reals sharing a case-only-different fake ("Oslen Group"→X,
    // "OSLEN GROUP"→Y) DISABLE the case-insensitive restore — else a THIRD casing in the reply
    // is restored to the WRONG person's value. Compare LOWERCASED: a legit recase alias
    // ("Savel"→"Sabourdin" / "savel"→"sabourdin") is the SAME identity (casing-consistent
    // fake↔real) and must stay case-insensitively restorable — only a genuinely different real trips it.
    else if (prior.value.toLowerCase() !== vault[t].toLowerCase()) prior.ambiguous = true;
  }
  // MARKERS (`[PERSON1]`, `[REDACTED_NAME_2]`) — the token-mode key form. A FAKE
  // crosses the reply intact because it's ordinary text; a marker, the model
  // REWRITES: brackets escaped by markdown (`\[PERSON1\]`), bold glued on, or
  // simply copied without brackets into a sentence or a table header. Every form
  // that isn't restored leaves « PERSON1 » in front of the user instead of THEIR
  // information — it's the mode failing to keep its promise, not a cosmetic detail.
  // So the brackets are made OPTIONAL and resolution happens on the core. `(?!\d)` keeps
  // « PERSON12 » distinct from « PERSON1 » (the pattern is merged, order alone isn't enough).
  const MARKER_RE = /^\[([A-Za-z][A-Za-z_]*\d*[A-Za-z_]*)(\d+[a-z]?)\]$/;
  const markerByLower = new Map<string, { value: string; ambiguous?: boolean }>();
  const pattern = tokens
    .map((t) => {
      const m = MARKER_RE.exec(t);
      if (!m) return accentTolerantSource(escapeRegExp(t)).replace(/\s+/g, "[\\s_-]+");
      const core = `${m[1]}${m[2]}`.toLowerCase();
      const prior = markerByLower.get(core);
      // Same core, two GENUINELY different reals ⇒ nothing is invented (same rule as
      // `byLower`). Two casings of the same value, however, stay restorable.
      if (prior && prior.value.toLowerCase() !== vault[t].toLowerCase()) prior.ambiguous = true;
      else if (!prior) markerByLower.set(core, { value: vault[t] });
      return `\\\\?\\[?${escapeRegExp(m[1] + m[2])}(?!\\d)\\\\?\\]?`;
    })
    .join("|");
  const re = new RegExp(pattern, "gi");
  // Skip a match that only continues a longer word (a short word-like token glued
  // inside another word) so restoring "us" never touches "plus"/"vous". Resolve the
  // original: exact-case first (keeps the precise mapping), then case-insensitive —
  // EXCEPT a risky token, which requires the exact case (never the `gi` fallback).
  const restored = input.replace(re, (m, offset: number) => {
    if (isWordGlued(input, offset, m)) return m;
    const c = collapse(m);
    const exact = byCollapsed.get(c) ?? vault[m];
    if (exact !== undefined) return exact;
    const lower = byLower.get(c.toLowerCase());
    // risky OR ambiguous (a case-only collision between two DIFFERENT reals) ⇒ never
    // case-insensitively over-restore: it would pick the wrong person's value.
    if (lower && !lower.risky && !lower.ambiguous) return lower.value;
    // Last resort: the same value, diacritics flattened.
    const folded = byFolded.get(foldAccents(c).toLowerCase());
    if (folded && !folded.risky && !folded.ambiguous) return folded.value;
    // Deformed marker: fall back to the CORE, brackets and escapes stripped.
    const marker = markerByLower.get(c.replace(/[[\]\\]/g, "").toLowerCase());
    if (marker && !marker.ambiguous) return marker.value;
    return m;
  });
  // The model wrote correct French around the FAKE; substituting the real value can break
  // the article — a vowel-initial fake gives « d'Ostrel », and restoring a consonant-initial
  // real value leaves « d'Karl Studio » under the user's eyes. Repaired here, on the DISPLAY
  // leg only (`elision.ts` says why the outward leg is left alone).
  return fixElisions(restored, Object.values(vault));
}

// OUTWARD-args leg (`unredactArgs` + mutated-fake repair): `vaultArgs.ts` (rule-1 split).

/**
 * Forward substitution: replace every original value the vault knows with its
 * token. The inverse of {@link unredact}, used to re-apply an existing vault to
 * conversation history deterministically (no model call). Single pass, longest
 * original first, so an inserted token is never re-scanned.
 *
 * `urlGuard` ({@link UrlOccurrenceGuard}) leaves an occurrence that sits INSIDE a URL
 * verbatim — the candidate filter's URL gate only ever sees new detections, so without
 * it a value vaulted from prose (`app`) rewrites the host of every link a connector
 * returns. Absent ⇒ substitute everywhere, the historical behaviour.
 */
export function applyVault(
  input: string,
  vault: Vault,
  exclude?: Set<string>,
  urlGuard?: UrlOccurrenceGuard,
): string {
  let entries = Object.entries(vault).filter(([, v]) => v.length > 0);
  if (exclude && exclude.size) entries = entries.filter(([t]) => !exclude.has(t));
  if (entries.length === 0) return input;
  // value -> token, longest value first.
  entries.sort((a, b) => b[1].length - a[1].length);
  const valueToToken = new Map(entries.map(([token, value]) => [value, token]));
  const re = new RegExp(
    entries.map(([, value]) => escapeRegExp(value)).join("|"),
    "g",
  );
  // Whole-word-aware: never swap a value that is merely a SUBSTRING inside a real
  // word — replacing a 2-char entity ("us"/"ca") must not corrupt "plus"/"Canva".
  return input.replace(re, (m, offset: number) =>
    isWordGlued(input, offset, m) || urlGuard?.(offset, m.length, m)
      ? m
      : valueToToken.get(m) ?? m,
  );
}

/**
 * REPLAY-ONLY forward pass: substitute every REAL value the vault already knows
 * with its existing fake/token — **no detection, no new vault entries, no vault
 * mutation**. This is the redaction a "clear-mode" browser result gets: public
 * web content passes through untouched, but a page that happens to contain a
 * value the conversation already redacted (the user's name from the Mémoire, a
 * company from an earlier message) still hands the model the FAKE, so identity
 * coherence never breaks. Unlike {@link applyVault} the match is CASE- and
 * SEPARATOR-insensitive (a headline UPPER-CASES a name; a URL slug hyphenates
 * it) — except for a RISKY short value (≤3 chars, single word), which replaces
 * only on an exact-case match so a stray "US"/"OK" in page text is never
 * over-masked. Over-matching costs fidelity; under-matching costs privacy — the
 * asymmetry is why the tolerance mirrors {@link unredact}, not `applyVault`.
 *
 * Takes the same `urlGuard` as {@link applyVault}, and needs it MORE: the tolerant match
 * also rewrites a value's slugified spelling, so a clear-mode page's own links were being
 * mangled twice over. The guard is checked on the RESOLVED real value, never on the
 * matched spelling, so the exemption test reads the same key the vault does.
 */
export function replayVault(input: string, vault: Vault, urlGuard?: UrlOccurrenceGuard): string {
  const entries = Object.entries(vault).filter(([t, v]) => t.length > 0 && v.length > 0);
  if (entries.length === 0) return input;
  // value → token, longest value first, so an inserted token is never re-scanned
  // and a value containing another value wins the alternation.
  entries.sort((a, b) => b[1].length - a[1].length);
  const collapse = (s: string) => s.replace(/[\s_-]+/g, " ").toLowerCase();
  const isRisky = (v: string) => v.length <= 3 && !v.includes(" ");
  const exact = new Map<string, string>();
  const byCollapsed = new Map<string, { token: string; risky: boolean }>();
  for (const [token, value] of entries) {
    if (!exact.has(value)) exact.set(value, token);
    const c = collapse(value);
    if (!byCollapsed.has(c)) byCollapsed.set(c, { token, risky: isRisky(value) });
  }
  const pattern = entries
    .map(([, v]) => escapeRegExp(v).replace(/\s+/g, "[\\s_-]+"))
    .join("|");
  const re = new RegExp(pattern, "gi");
  return input.replace(re, (m, offset: number) => {
    if (isWordGlued(input, offset, m)) return m;
    const direct = exact.get(m);
    const token = direct ?? (() => {
      const c = byCollapsed.get(collapse(m));
      return !c || c.risky ? undefined : c.token; // risky short value: exact case only
    })();
    if (token === undefined) return m;
    // Judge the exemption on the REAL value the token stands for, not on the spelling
    // this occurrence happens to wear (a slug, an upper-cased headline).
    if (urlGuard?.(offset, m.length, vault[token] ?? m)) return m;
    return token;
  });
}

/**
 * Residual TOLERANT forward pass, run AFTER {@link applyVault} on the MODEL-bound leg:
 * substitute the spelling VARIANTS of every vaulted value — "KARL_STUDIO" in a filename,
 * "karl-studio" in a slug, an UPPER-CASED heading — with the entry's existing token.
 * `applyVault` is exact by design; alone, it shipped a vaulted company in CLEAR whenever
 * a tool result spelled it with underscores. Guards against prose corruption: variant
 * matching refuses a lone token < 4 chars and any digit-carrying token
 * (`variantOccurrences`), and a SINGLE-word value additionally requires the occurrence
 * to carry an uppercase letter — a "Marie" alias must never swallow "se marie", while
 * "PENNYLANE" still maps. Multi-word values substitute at full tolerance (an ordered
 * multi-token collision in prose IS the entity). Pinned by `vault.test.ts`.
 */
export function applyVaultVariants(input: string, vault: Vault, exclude?: Set<string>): string {
  let out = input;
  const entries = Object.entries(vault)
    .filter(([t, v]) => v.length > 0 && !exclude?.has(t))
    .sort((a, b) => b[1].length - a[1].length);
  for (const [token, value] of entries) {
    const singleWord = value.split(/[\s._-]+/).filter(Boolean).length <= 1;
    for (const occ of variantOccurrences(out, value)) {
      if (occ === value) continue; // the exact spelling was already applyVault'ed
      if (singleWord && !/\p{Lu}/u.test(occ)) continue; // lowercase prose stays prose
      out = replaceStandalone(out, occ, token);
    }
  }
  return out;
}

/**
 * The vault tokens whose category the user has turned off (so they should no
 * longer be substituted): number tokens when `numbers` is false, and any entry
 * whose kind is in `disabledKinds`. A kind is read from the token itself
 * (`n1` → number, `[REDACTED_EMAIL_1]` → email) or, for fake-data tokens that
 * carry no category, from the optional `kinds` (original value → kind) map.
 *
 * ⚠️ **An entry whose kind we cannot PROVE is never excluded.** Excluding means
 * "stop substituting" — i.e. put the REAL value back on the wire — so an unknown
 * kind must fail CLOSED (keep the fake), never fall back to a guess. It used to
 * default to `"secret"`: a fake-data token carries no category and `kinds` covers
 * only PRIOR turns, so turning off the ordinary "Clés & secrets" toggle un-excluded
 * — i.e. un-redacted — every name/company in the message, while `matches` still
 * reported them as redacted. Pinned by `vault.test.ts`.
 */
export function disabledVaultTokens(
  vault: Vault,
  opts: {
    numbers?: boolean;
    disabledKinds?: string[];
    kinds?: Record<string, string>;
  },
): Set<string> {
  const numbersOff = opts.numbers === false;
  const disabled = new Set(opts.disabledKinds ?? []);
  const out = new Set<string>();
  if (!numbersOff && disabled.size === 0) return out;
  for (const [token, value] of Object.entries(vault)) {
    // The caller's `kinds` map wins over the token-shape heuristics: a token's SHAPE
    // only says how it was minted, while `kinds` says what the value IS — so a value
    // the caller typed still toggles with its own category, not with `numbers`.
    let kind: string | undefined = opts.kinds?.[value];
    if (kind === undefined) {
      if (/^n\d+$/.test(token)) kind = "number";
      else {
        const m = token.match(/^\[REDACTED_(.+)_\d+\]$/);
        // A labelled token states its own kind. A fake-data token doesn't, so the
        // only other proof is the caller's `kinds` map. No proof ⇒ leave it alone.
        kind = m ? redactionCategory(m[1]) : undefined;
      }
    }
    if (kind === undefined) continue; // unknown ⇒ keep substituting (fail closed)
    if ((numbersOff && kind === "number") || disabled.has(kind)) out.add(token);
  }
  return out;
}
