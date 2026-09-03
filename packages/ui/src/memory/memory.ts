import type { Messages } from "@openmasq/i18n";
import { isCjkText, isGenericTerm, isStopword } from "@openmasq/redact";
import type { MemoryCard, MemoryCategory, MemoryData } from "../types";

/**
 * Pure logic for the MÉMOIRE — durable facts the user wants remembered ACROSS
 * conversations. React-free and unit-tested; mirrors `competences/competences.ts`,
 * the sibling user-authored list.
 *
 * ⚠️ Privacy model (the part that is NOT like the compétences): a memory is REAL user
 * data stored locally, and since the per-conversation salt, fakes are NOT stable across
 * conversations — so memory can only be stored REAL and re-redacted AT INJECTION through
 * the receiving conversation's own redaction pass (vault + salt). Selection also has to
 * happen client-side on REAL values: the model only ever sees fakes, so it cannot judge
 * which entities are relevant. See `send`'s injection + the loop's `memory_search`.
 */

/** Category vocabulary. `id` persists; tone is presentation (`--hl-*` hues). The WORD
 *  comes from the catalogue: `memoryCategoryLabel(id, t)`. */
export const MEMORY_CATEGORIES: { id: MemoryCategory; tone: string }[] = [
  { id: "personne", tone: "violet" },
  { id: "organisation", tone: "sky" },
  { id: "projet", tone: "lime" },
  { id: "autre", tone: "amber" },
];

export function memoryCategory(id: string): (typeof MEMORY_CATEGORIES)[number] {
  return MEMORY_CATEGORIES.find((c) => c.id === id) ?? MEMORY_CATEGORIES[3];
}

/** The name of a category, in `t`'s language. ⚠️ The INJECTED memory block, however,
 *  is prose for the MODEL: it takes the source language (`select.ts`). */
export function memoryCategoryLabel(id: string, t: Messages): string {
  return t.lists.memory.categories[memoryCategory(id).id];
}

/** Bounds — memory COMPACTS over time (facts merge into the card), it never grows a
 *  transcript. The caps keep a card injectable and the whole block budgetable. */
export const MAX_FACTS_CHARS = 600;
export const MAX_PROFILE_CHARS = 1200;
/** Alias cap per card — shared by the extraction merge and the duplicate-card merge. */
export const MAX_ALIASES = 6;
/** Injection budget (chars ≈ tokens×4): the whole memory block, profile included. */
export const MEMORY_BUDGET_CHARS = 4000;

/** Mint a card id. Exported so the extraction can PRE-mint ids on its facts — a
 *  deterministic id per fact makes "which cards did this run create" answerable
 *  (`mergeExtraction`'s `createdIds`) without re-deriving it from entity names. */
export const memoryId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const uid = memoryId;

/** A short display title for a remembered free-text NOTE (the « Retenir » selection
 *  gesture): the first few words, ellipsized — never the whole selection. */
export function memoryNoteTitle(text: string, maxWords = 5, maxChars = 60): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  let title = words.slice(0, maxWords).join(" ");
  if (title.length > maxChars) title = title.slice(0, maxChars).trimEnd();
  return (words.length > maxWords || title.length < text.trim().replace(/\s+/g, " ").length)
    ? `${title}…`
    : title;
}

/** The name of a BLANK card created from the Mémoire page (« Nouvelle fiche »). */
export const NEW_CARD_ENTITY = "Nouvelle fiche";

/**
 * The name of a blank card that SURVIVES `autoCleanMemory`: two cards of the same
 * category sharing a key are ONE entity by the store's own definition, so a
 * second fixed-name placeholder used to be merged into the first the instant it was
 * created — the newly created card would vanish, and the button seemed dead. So it is
 * numbered as long as the key is taken. The loop is bounded: `taken.size` keys can
 * only block `taken.size` candidates.
 */
export function newCardEntity(cards: readonly MemoryCard[]): string {
  const taken = new Set(cards.flatMap((c) => cardKeys(c)));
  if (!taken.has(normalizeMem(NEW_CARD_ENTITY))) return NEW_CARD_ENTITY;
  for (let n = 2; n <= taken.size + 2; n++) {
    const name = `${NEW_CARD_ENTITY} ${n}`;
    if (!taken.has(normalizeMem(name))) return name;
  }
  return NEW_CARD_ENTITY; // unreachable — the bound above guarantees a free one
}

