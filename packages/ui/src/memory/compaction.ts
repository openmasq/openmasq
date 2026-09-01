import type { MemoryCard } from "../types";
import { MAX_FACTS_CHARS, normalizeMem } from "./memory";
import { sameStem } from "./profile";

/**
 * The COMPACTION of a card's facts — a card gets updated, it does not repeat itself
 * and does not silently amputate itself. Three rules, all traced in `factsLog`:
 *  - a REFORMULATION keeps the richer version (a card does not grow by repeating
 *    itself);
 *  - an ATTRIBUTE fact (deadline, budget, contact…) REPLACES the competing sentence —
 *    an update, not a contradictory accumulation the model would have to arbitrate;
 *  - SATURATION evicts WHOLE sentences, oldest first — never a `slice` mid-sentence
 *    (it used to amputate the most recent fact, silently).
 * What the compaction removes goes into the card's bounded HISTORY: a
 * consolidation that erases its own evidence is agent memories' measured failure
 * mode, and the history is what makes an update visible (panel) and restorable.
 */

/** Attributes that put two facts of the SAME card in COMPETITION: a changed
 *  deadline, a revised budget, a new contact… The new fact REPLACES the sentence
 *  of the old attribute instead of piling onto it — otherwise the injected card carries
 *  the contradiction (« deadline fin septembre. Deadline le 15 novembre. ») and it is
 *  the model that arbitrates, often badly. NORMALIZED forms (`normalizeMem`). */
const FACT_ATTRS = [
  "deadline", "echeance", "date limite", "date de livraison", "budget", "prix", "tarif",
  "montant", "email", "e mail", "adresse", "telephone", "portable", "contact", "poste",
  "role", "fonction", "statut", "delai", "salaire", "travaille chez", "employeur",
];

/** The CARRIER words of a sentence: without the grammatical tools, which never
 *  distinguish two claims (« est PDG de X » vs « PDG de X »). Numbers stay —
 *  a date that changes is information, not a reformulation. */
const FACT_GLUE = new Set([
  "est", "était", "sont", "a", "as", "ai", "ont", "le", "la", "les", "un", "une", "des",
  "du", "de", "d", "au", "aux", "et", "ou", "en", "dans", "pour", "par", "sur", "sous",
  "avec", "sans", "ce", "cet", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
  "qui", "que", "dont", "il", "elle", "on", "se", "s", "l", "y", "comme",
]);

/** Generic TYPE words (the store's own categories): « X est l'organisation
 *  associée à Y » and « X est associé à Y » make the same claim — the card
 *  already carries its category. Never « client/fournisseur » here: that is a RELATION. */
const TYPE_FRAMING = new Set(["personne", "organisation", "projet"]);

/** Pure framing phrases, removed BEFORE the word split — « dans le cadre du
 *  projet Horizon » vs « pour le projet Horizon » differ only by the wrapping. */
const FRAMING_LOCUTIONS = /\b(dans le cadre (de la|de l|du|des|de|d)?|au sein (de la|de l|du|des|de|d)?|en tant que?)\b/g;

export function contentWords(sentence: string): Set<string> {
  return new Set(
    normalizeMem(sentence)
      .replace(FRAMING_LOCUTIONS, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !FACT_GLUE.has(w) && !TYPE_FRAMING.has(w)),
  );
}

/** A token that CARRIES INFORMATION on its own: a number (date, amount, version) or a
 *  month name. If it is not matched on the other side, the two sentences cannot be
 *  the same claim — a date that changes is an update, never a duplicate. */
const MONTHS = new Set([
  "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre",
  "octobre", "novembre", "decembre",
]);
const carriesSignal = (w: string): boolean => /\d/.test(w) || MONTHS.has(w);

/** Two sentences make the SAME claim when they are reformulations of each other:
 *  either one's content words contain the other's (the historic subset rule), or the
 *  two sets differ by AT MOST ONE mundane word EACH side over a solid shared core —
 *  the measured pile-up (« …associé à Camille Salvi dans le cadre du projet Horizon » /
 *  « …comme cliente du projet Horizon » / « …pour le projet Horizon », one word's worth of
 *  drift at each extraction pass). Tolerant of inflected forms (`sameStem`); an uncovered
 *  number or month always breaks the match — a genuine update is never swallowed. */
export function restates(a: string, b: string): boolean {
  const wa = [...contentWords(a)];
  const wb = [...contentWords(b)];
  if (!wa.length || !wb.length) return false;
  const uncovered = (xs: string[], ys: string[]) => xs.filter((x) => !ys.some((y) => sameStem(x, y)));
  const ua = uncovered(wa, wb);
  const ub = uncovered(wb, wa);
  if (ua.some(carriesSignal) || ub.some(carriesSignal)) return false;
  if (ua.length === 0 || ub.length === 0) return true;
  const shared = wa.length - ua.length;
  return ua.length <= 1 && ub.length <= 1 && shared >= 3;
}

/** Depth of a card's compaction history (`MemoryCard.factsLog`). */
export const MAX_FACT_LOG = 3;

