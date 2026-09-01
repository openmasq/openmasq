import type { MemoryCard, MemoryData } from "../types";
import { MAX_ALIASES, MAX_PROFILE_CHARS, cardKeys, cardTokens, normalizeMem } from "./memory";
import { MAX_FACT_LOG, appendFactsClamped, mergeFacts, pushFactsLog } from "./compaction";
import { isSelfPreference } from "./extract";
import { appendToProfile, dedupeProfile } from "./profile";
import type { SemanticEdge } from "./cluster";

/**
 * Duplicate-card detection + the data-preserving merge — the « une entité = UNE fiche »
 * counterpart of the engine's one-real-value-one-fake rule. Two signals, both same-
 * category only (a projet and an organisation sharing a name are two things):
 *
 *  - SURFACE: the cards share a matchable key (entity/alias), or one's distinctive
 *    tokens are a subset of the other's (« Manon » ⊂ « Manon Verdolini ») — works on
 *    every platform, no embeddings needed.
 *  - SEMANTIC: embedding cosine ≥ `DUPLICATE_MIN_SIM`, AND the two cards must not carry
 *    DISJOINT names (`distinctIdentities`). The threshold alone was never going to be
 *    enough: an embedding describes what a card SAYS, and two colleagues — « François
 *    Rebsamen, ministre… » and « Marc Ferracci, ministre… », members of one government —
 *    say almost exactly the same thing. Measured at 0.945 on the eval that set the bar,
 *    they land ABOVE it in the field, so the app proposed merging two real people into
 *    one, keeping the other's name as an alias. A shared ROLE is not a shared IDENTITY:
 *    the name is what says who this is, so an embedding may confirm a name, never
 *    replace it. 0.95 stays the floor for the pairs that DO share name material.
 *
 * These are SUGGESTIONS: the user confirms every merge — the signals buy precision,
 * the confirmation buys the rest.
 */

export const DUPLICATE_MIN_SIM = 0.95;

export interface MergeSuggestion {
  /** The card that survives (longer facts, then older). */
  keepId: string;
  dropId: string;
  reason: "surface" | "semantic";
  sim?: number;
}

/** Stable dismiss/identity key of an unordered pair. */
export const pairKey = (a: string, b: string): string => [a, b].sort().join("+");

const keepFirst = (a: MemoryCard, b: MemoryCard): boolean =>
  a.facts.length > b.facts.length || (a.facts.length === b.facts.length && a.createdAt <= b.createdAt);

function surfaceDuplicate(a: MemoryCard, b: MemoryCard): boolean {
  const keysA = cardKeys(a);
  const keysB = new Set(cardKeys(b));
  if (keysA.some((k) => keysB.has(k))) return true;
  const ta = cardTokens(a);
  const tb = new Set(cardTokens(b));
  const ta2 = new Set(ta);
  const tbArr = [...tb];
  const subset = (xs: string[], ys: Set<string>) => xs.length > 0 && xs.every((x) => ys.has(x));
  return subset(ta, tb) || subset(tbArr, ta2);
}

/**
 * Do these two cards name DIFFERENT entities? True when both carry distinctive name
 * tokens and the two sets are disjoint — « François Rebsamen » vs « Marc Ferracci ».
 *
 * Only the SEMANTIC path consults this: the surface signals already require a shared key
 * or a token subset, so they can't reach here. A card with no distinctive token (a note,
 * an entity made of digits/stopwords) yields `false` — unknown identity is not evidence
 * of difference, and the user still confirms the merge.
 */
export function distinctIdentities(a: MemoryCard, b: MemoryCard): boolean {
  const ta = cardTokens(a);
  if (!ta.length) return false;
  const tb = new Set(cardTokens(b));
  if (!tb.size) return false;
  return !ta.some((t) => tb.has(t));
}

