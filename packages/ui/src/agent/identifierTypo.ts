/**
 * "You mis-copied the identifier" — the one tool failure we can correct in the model's
 * place.
 *
 * A `gmail__get_message` fails repeatedly on identifiers that the prior `list` had just
 * given CORRECTLY: `19fc78f80fd31ba0` retyped as `19fc78f80fd31ba`, four others the same
 * in the same turn (journal 04/08/2026). The redaction engine never touches these
 * (measured: neither vault nor substitution) — it's a copy mistake on hexadecimal, and no
 * model is immune to it. But the RIGHT value is still there, in a result the loop already
 * saw: we can hand it back instead of leaving the model to guess.
 *
 * ⚠️ **We NEVER correct behind the model's back** — we don't rewrite its arguments, we add
 * a sentence to the error result. Rewriting an argument would mean calling a tool on a
 * target nobody asked for; on a WRITE it would target the wrong object.
 *
 * And we stay silent the moment there's doubt: two candidates at the same distance, a
 * distance > `MAX_EDITS`, a token too short — nothing. An invented correction costs more
 * than the original error, because it's credible.
 *
 * Safe for the wire: the loop only ever sees ALREADY-redacted results, so the identifier
 * quoted is the one the model itself has in front of it.
 */

/** Below this, a token isn't an opaque identifier and we don't get involved. */
const MIN_LEN = 10;
const MAX_LEN = 128;
/** Beyond this, it's no longer a copy mistake but a different identifier. */
const MAX_EDITS = 2;

/** Long enough, no space, and not a word: letters AND digits mixed, or pure hex. */
const OPAQUE = /[0-9A-Za-z_-]{10,128}/g;

function isOpaqueId(t: string): boolean {
  if (t.length < MIN_LEN || t.length > MAX_LEN) return false;
  const digits = (t.match(/\d/g) ?? []).length;
  // An ordinary word ("informations", "unsubscribe") has no digit; an identifier
  // always has a few. The threshold is deliberately low — `msg_01AbCd…` has few.
  return digits >= 2;
}

/** The opaque identifiers in a text, deduplicated, in order of appearance. */
export function opaqueIdsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(OPAQUE) ?? []) if (isOpaqueId(m)) out.add(m);
  return [...out];
}

/** Bounded edit distance: returns `max + 1` as soon as it's known to exceed it. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const d = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1; // the whole row already exceeds it: no point continuing
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The one identifier seen that is a copy mistake of `bad`. `undefined` if none, if the
 * nearest is too far, or if TWO are equally close (ambiguity ⇒ silence).
 */
export function nearestIdentifier(bad: string, seen: Iterable<string>): string | undefined {
  if (!isOpaqueId(bad)) return undefined;
  let best: string | undefined;
  let bestD = MAX_EDITS + 1;
  let tie = false;
  for (const cand of seen) {
    if (cand === bad) return undefined; // the identifier exists as-is: the failure is elsewhere
    if (!isOpaqueId(cand)) continue;
    const d = editDistance(bad, cand, MAX_EDITS);
    if (d > MAX_EDITS) continue;
    if (d < bestD) [best, bestD, tie] = [cand, d, false];
    else if (d === bestD) tie = true;
  }
  return tie ? undefined : best;
}

/** An argument's value, if it's a string. Nested objects aren't targeted. */
function stringArgs(args: Record<string, unknown>): [string, string][] {
  return Object.entries(args).filter((e): e is [string, string] => typeof e[1] === "string");
}

/**
 * The sentence to append to the error result, or `""` if nothing safe to say.
 * `seen` = the identifiers this turn's tool results have already shown.
 */
export function identifierTypoHint(args: Record<string, unknown>, seen: Iterable<string>): string {
  const seenArr = [...seen];
  const fixes: string[] = [];
  for (const [key, value] of stringArgs(args)) {
    const right = nearestIdentifier(value.trim(), seenArr);
    if (right) fixes.push(`\`${key}\` : « ${value.trim()} » → « ${right} »`);
  }
  if (!fixes.length) return "";
  return (
    `\n\nL'identifiant envoyé n'existe pas, mais il ressemble de très près à un identifiant ` +
    `déjà rendu par un résultat précédent — il a donc été recopié de travers. Refais l'appel ` +
    `avec la valeur exacte, copiée caractère par caractère :\n${fixes.map((f) => `- ${f}`).join("\n")}`
  );
}
