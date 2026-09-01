import { DEFAULT_LOCALE, getMessages } from "@openmasq/i18n";
import { isNonPiiTerm, isNotoriousEntity } from "@openmasq/redact";
import type { MemoryCard, MemoryData } from "../types";
import { isNominalEntityName } from "./extractParse";
import { crossLinks } from "./graph";
import {
  MEMORY_BUDGET_CHARS,
  cardKeys,
  deniedHomographTokens,
  keyInText,
  memoryCategoryLabel,
  mentions,
  mentionsToken,
  normalizeMem,
} from "./memory";

/** The injected block is read by the MODEL, never displayed: it keeps the source language,
 *  like the rest of the system prompt. */
const SOURCE = getMessages(DEFAULT_LOCALE);

/**
 * WHICH memory to inject — the deterministic cascade, entirely client-side on REAL
 * values (the model can't do this: it only holds fakes, and since the per-conversation
 * salt they aren't even stable across conversations).
 *
 *   3 · the typed text MENTIONS the entity (or an alias/fragment) — near-certain
 *   2 · the entity is already IN this conversation (vault originals / kinds map)
 *   1 · the typed text carries a DISTINCTIVE TOKEN of the entity (« Manon » alone
 *       for « Manon Verdolini ») — likely, ranked below the certain tiers
 *   0 · everything else (never injected; `memory_search` covers the long tail)
 *
 * Then ONE HOP along the cross-links: a card that NAMES a certainly-mentioned entity is
 * about it, and answering about an entity while ignoring what is known around it is what
 * « veille sur les fournisseurs de X » exposed — the X card went in, the card describing
 * a competitor OF X did not, and the reply read as though nothing was known.
 *
 * Then fill the char budget by (score, recency): the profile first (it is the fixed
 * always-on stage), cards after, cut at the budget — NEVER a raw dump of the store.
 */

/** How many linked cards one send may pull in. A neighbourhood is useful context; the
 *  whole store is a dump, and the budget would go to it instead of the direct hits. */
const MAX_LINKED = 3;

export interface MemorySelection {
  profile: string | undefined;
  cards: MemoryCard[];
  /** The formatted block to inject (empty string = inject nothing). */
  block: string;
  /** The NEAR-MISSES — a card that could have gone out but did not, for a SURPRISING
   *  reason: the budget was saturated, or a homograph first name typed alone
   *  ("Pierre" does not evoke "Pierre Marché", on purpose). NORMAL non-recall (no
   *  mention at all) never shows up here — the noise would teach people to ignore the legend. */
  skipped: { id: string; reason: "budget" | "homographe" }[];
}