/**
 * A card WITH NO FACT — the blank card that "Nouvelle fiche" just created, not
 * yet named. Merging it is NEVER suggested: it brings no data worth
 * preserving, its default name shares a token with the next placeholder ("fiche"
 * ⊂ "fiche"), and the one certain case — same key, same category — is already merged
 * by `autoCleanMemory`. Without this filter, creating two blank cards used to fill the
 * "À revoir" box with an imaginary duplicate.
 */
const blank = (c: MemoryCard): boolean => !c.facts.trim();

/** Rank: surface first (the strongest evidence), then by similarity. One entry per pair. */
export function duplicateSuggestions(
  cards: MemoryCard[],
  semEdges: SemanticEdge[],
  minSim = DUPLICATE_MIN_SIM,
): MergeSuggestion[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out = new Map<string, MergeSuggestion>();
  const suggest = (a: MemoryCard, b: MemoryCard, reason: MergeSuggestion["reason"], sim?: number) => {
    const key = pairKey(a.id, b.id);
    if (out.has(key) && out.get(key)!.reason === "surface") return;
    const [keep, drop] = keepFirst(a, b) ? [a, b] : [b, a];
    out.set(key, { keepId: keep.id, dropId: drop.id, reason, sim });
  };
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i];
      const b = cards[j];
      if (a.cat !== b.cat) continue;
      if (blank(a) || blank(b)) continue;
      if (surfaceDuplicate(a, b)) suggest(a, b, "surface");
    }
  }
  for (const e of semEdges) {
    if (e.sim < minSim) continue;
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b || a.cat !== b.cat) continue;
    if (blank(a) || blank(b)) continue;
    // Same category, high cosine — but two distinctly NAMED entities are two entities.
    if (distinctIdentities(a, b)) continue;
    suggest(a, b, "semantic", e.sim);
  }
  return [...out.values()].sort(
    (x, y) => Number(y.reason === "surface") - Number(x.reason === "surface") || (y.sim ?? 0) - (x.sim ?? 0),
  );
}

/**
 * The merge itself — DATA-PRESERVING: the kept card gains the dropped card's facts
 * (normalized-containment dedup, clamped) and every surface of the dropped card
 * (entity + aliases) as aliases, so recall by the old name keeps working. Pure; the
 * caller persists (update keep, remove drop).
 */
export function mergeCards(keep: MemoryCard, drop: MemoryCard, now = Date.now()): MemoryCard {
  // Truncation at the sentence BOUNDARY (never a mid-sentence slice) — and what
  // a saturation evicts goes into the history, with the histories of BOTH
  // cards merged (most recent first, bounded).
  const merged = normalizeMem(keep.facts).includes(normalizeMem(drop.facts))
    ? { facts: keep.facts, replaced: [] }
    : appendFactsClamped(keep.facts, drop.facts);
  const bothLogs = [...(keep.factsLog ?? []), ...(drop.factsLog ?? [])]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_FACT_LOG);
  const factsLog = pushFactsLog(bothLogs.length ? bothLogs : undefined, merged.replaced, now);
  const known = new Set(cardKeys(keep));
  const aliases = [...(keep.aliases ?? [])];
  for (const surface of [drop.entity, ...(drop.aliases ?? [])]) {
    const key = normalizeMem(surface);
    if (!key || known.has(key) || aliases.length >= MAX_ALIASES) continue;
    known.add(key);
    aliases.push(surface);
  }
  return { ...keep, facts: merged.facts, factsLog, aliases: aliases.length ? aliases : undefined, updatedAt: now };
}