export interface MergedFacts {
  facts: string;
  /** The sentences THIS merge REMOVED (replaced attribute, losing reformulation,
   *  saturation eviction) — to be logged via `pushFactsLog`, never to be lost. */
  replaced: string[];
}

/** Truncates at the sentence BOUNDARY by evicting the OLDEST first. The
 *  `protect` sentence (the one the merge just wrote) is never evicted. */
function clampSentences(sentences: string[], cap: number, protect?: string): MergedFacts {
  const kept = sentences.filter((s) => s.trim());
  const replaced: string[] = [];
  let facts = kept.join(" ").trim();
  while (facts.length > cap && kept.length > 1) {
    const i = kept.findIndex((s) => s !== protect);
    if (i < 0) break;
    replaced.push(kept.splice(i, 1)[0]!);
    facts = kept.join(" ").trim();
  }
  // A single oversized sentence: the earlier fallback (a card must stay bounded).
  if (facts.length > cap) facts = facts.slice(0, cap);
  return { facts, replaced };
}

/** Logs removed sentences into the bounded history (most recent first). */
export function pushFactsLog(
  log: { at: number; prev: string }[] | undefined,
  removed: string[],
  at: number,
): { at: number; prev: string }[] | undefined {
  if (!removed.length) return log;
  return [...removed.map((prev) => ({ at, prev })), ...(log ?? [])].slice(0, MAX_FACT_LOG);
}

/** Concatenates two fact blocks, truncated at the sentence boundary — the card
 *  merge (`dedupe.ts` `mergeCards`). `existing`'s sentences are evicted first. */
export function appendFactsClamped(existing: string, extra: string, cap = MAX_FACTS_CHARS): MergedFacts {
  return clampSentences(`${existing} ${extra}`.trim().split(/(?<=[.!?])\s+/), cap);
}

/** Merges a NEW fact into a card's existing sentences: if the new fact carries an
 *  ATTRIBUTE already present in ONE sentence, that sentence is REPLACED; otherwise
 *  it is appended. Containment-based dedup stays the caller's responsibility.
 *  `preferNew` (the panel's « Rétablir »): on a reformulation, the INCOMING
 *  sentence wins even if it is less rich — a restore must take effect. */
export function mergeFactsDetailed(
  existing: string,
  fact: string,
  cap = MAX_FACTS_CHARS,
  opts?: { preferNew?: boolean },
): MergedFacts {
  const f = fact.trim();
  if (!existing.trim()) return { facts: f.slice(0, cap), replaced: [] };
  const nf = normalizeMem(fact);
  // RESTATEMENT — the same claim, reworded. The caller's exact-containment check misses
  // it ( « PDG de Walmart depuis janvier 2026 » vs « Est PDG de Walmart depuis janvier
  // 2026 » ), so the card GREW by re-saying itself on every pass: measured, three
  // near-identical sentences per card, which is also what inflated the similarity between
  // cards. When one sentence's content words contain the other's, keep the RICHER one.
  const sentences = existing.split(/(?<=[.!?])\s+/);
  const iSaid = sentences.findIndex((s) => restates(s, fact));
  if (iSaid >= 0) {
    const old = sentences[iSaid]!;
    const kept = opts?.preferNew || contentWords(fact).size >= contentWords(old).size ? f : old;
    sentences[iSaid] = kept;
    // The losing reformulation does NOT enter the history: the claim is the
    // same, nothing is lost — logging it would push real attribute updates
    // out of the bounded log via a pile of trivial variants.
    return clampSentences(sentences, cap, kept);
  }
  const attrs = FACT_ATTRS.filter((a) => nf.includes(a));
  if (attrs.length) {
    const i = sentences.findIndex((s) => {
      const ns = normalizeMem(s);
      return attrs.some((a) => ns.includes(a));
    });
    if (i >= 0) {
      const old = sentences[i]!;
      sentences[i] = f;
      const out = clampSentences(sentences, cap, f);
      if (old !== f) out.replaced.unshift(old);
      return out;
    }
  }
  return clampSentences([...sentences, f], cap, f);
}

export function mergeFacts(existing: string, fact: string, cap = MAX_FACTS_CHARS): string {
  return mergeFactsDetailed(existing, fact, cap).facts;
}

/** Restores a history entry into `facts`: the sentence comes back by REPLACING its
 *  competitor (`preferNew` — a restore must take effect, even if less rich),
 *  the entry leaves the history and the displaced sentence enters it — the move
 *  is symmetric, a restore can itself be restored. Pure; the caller persists. */
export function restoreFact(
  card: MemoryCard,
  index: number,
  now = Date.now(),
): Pick<MemoryCard, "facts" | "factsLog"> | null {
  const entry = card.factsLog?.[index];
  if (!entry) return null;
  const merged = mergeFactsDetailed(card.facts, entry.prev, MAX_FACTS_CHARS, { preferNew: true });
  const rest = card.factsLog!.filter((_, i) => i !== index);
  return {
    facts: merged.facts,
    factsLog: pushFactsLog(rest, merged.replaced.filter((s) => s !== entry.prev), now),
  };
}
