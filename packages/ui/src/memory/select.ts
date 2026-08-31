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

/** Le bloc injecté est lu par le MODÈLE, jamais affiché : il garde la langue source,
 *  comme le reste du prompt système. */
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
  /** Les QUASI-RATÉS — une fiche qui aurait pu partir mais n'est pas partie pour une
   *  raison SURPRENANTE : le budget saturé, ou un prénom homographe tapé seul
   *  (« Pierre » n'évoque pas « Pierre Marché », exprès). Le non-rappel NORMAL (aucune
   *  mention) n'y figure jamais — le bruit apprendrait à ignorer la légende. */
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
  /** Les hits DIRECTS (avant l'expansion de voisinage) — le périmètre du diagnostic. */
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
    // +40 : la ponctuation de la ligne, la catégorie et le suffixe de date de
    // `formatMemoryBlock` — le coût compté doit couvrir la ligne réellement émise.
    const cost = card.entity.length + card.facts.length + 40;
    // SKIP an oversized card, never STOP: a long high-priority card must not empty the
    // budget's tail — the short cards behind it still fit and still serve the send.
    // Consigné pour le diagnostic — mais seulement les hits DIRECTS : un VOISIN écarté
    // n'a pas été nommé par l'utilisateur, son absence n'a rien de surprenant.
    if (used + cost > budget) {
      if (direct.has(card.id)) skipped.push({ id: card.id, reason: "budget" });
      continue;
    }
    used += cost;
    cards.push(card);
  }
  // Le non-rappel SURPRENANT de l'autre espèce : la fiche n'a AUCUN score, mais un de
  // ses tokens homographes est bien dans le texte tapé — « appelle Pierre » n'évoque
  // pas « Pierre Marché », exprès (la deny-list), et sans ce diagnostic l'utilisateur
  // voit juste le modèle « ne pas savoir », sans pouvoir comprendre pourquoi.
  const hit = new Set([...cards.map((c) => c.id), ...skipped.map((s) => s.id)]);
  for (const card of memory.cards) {
    if (hit.has(card.id)) continue;
    if (deniedHomographTokens(card).some((t) => keyInText(normText, t)))
      skipped.push({ id: card.id, reason: "homographe" });
  }
  if (!profile && !cards.length && !skipped.length) return none;
  return { profile, cards, block: formatMemoryBlock(profile, cards), skipped };
}

/** JJ/MM/AAAA — la fraîcheur du fait, injectée AVEC lui : le raisonnement temporel est
 *  le point faible mesuré des modèles sur la mémoire longue, et une carte sans date se
 *  lit comme éternellement vraie (une deadline de l'an dernier raisonnée au présent).
 *  Partagé avec `search.ts` (la ligne de fiche est le même format des deux côtés). */
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

/** Périmètre de la dispense de notoriété du NIVEAU de protection de la conversation
 *  (`privacy/privacyLevel.ts` `notorietyForLevel`) — le même objet que reçoit le moteur. */
export interface MemoryNotoriety {
  commercial?: boolean;
  people?: boolean;
}

/**
 * Retire du forced mémoire les valeurs que la POLITIQUE DE NOTORIÉTÉ du niveau épargne.
 * « Une entité mémoire est du PII connu par construction » est FAUX pour un alias :
 * l'extraction range des fournisseurs dans les alias d'une fiche organisation, et un
 * alias « google » FORCÉ (le forced outranke notoriété ET deny-lists, par design — il
 * est censé être un choix EXPLICITE de l'utilisateur) mintait `google → ostrel`, que le
 * vault réappliquait ensuite au prompt entier : « Google Drive » devenait « Ostrel
 * Drive », et le modèle répondait « connecteur non connecté » sur ses propres outils.
 * Filtrée ici, une valeur notoire retombe sur la DÉTECTION, où les gates du moteur
 *  (notoriété, keep, deny-lists) tranchent selon le niveau — en Strict rien n'est
 * épargné (`commercial:false`, `people:false`) et le forced reste entier.
 */