/**
 * The AUTO-clean pass — the self-healing counterpart of the suggestions above. It acts
 * ONLY on the CERTAIN cases, where a merge can't be wrong and preserves everything;
 * the fuzzy signals (token-subset, semantic) stay suggestions the user confirms.
 *
 *  1 · A note card the OLD extractor minted for a SELF-PREFERENCE (source "auto",
 *      cat « autre », fact « Préfère des réponses courtes… ») migrates to the PROFILE
 *      and disappears — exactly where the fixed extractor now routes it. User-authored
 *      cards (no `source`) are never touched: authoring one was an explicit choice.
 *  2 · Two same-category cards sharing an ENTITY KEY (entity/alias, normalized) are
 *      one entity by the store's own definition — merged, data-preserving.
 *  3 · Two « autre » cards with IDENTICAL normalized facts are the invented-title
 *      duplicate class (« Préférence de réponse » / « Préférence utilisateur ») —
 *      merged. Restricted to « autre » ON PURPOSE: two PEOPLE can legitimately share
 *      a fact sentence (« Travaille chez Atelier Torbel »); those stay suggestions.
 *
 * Pure, deterministic, IDEMPOTENT (a fixpoint: re-running returns `changed: false`),
 * so the caller can run it on every memory change without looping. Duplicates from
 * ANY source self-heal — old extractions, and card lists merged by the device sync.
 */
export function autoCleanMemory(
  memory: MemoryData,
  now = Date.now(),
): { data: MemoryData; changed: boolean; merged: number; migrated: number } {
  // The stored profile itself self-heals first: the pre-fix extractor appended the
  // same preference in a different phrasing each run (« Préfère des / les réponses
  // courtes… ») — `dedupeProfile` keeps each sentence once, oldest first (the
  // user-authored part typically leads), verbatim.
  let profile = dedupeProfile(memory.profile);
  const profileDeduped = profile !== memory.profile;
  let migrated = 0;
  let cards: MemoryCard[] = [];
  for (const c of memory.cards) {
    if (c.source === "auto" && c.cat === "autre" && isSelfPreference(c.facts)) {
      profile = appendToProfile(profile, [c.facts]).profile?.slice(0, MAX_PROFILE_CHARS);
      migrated += 1;
      continue;
    }
    cards.push(c);
  }

  // 4 · A card that REPEATS ITSELF — reformulations accumulated BEFORE `restates`
  //     knew how to see them (« …associé à Camille Salvi dans le cadre du projet Horizon » /
  //     « …comme cliente du projet Horizon », one word's drift per extraction pass)
  //     get recompacted by the same rule as insertion: fold each sentence into
  //     the previous ones via `mergeFacts`. A losing reformulation ⇒ no history
  //     (the claim is the same), same as at insertion. Idempotent: a text that is already
  //     compact folds back onto itself unchanged. `source:"auto"` cards ONLY:
  //     text authored by the user is never rewritten.
  let recompacted = 0;
  cards = cards.map((c) => {
    if (c.source !== "auto") return c;
    const sentences = c.facts.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
    if (sentences.length < 2) return c;
    let facts = sentences[0]!;
    for (const s of sentences.slice(1)) facts = mergeFacts(facts, s);
    if (facts === c.facts) return c;
    recompacted += 1;
    return { ...c, facts, updatedAt: now };
  });

  const certain = (a: MemoryCard, b: MemoryCard): boolean => {
    if (a.cat !== b.cat) return false;
    const kb = new Set(cardKeys(b));
    if (cardKeys(a).some((k) => kb.has(k))) return true;
    return a.cat === "autre" && normalizeMem(a.facts) === normalizeMem(b.facts);
  };
  let merged = 0;
  let again = true;
  while (again) {
    again = false;
    for (let i = 0; i < cards.length && !again; i++) {
      for (let j = i + 1; j < cards.length && !again; j++) {
        if (!certain(cards[i], cards[j])) continue;
        const first = keepFirst(cards[i], cards[j]);
        const kept = first ? mergeCards(cards[i], cards[j], now) : mergeCards(cards[j], cards[i], now);
        const keepIdx = first ? i : j;
        const dropIdx = first ? j : i;
        cards = cards.map((c, idx) => (idx === keepIdx ? kept : c)).filter((_, idx) => idx !== dropIdx);
        merged += 1;
        again = true; // restart: the merged card may now match a third one
      }
    }
  }

  const changed = merged > 0 || migrated > 0 || profileDeduped || recompacted > 0;
  return { data: changed ? { ...memory, profile, cards } : memory, changed, merged, migrated };
}
