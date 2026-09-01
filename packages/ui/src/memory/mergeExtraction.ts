import { stripOrgAffixes } from "@openmasq/redact";
import type { MemoryCard, MemoryData } from "../types";
import { MAX_ALIASES, makeMemoryCard, normalizeMem } from "./memory";
import { mergeFactsDetailed, pushFactsLog } from "./compaction";
import { appendToProfile } from "./profile";
import type { Extraction } from "./extractParse";

/** Merge resolved facts into the store: an existing card (entity-key match) gains the
 *  fact as a new sentence (normalized-containment dedup, clamped, recency-touched); an
 *  unknown entity becomes a NEW card tagged `source:"auto"` (keeping the fact's
 *  pre-minted `id` when set). Returns the next store + the ids of the cards this run
 *  CREATED (deterministic with pre-minted ids — safe to compute twice) + whether the
 *  PROFILE gained new text this run (a preference like « je préfère… » lands here, not
 *  as a card — the caller's chat feedback needs to know, or a profile-only save reads
 *  as « rien retenu ») — pure; the caller persists.
 *  What a merge REMOVES from a card (replaced attribute sentence, saturation
 *  eviction) goes into its `factsLog` — never silently lost; `updatedIds`
 *  names the EXISTING cards this pass modified, so the chat's legend
 *  makes the update visible (and inspectable) instead of silent. */
export function mergeExtraction(
  memory: MemoryData,
  resolved: Extraction,
  now = Date.now(),
): { data: MemoryData; createdIds: string[]; updatedIds: string[]; profileChanged: boolean } {
  let cards = [...memory.cards];
  const createdIds: string[] = [];
  const updatedIds: string[] = [];
  // An extracted alias joins the card unless already a known surface; bounded
  // (MAX_ALIASES) so a chatty extractor can't grow an unbounded alias list.
  const withAlias = (c: MemoryCard, alias: string | undefined): MemoryCard => {
    if (!alias) return c;
    const known = [c.entity, ...(c.aliases ?? [])].map(normalizeMem);
    if (known.includes(normalizeMem(alias)) || (c.aliases?.length ?? 0) >= MAX_ALIASES) return c;
    return { ...c, aliases: [...(c.aliases ?? []), alias] };
  };
  for (const f of resolved.facts) {
    const key = normalizeMem(f.entity);
    const surfaces = (c: MemoryCard): string[] => [c.entity, ...(c.aliases ?? [])];
    // 1st pass: the EXACT key — it always wins (a project « Ondine » and a
    // homonymous company « Ondine SARL » are TWO cards; a fact addressed to one must
    // never slide to the other via their shared core).
    let idx = cards.findIndex((c) => surfaces(c).some((k) => normalizeMem(k) === key));
    // 2nd pass: the org CORE (legal affixes stripped — `stripOrgAffixes`, the same
    // one the redaction engine uses): « Atelier Torbel SARL » finds the card
    // « Atelier Torbel » instead of creating a second one. Preference goes to the card of the
    // SAME category when several homonyms share the core.
    if (idx < 0) {
      const coreKey = normalizeMem(stripOrgAffixes(f.entity));
      if (coreKey.length >= 3) {
        // SAME category ONLY: a project « Ondine » and a company
        // « Ondine SARL » share the core but are two entities — sliding the fact
        // from one to the other would be exactly the confusion this path is meant to avoid.
        idx = cards.findIndex(
          (c) => c.cat === f.cat && surfaces(c).some((k) => normalizeMem(stripOrgAffixes(k)) === coreKey),
        );
      }
    }
    if (idx >= 0) {
      const card = cards[idx];
      const dup = normalizeMem(card.facts).includes(normalizeMem(f.fact));
      // An ATTRIBUTE fact (deadline, budget, contact…) REPLACES the competing sentence
      // — an update, not a contradictory accumulation (`mergeFactsDetailed`);
      // the replaced sentence goes into the card's history.
      let merged: MemoryCard;
      if (dup) merged = withAlias(card, f.alias);
      else {
        const m = mergeFactsDetailed(card.facts, f.fact);
        merged = withAlias(
          { ...card, facts: m.facts, factsLog: pushFactsLog(card.factsLog, m.replaced, now) },
          f.alias,
        );
      }
      // The new SURFACE form (« Atelier Torbel SARL » attached via its core) becomes an
      // alias — recall will recognize it next time.
      if (!surfaces(merged).some((k) => normalizeMem(k) === key)) merged = withAlias(merged, f.entity);
      if (merged === card) continue; // nothing new (fact known, alias known)
      if (!updatedIds.includes(card.id)) updatedIds.push(card.id);
      cards = cards.map((c, i) => (i === idx ? { ...merged, updatedAt: now } : c));
    } else {
      // A NOTE dedups on its FACT, not its title: the title is model-INVENTED and
      // different every run, so the entity-key lookups above can never match. If the
      // fact is already known — in the profile or on ANY card (including one the user
      // just merged by hand) — creating a new card would be the reported duplicate
      // (« Préférence de réponse » / « Préférence utilisateur », same fact each time).
      if (f.note) {
        const known = normalizeMem([memory.profile ?? "", ...cards.map((c) => c.facts)].join(" · "));
        if (known.includes(normalizeMem(f.fact))) continue;
      }
      const card = makeMemoryCard({ entity: f.entity, facts: f.fact, cat: f.cat, aliases: f.alias ? [f.alias] : undefined });
      if (card) {
        const created = { ...card, id: f.id ?? card.id, source: "auto" as const, createdAt: now, updatedAt: now };
        cards = [created, ...cards];
        createdIds.push(created.id);
      }
    }
  }
  // The profile only moves on an EXPLICIT self-description (rule 4 of the prompt), and
  // never overwrites a user-written one — append-only, SENTENCE-wise and
  // coverage-deduped (`memory/profile.ts`): the extractor rephrases the same
  // preference every run (« Préfère des / les réponses courtes… », « Utilisateur
  // préférant… »), and the previous plain-containment check let six copies of one
  // preference pile up in the reported profile.
  let profile = memory.profile;
  let profileChanged = false;
  if (resolved.profile) {
    const next = appendToProfile(profile, [resolved.profile]);
    profile = next.profile;
    profileChanged = next.changed;
  }
  return { data: { ...memory, profile, cards }, createdIds, updatedIds, profileChanged };
}