export function selectMemory(input: {
  /** The user's typed text for THIS send (real values). */
  text: string;
  /** REAL values already known to this conversation (vault originals ∪ kinds keys). */
  convValues: string[];
  memory: MemoryData | undefined;
  budgetChars?: number;
}): MemorySelection {
  const memory = input.memory;
  const none: MemorySelection = { profile: undefined, cards: [], block: "", skipped: [] };
  if (!memory || (!memory.profile?.trim() && !memory.cards.length)) return none;

  const budget = input.budgetChars ?? MEMORY_BUDGET_CHARS;
  const normText = normalizeMem(input.text);
  // Conv values joined on a hard separator so a key can only match INSIDE one value,
  // never across two (`keyInText` owns the word-boundary/CJK rules, same as the text).
  const normConv = input.convValues.map(normalizeMem).filter(Boolean).join(" · ");

  const scored = memory.cards
    .map((card) => {
      let score = 0;
      if (mentions(normText, card)) score = 3;
      else if (cardKeys(card).some((k) => keyInText(normConv, k))) score = 2;
      else if (mentionsToken(normText, card)) score = 1;
      return { card, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.card.updatedAt - a.card.updatedAt);

  // ONE hop, and only from a CERTAIN mention (score 3). Expanding from a weak token
  // match would cascade — « Manon » pulling a card that merely names a Manon, then its
  // neighbours — and quietly spend the budget on things the user never referred to.
  const seeds = new Set(scored.filter((s) => s.score === 3).map((s) => s.card.id));
  /** The DIRECT hits (before the neighbourhood expansion) — the diagnostic's scope. */
  const direct = new Set(scored.map((s) => s.card.id));
  const picked = new Set(scored.map((s) => s.card.id));
  const linked: { card: MemoryCard; score: number }[] = [];
  if (seeds.size) {
    const byId = new Map(memory.cards.map((c) => [c.id, c]));
    for (const [a, b] of crossLinks(memory.cards)) {
      // The link is undirected in the graph; either end being a seed pulls the other.
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        if (!seeds.has(from) || picked.has(to)) continue;
        const card = byId.get(to);
        if (!card) continue;
        picked.add(to);
        linked.push({ card, score: 0.5 });
      }
    }
    linked.sort((x, y) => y.card.updatedAt - x.card.updatedAt);
  }

  const profile = memory.profile?.trim() || undefined;
  let used = profile ? profile.length + 40 : 0;
  const cards: MemoryCard[] = [];
  const skipped: MemorySelection["skipped"] = [];
  // Direct hits FIRST, neighbours after: the budget must serve what the user actually
  // named before it serves what merely relates to it.
  for (const { card } of [...scored, ...linked.slice(0, MAX_LINKED)]) {
    // +40: the line's punctuation, the category and the date suffix from
    // `formatMemoryBlock` — the counted cost must cover the line actually emitted.
    const cost = card.entity.length + card.facts.length + 40;
    // SKIP an oversized card, never STOP: a long high-priority card must not empty the
    // budget's tail — the short cards behind it still fit and still serve the send.
    // Logged for the diagnostic — but only the DIRECT hits: a discarded NEIGHBOUR
    // was not named by the user, so its absence is not surprising.
    if (used + cost > budget) {
      if (direct.has(card.id)) skipped.push({ id: card.id, reason: "budget" });
      continue;
    }
    used += cost;
    cards.push(card);
  }
  // The other species of SURPRISING non-recall: the card has NO score at all, but one
  // of its homograph tokens is indeed in the typed text — "appelle Pierre" does not evoke
  // "Pierre Marché", on purpose (the deny-list), and without this diagnostic the user
  // just sees the model "not know", with no way to understand why.
  const hit = new Set([...cards.map((c) => c.id), ...skipped.map((s) => s.id)]);
  for (const card of memory.cards) {
    if (hit.has(card.id)) continue;
    if (deniedHomographTokens(card).some((t) => keyInText(normText, t)))
      skipped.push({ id: card.id, reason: "homographe" });
  }
  if (!profile && !cards.length && !skipped.length) return none;
  return { profile, cards, block: formatMemoryBlock(profile, cards), skipped };
}

/** DD/MM/YYYY — the fact's freshness, injected WITH it: temporal reasoning is
 *  models' measured weak point on long-term memory, and a card with no date reads
 *  as eternally true (a deadline from last year reasoned about in the present tense).
 *  Shared with `search.ts` (the card line is the same format on both sides). */
export const fmtDay = (t: number): string => new Date(t).toLocaleDateString("fr-FR");

/** The injected block — French, and framed as BACKGROUND the model must not recite.
 *  It is written in REAL values here and re-redacted by the send's redaction pass
 *  before anything leaves the machine. */
export function formatMemoryBlock(profile: string | undefined, cards: MemoryCard[]): string {
  if (!profile && !cards.length) return "";
  const lines: string[] = [
    "Mémoire de l'utilisateur (contexte durable, à utiliser sans le réciter tel quel) :",
  ];
  if (profile) lines.push(profile);
  for (const c of cards)
    lines.push(
      `- ${c.entity} (${memoryCategoryLabel(c.cat, SOURCE).toLowerCase()}) : ${c.facts} (noté le ${fmtDay(c.updatedAt)})`,
    );
  return lines.join("\n");
}

/** Scope of the notoriety exemption for the conversation's protection LEVEL
 *  (`privacy/privacyLevel.ts` `notorietyForLevel`) — the same object the engine receives. */
export interface MemoryNotoriety {
  commercial?: boolean;
  people?: boolean;
}

/**
 * Removes from the memory forced list the values that the level's NOTORIETY POLICY exempts.
 * "A memory entity is known PII by construction" is FALSE for an alias:
 * extraction files suppliers under an organization card's aliases, and a
 * FORCED "google" alias (forced outranks notoriety AND deny-lists, by design — it
 * is meant to be an EXPLICIT user choice) used to mint `google → ostrel`, which the
 * vault then reapplied to the whole prompt: "Google Drive" became "Ostrel
 * Drive", and the model would answer "connector not connected" about its own tools.
 * Filtered here, a notorious value falls back on DETECTION, where the engine's gates
 *  (notoriety, keep, deny-lists) decide based on the level — under Strict nothing is
 * exempted (`commercial:false`, `people:false`) and the forced list stays intact.
 */
export function filterNotoriousFromForced(
  forced: { value: string; category: string }[],
  notoriety: MemoryNotoriety,
): { value: string; category: string }[] {
  const coarse: Record<string, string> = { NAME: "name", ORG: "company" };
  return forced.filter((f) => {
    const cat = coarse[f.category];
    if (!cat) return true; // EMAIL & co: never notorious — protection stays forced
    return !isNotoriousEntity(f.value, cat, notoriety);
  });
}

/** The selected entities as user-FORCED redactions, so the injection is redacted even
 *  under the regex `patterns` engine (which cannot detect a free-form name): a card's
 *  entity is KNOWN PII by construction — no detector needed to protect it. Aliases ride
 *  along; an email-shaped alias forces as EMAIL.
 *
 *  ⚠️ EXCEPT for a name that is a LANGUAGE WORD (stopword / generic term): the
 *  « retiens que… » path deliberately accepts note-cards with a generic name
 *  (`allowNotes` in extract.ts), and forcing that name redacted the common word across
 *  the WHOLE conversation — measured: a note « dossiers » turned « à quels dossiers
 *  as-tu accès ? » into « à quels brantley… », mutilating both the question AND the
 *  memory search behind it. Not forcing it leaks nothing (a common word identifies
 *  nobody); the note's CONTENT stays protected by normal detection. */
export function memoryForced(sel: MemorySelection): { value: string; category: string }[] {
  const catToken = (c: MemoryCard): string => (c.cat === "personne" ? "NAME" : "ORG");
  const out: { value: string; category: string }[] = [];
  // A word from the COMMON LEXICON is never "known PII", whatever the card says:
  // a failed extraction filed « dossiers » as an organization, and this forced then
  // redacted it EVERYWHERE — down to the connector's error message (« hors des ashcombe
  // autorisés », log 01/08). The MEMORY forced is machine-decided, so it is filtered
  // here; the USER forced ("Redact" in the composer) keeps its pass to the engine.
  // ⚠️ `isNonPiiTerm` and NOT a local predicate: both branches had fixed this
  // bug separately, one with `isStopword || isGenericTerm`, the other with this
  // shared predicate — which contains both of them, plus compounds, article
  // forms, clinical vocabulary and public bodies. A second definition of the
  // "common word" would drift from the lexicon it claims to follow (rule 9). Only
  // the length floor survives from the other version: an "entity" of one or two
  // characters designates nothing and would redact fragments everywhere.
  const push = (value: string, category: string) => {
    if (value.trim().length < 3 || isNonPiiTerm(value)) return;
    // A card that is already corrupted (entity = sentence fragment, born before the
    // extraction guard existed) at least stops minting a fake — see `isNominalEntityName`.
    if (!isNominalEntityName(value)) return;
    out.push({ value, category });
  };
  for (const c of sel.cards) {
    push(c.entity, catToken(c));
    for (const a of c.aliases ?? []) {
      if (!a.trim()) continue;
      push(a, /@/.test(a) ? "EMAIL" : catToken(c));
    }
  }
  return out;
}

/** The forced list for the INJECTED BLOCK: the selected cards + any memory entity
 *  that APPEARS in the block — the PROFILE (the always-injected tier) can name an
 *  organization whose card is NOT selected ("director at X" on some day unrelated
 *  to X): without this addition, its protection fell back on detection alone —
 *  the leak measured in eval under the regex engine. */
export function memoryForcedForBlock(
  sel: MemorySelection,
  memory: MemoryData | undefined,
): { value: string; category: string }[] {
  const base = memoryForced(sel);
  if (!memory || !sel.block) return base;
  const seen = new Set(base.map((f) => f.value.toLowerCase()));
  const blockLc = sel.block.toLowerCase();
  for (const f of memoryForcedAll(memory)) {
    const v = f.value.toLowerCase();
    if (!seen.has(v) && blockLc.includes(v)) {
      seen.add(v);
      base.push(f);
    }
  }
  return base;
}

/** ALL memory entities as FORCED redactions — for the `memory_search` result: a
 *  card is KNOWN PII by construction (this is exactly the reasoning behind
 *  `memoryForced` on the injection side), so its protection must NEVER depend
 *  on detection (the regex engine cannot see a free-form name). */
export function memoryForcedAll(memory: MemoryData | undefined): { value: string; category: string }[] {
  if (!memory?.cards.length) return [];
  return memoryForced({ profile: undefined, cards: memory.cards, block: "", skipped: [] });
}

// `memory_search` (the model-pulled path) lives in `./search.ts` — pulling on demand
// and choosing what to INJECT are two different questions over the same store.