export function filterNotoriousFromForced(
  forced: { value: string; category: string }[],
  notoriety: MemoryNotoriety,
): { value: string; category: string }[] {
  const coarse: Record<string, string> = { NAME: "name", ORG: "company" };
  return forced.filter((f) => {
    const cat = coarse[f.category];
    if (!cat) return true; // EMAIL & co : jamais notoire — la protection reste forcée
    return !isNotoriousEntity(f.value, cat, notoriety);
  });
}

/** The selected entities as user-FORCED redactions, so the injection is redacted even
 *  under the regex `patterns` engine (which cannot detect a free-form name): a card's
 *  entity is KNOWN PII by construction — no detector needed to protect it. Aliases ride
 *  along; an email-shaped alias forces as EMAIL.
 *
 *  ⚠️ SAUF un nom qui est un MOT DU LANGAGE (stopword / terme générique) : le chemin
 *  « retiens que… » accepte exprès des fiches-notes au nom générique (`allowNotes`
 *  dans extract.ts), et forcer ce nom redacted le mot commun dans TOUTE la
 *  conversation — mesuré : une note « dossiers » a fait partir « à quels dossiers
 *  as-tu accès ? » en « à quels brantley… », mutilant la question ET la recherche
 *  mémoire derrière. Ne pas le forcer ne fuit rien (un mot commun n'identifie
 *  personne) ; le CONTENU de la note reste protégé par la détection normale. */
export function memoryForced(sel: MemorySelection): { value: string; category: string }[] {
  const catToken = (c: MemoryCard): string => (c.cat === "personne" ? "NAME" : "ORG");
  const out: { value: string; category: string }[] = [];
  // Un mot du LEXIQUE COURANT n'est jamais du « PII connu », quelle que soit la fiche :
  // une extraction ratée a rangé « dossiers » comme organisation, et ce forced l'a alors
  // redacted PARTOUT — jusqu'au message d'erreur du connecteur (« hors des ashcombe
  // autorisés », journal 01/08). Le forced MÉMOIRE est machine-décidé, donc filtré ici ;
  // le forced UTILISATEUR (« Redact » du composeur) garde son passe-droit à l'engine.
  // ⚠️ `isNonPiiTerm` et NON un prédicat local : les deux branches avaient corrigé ce
  // bug chacune de son côté, l'une avec `isStopword || isGenericTerm`, l'autre avec ce
  // prédicat partagé — qui les contient tous deux, plus les composés, les formes à
  // article, le vocabulaire clinique et les organismes publics. Une seconde définition du
  // « mot courant » dériverait du lexique qu'elle prétend suivre (règle 9). Seul le
  // plancher de longueur survit de l'autre version : une « entité » d'un ou deux signes
  // ne désigne rien et redact des fragments partout.
  const push = (value: string, category: string) => {
    if (value.trim().length < 3 || isNonPiiTerm(value)) return;
    // Une fiche déjà corrompue (entité = fragment de phrase, née avant le garde de
    // l'extraction) cesse au moins de minter un faux — voir `isNominalEntityName`.
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

/** Le forced du BLOC INJECTÉ : les cartes sélectionnées + toute entité de la mémoire
 *  qui APPARAÎT dans le bloc — le PROFIL (étage toujours injecté) peut nommer une
 *  organisation dont la carte n'est PAS sélectionnée (« directeur chez X » un jour
 *  sans rapport avec X) : sans ce complément, sa protection retombait sur la seule
 *  détection — la fuite mesurée en éval sous le moteur regex. */
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

/** TOUTES les entités de la mémoire comme redactions FORCÉES — pour le résultat de
 *  `memory_search` : une carte est du PII CONNU par construction (c'est exactement le
 *  raisonnement de `memoryForced` côté injection), donc sa protection ne doit JAMAIS
 *  dépendre d'une détection (le moteur regex ne sait pas voir un nom libre). */
export function memoryForcedAll(memory: MemoryData | undefined): { value: string; category: string }[] {
  if (!memory?.cards.length) return [];
  return memoryForced({ profile: undefined, cards: memory.cards, block: "", skipped: [] });
}

// `memory_search` (the model-pulled path) lives in `./search.ts` — pulling on demand
// and choosing what to INJECT are two different questions over the same store.
