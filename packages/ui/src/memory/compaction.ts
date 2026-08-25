import type { MemoryCard } from "../types";
import { MAX_FACTS_CHARS, normalizeMem } from "./memory";
import { sameStem } from "./profile";

/**
 * La COMPACTION des faits d'une carte — une fiche se met à jour, elle ne se redit pas
 * et ne s'ampute pas en silence. Trois règles, toutes tracées dans `factsLog` :
 *  - une REFORMULATION garde la version la plus riche (une carte ne grossit pas en se
 *    répétant) ;
 *  - un fait d'ATTRIBUT (deadline, budget, contact…) REMPLACE la phrase concurrente —
 *    une mise à jour, pas une accumulation contradictoire que le modèle arbitrerait ;
 *  - la SATURATION évince des phrases ENTIÈRES, les plus anciennes d'abord — jamais un
 *    `slice` en pleine phrase (il amputait le fait le plus récent, en silence).
 * Ce que la compaction retire entre dans l'HISTORIQUE borné de la carte : une
 * consolidation qui écrase sa preuve est le mode d'échec mesuré des mémoires d'agent,
 * et l'historique est ce qui rend une mise à jour visible (panneau) et rétablissable.
 */

/** Attributs qui mettent deux faits d'une MÊME carte en CONCURRENCE : une deadline
 *  changée, un budget révisé, un nouveau contact… Le nouveau fait REMPLACE la phrase
 *  de l'ancien attribut au lieu de s'y accumuler — sinon la carte injectée porte la
 *  contradiction (« deadline fin septembre. Deadline le 15 novembre. ») et c'est le
 *  modèle qui arbitre, souvent mal. Formes NORMALISÉES (`normalizeMem`). */
const FACT_ATTRS = [
  "deadline", "echeance", "date limite", "date de livraison", "budget", "prix", "tarif",
  "montant", "email", "e mail", "adresse", "telephone", "portable", "contact", "poste",
  "role", "fonction", "statut", "delai", "salaire", "travaille chez", "employeur",
];

/** Les mots PORTEURS d'une phrase : sans les outils grammaticaux, qui ne distinguent
 *  jamais deux affirmations (« est PDG de X » vs « PDG de X »). Les nombres restent —
 *  une date qui change est une information, pas une reformulation. */
const FACT_GLUE = new Set([
  "est", "était", "sont", "a", "as", "ai", "ont", "le", "la", "les", "un", "une", "des",
  "du", "de", "d", "au", "aux", "et", "ou", "en", "dans", "pour", "par", "sur", "sous",
  "avec", "sans", "ce", "cet", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
  "qui", "que", "dont", "il", "elle", "on", "se", "s", "l", "y", "comme",
]);

/** Les mots de TYPE générique (les catégories mêmes du store) : « X est l'organisation
 *  associée à Y » et « X est associé à Y » font la même affirmation — la fiche porte
 *  déjà sa catégorie. Jamais « client/fournisseur » ici : ça, c'est une RELATION. */
const TYPE_FRAMING = new Set(["personne", "organisation", "projet"]);

/** Locutions d'encadrement pur, retirées AVANT la découpe en mots — « dans le cadre du
 *  projet Horizon » vs « pour le projet Horizon » ne diffèrent que par l'emballage. */
const FRAMING_LOCUTIONS = /\b(dans le cadre (de la|de l|du|des|de|d)?|au sein (de la|de l|du|des|de|d)?|en tant que?)\b/g;

export function contentWords(sentence: string): Set<string> {
  return new Set(
    normalizeMem(sentence)
      .replace(FRAMING_LOCUTIONS, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !FACT_GLUE.has(w) && !TYPE_FRAMING.has(w)),
  );
}

/** Un jeton PORTEUR D'INFORMATION à lui seul : un nombre (date, montant, version) ou un
 *  nom de mois. S'il n'est pas couvert en face, les deux phrases ne peuvent pas être la
 *  même affirmation — une date qui change est une mise à jour, jamais un doublon. */
const MONTHS = new Set([
  "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre",
  "octobre", "novembre", "decembre",
]);
const carriesSignal = (w: string): boolean => /\d/.test(w) || MONTHS.has(w);

/** Two sentences make the SAME claim when they are reformulations of each other:
 *  either one's content words contain the other's (the historic subset rule), or the
 *  two sets differ by AT MOST ONE mundane word EACH side over a solid shared core —
 *  the measured pile-up (« …associé à Camille Salvi dans le cadre du projet Horizon » /
 *  « …comme cliente du projet Horizon » / « …pour le projet Horizon », un mot d'écart à
 *  chaque passage d'extraction). Tolérant aux flexions (`sameStem`) ; un nombre ou un
 *  mois non couvert casse toujours la partie — une vraie mise à jour n'est jamais avalée. */
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

/** Profondeur de l'historique de compaction d'une carte (`MemoryCard.factsLog`). */
export const MAX_FACT_LOG = 3;

export interface MergedFacts {
  facts: string;
  /** Les phrases que CE merge a RETIRÉES (attribut remplacé, reformulation perdante,
   *  éviction à saturation) — à consigner via `pushFactsLog`, jamais à perdre. */
  replaced: string[];
}

/** Tronque à la FRONTIÈRE de phrase en évinçant les plus ANCIENNES. La phrase
 *  `protect` (celle que le merge vient d'écrire) n'est jamais évincée. */
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
  // Une phrase unique démesurée : le repli d'avant (une carte doit rester bornée).
  if (facts.length > cap) facts = facts.slice(0, cap);
  return { facts, replaced };
}

/** Consigne des phrases retirées dans l'historique borné (plus récent d'abord). */
export function pushFactsLog(
  log: { at: number; prev: string }[] | undefined,
  removed: string[],
  at: number,
): { at: number; prev: string }[] | undefined {
  if (!removed.length) return log;
  return [...removed.map((prev) => ({ at, prev })), ...(log ?? [])].slice(0, MAX_FACT_LOG);
}

/** Concatène deux blocs de faits, tronqué à la frontière de phrase — la fusion de
 *  fiches (`dedupe.ts` `mergeCards`). Les phrases de `existing` s'évincent d'abord. */
export function appendFactsClamped(existing: string, extra: string, cap = MAX_FACTS_CHARS): MergedFacts {
  return clampSentences(`${existing} ${extra}`.trim().split(/(?<=[.!?])\s+/), cap);
}

/** Fusionne un fait NOUVEAU dans les phrases existantes d'une carte : si le nouveau
 *  fait porte un ATTRIBUT déjà présent dans UNE phrase, cette phrase est REMPLACÉE ;
 *  sinon il s'ajoute. Le dédup par containment reste la responsabilité de l'appelant.
 *  `preferNew` (le « Rétablir » du panneau) : sur une reformulation, la phrase
 *  ENTRANTE gagne même si elle est moins riche — un rétablissement doit prendre. */
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
    // La reformulation perdante n'entre PAS dans l'historique : l'affirmation est la
    // même, rien n'est perdu — la consigner pousserait les vraies mises à jour
    // d'attribut hors du log borné à coups de variantes triviales.
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

/** Rétablit une entrée d'historique dans `facts` : la phrase revient en REMPLAÇANT sa
 *  concurrente (`preferNew` — un rétablissement doit prendre, même moins riche),
 *  l'entrée quitte l'historique et la phrase déplacée y entre — le geste est
 *  symétrique, un rétablissement se rétablit. Pur ; l'appelant persiste. */
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
