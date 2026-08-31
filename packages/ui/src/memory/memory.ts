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

/** Category vocabulary. `id` persists; tone is presentation (`--hl-*` hues). Le MOT
 *  vient du catalogue : `memoryCategoryLabel(id, t)`. */
export const MEMORY_CATEGORIES: { id: MemoryCategory; tone: string }[] = [
  { id: "personne", tone: "violet" },
  { id: "organisation", tone: "sky" },
  { id: "projet", tone: "lime" },
  { id: "autre", tone: "amber" },
];

export function memoryCategory(id: string): (typeof MEMORY_CATEGORIES)[number] {
  return MEMORY_CATEGORIES.find((c) => c.id === id) ?? MEMORY_CATEGORIES[3];
}

/** Le nom d'une catégorie, dans la langue de `t`. ⚠️ Le bloc de mémoire INJECTÉ, lui,
 *  est de la prose pour le MODÈLE : il prend la langue source (`select.ts`). */
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

/** Le nom d'une fiche VIERGE créée depuis la page Mémoire (« Nouvelle fiche »). */
export const NEW_CARD_ENTITY = "Nouvelle fiche";

/**
 * Le nom d'une fiche vierge qui SURVIT à `autoCleanMemory` : deux fiches de même
 * catégorie qui partagent une clé sont UNE entité par définition du magasin, donc un
 * second placeholder au nom fixe était refondu dans le premier à l'instant même de sa
 * création — la fiche créée disparaissait, et le bouton semblait mort. On numérote
 * donc tant que la clé est prise. La boucle est bornée : `taken.size` clés ne peuvent
 * bloquer que `taken.size` candidats.
 */
export function newCardEntity(cards: readonly MemoryCard[]): string {
  const taken = new Set(cards.flatMap((c) => cardKeys(c)));
  if (!taken.has(normalizeMem(NEW_CARD_ENTITY))) return NEW_CARD_ENTITY;
  for (let n = 2; n <= taken.size + 2; n++) {
    const name = `${NEW_CARD_ENTITY} ${n}`;
    if (!taken.has(normalizeMem(name))) return name;
  }
  return NEW_CARD_ENTITY; // inatteignable — la borne ci-dessus garantit un libre
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

/** Un TOKEN homographe (nom qui est aussi un mot courant) — exporté pour que
 *  l'extraction refuse un ALIAS mono-mot homographe (« Claire » posé en alias d'une
 *  des deux Claires fait déborder le rappel whole-key sur l'autre). */
export const isTokenHomograph = (t: string): boolean => TOKEN_HOMOGRAPHS.has(normalizeMem(t));

/** Les tokens d'une carte que le tier jeton REFUSE parce qu'ils sont des homographes
 *  (« pierre », « marche ») — le diagnostic du non-rappel SURPRENANT : « Pierre » tapé
 *  seul n'évoque pas la fiche « Pierre Marché », exprès, et sans cette liste
 *  l'utilisateur ne peut pas le savoir. Mêmes filtres de forme que `cardTokens`. */
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
 *  Manon demain » must hit the « Manon Verdolini » card without the full entity. A token
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

// La COMPACTION des faits (reformulation, mise à jour d'attribut, éviction à
// saturation, historique `factsLog`) vit dans `compaction.ts` (règle 1) — le barrel
// `index.ts` l'exporte à côté de ce fichier.

/** Fenêtre de la revue « Nouveautés » : ce que la machine a écrit RÉCEMMENT. */
export const MEMORY_FRESH_MS = 7 * 24 * 3600 * 1000;

/** Les cartes à REVOIR : créées par l'extraction automatique dans la fenêtre, ou dont
 *  une phrase a été REMPLACÉE dans la fenêtre (l'historique `factsLog` date chaque
 *  remplacement — une carte manuelle mise à jour par la machine compte aussi). C'est
 *  la boîte de réception du mode silencieux : ce qui s'accumule sans revue est ce qui
 *  mine la confiance dans une mémoire automatique. */
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

/** Les cartes qui répondent à la recherche de la page Mémoire (entité + alias + faits,
 *  `normalizeMem` des deux côtés) — `null` = pas de filtre. Servie aux DEUX vues : la
 *  liste filtre, le graphe estompe les feuilles non correspondantes. */
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