/** Create a card from user input. Null when the entity is empty. Facts clamped. */
export function makeMemoryCard(input: {
  entity: string;
  facts: string;
  cat?: string;
  aliases?: string[];
}): MemoryCard | null {
  const entity = input.entity.trim();
  if (!entity) return null;
  const now = Date.now();
  return {
    id: uid(),
    entity,
    aliases: input.aliases?.map((a) => a.trim()).filter(Boolean),
    cat: (MEMORY_CATEGORIES.some((c) => c.id === input.cat) ? input.cat : "autre") as MemoryCategory,
    facts: input.facts.trim().slice(0, MAX_FACTS_CHARS),
    createdAt: now,
    updatedAt: now,
  };
}

/** Lowercase + de-accent + collapse separators — the matching shape of a name, the
 *  same normalization family as the engine's `entityKey` (casing/spacing variants of
 *  one entity must hit one card). CJK scripts are PRESERVED (they have no case or
 *  accents): stripping them normalized "张伟" to "", so a CJK card could never be
 *  mentioned NOR anchored by the extraction. */
export function normalizeMem(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9@.\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]+/gu, " ")
      // Dots survive the pass above for EMAILS ("augustin.vaudel@x.fr") — but a sentence
      // period glues to the last word ("karl studio.") and breaks the word boundary,
      // so a real user's « …chez Karl Studio. » missed the card. Keep only dots
      // BETWEEN alphanumerics; everything else becomes a separator.
      .replace(/(?<![a-z0-9])\.|\.(?![a-z0-9])/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Every matchable surface of a card: entity + aliases, normalized. */
export function cardKeys(card: MemoryCard): string[] {
  return [card.entity, ...(card.aliases ?? [])].map(normalizeMem).filter(Boolean);
}

/** One normalized key present in one normalized text? Word-boundary containment so
 *  "art" never hits "Bakartis" — except a CJK key, matched by SUBSTRING: zh/ja text is
 *  written without spaces (the same exemption the redaction engine makes), and a 2-glyph
 *  CJK name is a full name, so the Latin ≥3 floor drops to 2 there. */
export function keyInText(normText: string, k: string): boolean {
  if (isCjkText(k)) return k.length >= 2 && normText.includes(k);
  return k.length >= 3 && ` ${normText} `.includes(` ${k} `);
}

/** Does `text` (normalized) mention this card (entity or alias, whole-key match)? */
export function mentions(normText: string, card: MemoryCard): boolean {
  return cardKeys(card).some((k) => keyInText(normText, k));
}

/** Name TOKENS that double as everyday French/English words (post-`normalizeMem` form,
 *  accents folded): « le marché est en pierre » must NOT recall « Pierre Marché ». The
 *  deny costs only the TOKEN tier's convenience (the whole-key tiers are untouched), so
 *  curating liberally is safe — a wrong entry can never leak, only un-shortcut a name. */
const TOKEN_HOMOGRAPHS = new Set([
  // French first names / surnames that are common nouns or adjectives
  "pierre", "marche", "marches", "rose", "roses", "claire", "clair", "blanche", "blanc",
  "noir", "noire", "ange", "victoire", "aurore", "iris", "violette", "marguerite",
  "fleur", "perle", "olive", "prune", "franc", "france", "porte", "riviere", "fontaine",
  "montagne", "champs", "champ", "printemps", "hiver", "ete", "automne", "midi", "mer",
  "provence", "boulanger", "lefranc",
  // English equivalents
  "will", "grace", "hope", "summer", "june", "king", "brown", "white", "green", "black",
  "stone", "hill", "wood", "field", "day", "may", "young", "strong",
]);

/** A homograph TOKEN (a name that is also an everyday word) — exported so that
 *  extraction refuses a homograph single-word ALIAS (« Claire » set as an alias of one
 *  of two Claires would spill the whole-key recall onto the other). */
export const isTokenHomograph = (t: string): boolean => TOKEN_HOMOGRAPHS.has(normalizeMem(t));

/** A card's tokens that the token tier REFUSES because they are homographs
 *  (« pierre », « marche ») — the diagnostic for a SURPRISING non-recall: « Pierre » typed
 *  alone doesn't evoke the « Pierre Marché » card, on purpose, and without this list
 *  the user has no way to know it. Same shape filters as `cardTokens`. */
export function deniedHomographTokens(card: MemoryCard): string[] {
  const out = new Set<string>();
  for (const k of cardKeys(card)) {
    for (const t of k.split(" ")) {
      if (/[@.\d]/.test(t) || (!isCjkText(t) && t.length < 3)) continue;
      if (TOKEN_HOMOGRAPHS.has(t)) out.add(t);
    }
  }
  return [...out];
}

/** The DISTINCTIVE single tokens of a card's keys — the weaker recall pass: « appelle
 *  Ninon demain » must hit the « Ninon Verdolini » card without the full entity. A token
 *  qualifies only when it is proper-noun-ish ON ITS OWN: no digits, not an email/dotted
 *  fragment (those match whole-key only), not a stopword / generic word / name-noun
 *  homograph (deny-lists — over-matching costs tokens and a wrong « Mémoire utilisée »
 *  caption, never a leak: the injection is re-redacted + forced regardless). */
export function cardTokens(card: MemoryCard): string[] {
  const out = new Set<string>();
  for (const k of cardKeys(card)) {
    for (const t of k.split(" ")) {
      if (/[@.\d]/.test(t)) continue;
      if (!isCjkText(t) && t.length < 3) continue;
      if (isStopword(t) || isGenericTerm(t) || TOKEN_HOMOGRAPHS.has(t)) continue;
      out.add(t);
    }
  }
  return [...out];
}

/** Does `text` (normalized) evoke this card by a lone distinctive token? */
export function mentionsToken(normText: string, card: MemoryCard): boolean {
  return cardTokens(card).some((t) => keyInText(normText, t));
}

// Facts COMPACTION (rewording, attribute update, eviction at
// saturation, `factsLog` history) lives in `compaction.ts` (rule 1) — the barrel
// `index.ts` exports it alongside this file.

/** Window of the « Nouveautés » review: what the machine wrote RECENTLY. */
export const MEMORY_FRESH_MS = 7 * 24 * 3600 * 1000;

/** Cards TO REVIEW: created by automatic extraction within the window, or with
 *  a sentence REPLACED within the window (the `factsLog` history dates each
 *  replacement — a manual card updated by the machine counts too). This is
 *  silent mode's inbox: what accumulates without review is what
 *  undermines trust in an automatic memory. */
export function freshCardIds(memory: MemoryData, now: number, windowMs = MEMORY_FRESH_MS): Set<string> {
  const cutoff = now - windowMs;
  return new Set(
    memory.cards
      .filter(
        (c) =>
          // TREATED cards leave the inbox: reviewing (« Confirmer », or editing from
          // the panel) stamps `reviewedAt`, and only a machine write NEWER than it
          // re-enrolls the card — an inbox one cannot empty by acting isn't one.
          !(c.reviewedAt && c.reviewedAt >= c.updatedAt) &&
          ((c.source === "auto" && c.updatedAt >= cutoff) ||
            (c.factsLog?.some((e) => e.at >= cutoff) ?? false)),
      )
      .map((c) => c.id),
  );
}

/** Cards that match the Mémoire page's search (entity + alias + facts,
 *  `normalizeMem` on both sides) — `null` = no filter. Served to BOTH views: the
 *  list filters, the graph dims non-matching leaves. */
export function matchingCardIds(memory: MemoryData, query: string): Set<string> | null {
  const q = normalizeMem(query);
  if (!q) return null;
  return new Set(
    memory.cards
      .filter((c) => normalizeMem(`${c.entity} ${(c.aliases ?? []).join(" ")} ${c.facts}`).includes(q))
      .map((c) => c.id),
  );
}

export const emptyMemory = (): MemoryData => ({ cards: [] });
