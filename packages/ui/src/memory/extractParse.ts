import type { MemoryCard } from "../types";
import { MAX_FACTS_CHARS, normalizeMem } from "./memory";

// The extractor's CONTRACT: the strict-JSON prompt, the tolerant parse (a malformed
// reply = "nothing learned", never a broken turn) and the anti-secret filter.
// Split from `extract.ts` (rule 1); re-exported from it.

/**
 * Max facts accepted from ONE extraction call.
 *
 * The ambient (silent) pass stays deliberately small — it runs unbidden, and a chatty
 * extractor would fill the Mémoire with the topic of the day. But the same 6 applied to an
 * EXPLICIT « retiens tout ça », where the user pointed at a 20-row table and got six rows:
 * a cap meant to bound NOISE was bounding the answer. When the user asked, silence is not
 * prudence — it is a wrong answer, so the explicit ceiling is much higher (and the caller
 * sweeps for the rest, `extractSweep.ts`).
 */
export const MAX_EXTRACTED_FACTS = 6;
export const MAX_EXPLICIT_FACTS = 25;

/** How many known entity names the prompt may carry. Enough to skip what a sweep has
 *  already captured, small enough that the list never crowds out the text it reads. */
export const MAX_EXCLUDE = 60;

/** The ceiling in force for a given call. */
export const factLimitFor = (explicit?: boolean): number =>
  explicit ? MAX_EXPLICIT_FACTS : MAX_EXTRACTED_FACTS;

/** The extraction prompt over the WIRE slice (fakes). Strict-JSON contract; entities
 *  must be copied VERBATIM (that is what the anti-hallucination filter checks). */
export function extractionPrompt(
  wireSlice: string,
  opts?: {
    explicit?: boolean;
    /** Entities already in memory (or captured earlier in this sweep) — the model is told
     *  to skip them, so the ceiling is spent on what is MISSING rather than on re-stating
     *  what is known. Bounded: a huge list would crowd out the text itself. */
    exclude?: readonly string[];
  },
): { system: string; user: string } {
  const limit = factLimitFor(opts?.explicit);
  const exclude = (opts?.exclude ?? []).slice(0, MAX_EXCLUDE);
  return {
    system:
      "Tu extrais des FAITS DURABLES d'une conversation, pour la mémoire long-terme d'un assistant. " +
      "Réponds UNIQUEMENT un objet JSON : {\"profil\": string|null, \"faits\": [{\"entite\": string, " +
      "\"alias\": string|null, \"cat\": \"personne\"|\"organisation\"|\"projet\"|\"autre\", \"fait\": string}]}. Règles : " +
      "1) UNIQUEMENT des faits durables (préférences, rôles, décisions, contexte stable) — jamais un état " +
      "ponctuel ni le sujet du jour. 2) `entite` copiée EXACTEMENT comme écrite dans le texte ; " +
      "`alias` = un AUTRE nom utilisé dans le texte pour la MÊME entité (prénom seul, sigle, surnom, " +
      "adresse e-mail), copié EXACTEMENT, sinon null. " +
      "3) `fait` = une phrase courte, relative à l'entité. 4) `profil` seulement si l'utilisateur " +
      "se décrit explicitement (métier, langue, préférences), sinon null — et toute PERSONNE ou " +
      "ORGANISATION nommée dans le profil doit AUSSI apparaître dans `faits` avec sa propre entité " +
      "(ex: « directeur chez X » ⇒ profil ET un fait pour X). 5) Maximum " +
      `${limit} faits ; rien à retenir ⇒ {"profil": null, "faits": []}. ` +
      "6) Jamais de mot de passe, clé, IBAN ou numéro de carte. " +
      "7) Deux entités DIFFÉRENTES qui partagent un prénom ou un nom (deux homonymes, un projet " +
      "et une société du même nom) restent DEUX faits distincts avec leur nom complet — ne les " +
      "fusionne jamais et n'en omets aucune." +
      (exclude.length
        ? ` 9) DÉJÀ EN MÉMOIRE — n'émets AUCUN fait pour ces entités, elles sont connues : ${exclude.join(", ")}. Concentre-toi sur ce qui MANQUE.`
        : "") +
      (opts?.explicit
        ? " 8) L'utilisateur a demandé EXPLICITEMENT de retenir quelque chose : retrouve QUOI " +
          "dans les messages précédents — la réponse de l'Assistant incluse (« retiens tout ça » " +
          "désigne souvent ce que l'Assistant vient de dire) — et note-le, UNIQUEMENT depuis ce " +
          "texte, jamais depuis tes connaissances. Si aucun nom propre ne s'y prête, mets dans " +
          "`entite` un COURT TITRE descriptif (2-4 mots) et \"cat\": \"autre\"."
        : ""),
    user: wireSlice,
  };
}

export interface ExtractedFact {
  entity: string;
  /** Another surface the text used for the same entity (first name alone, acronym,
   *  e-mail) — becomes a card alias, so the recall pass hits it next time. */
  alias?: string;
  cat: MemoryCard["cat"];
  fact: string;
  /** PRE-minted card id (`memoryId()`), assigned by the caller BEFORE the merge: a
   *  fact that becomes a NEW card keeps it, so the caller knows which cards this run
   *  created (deep-link + « Annuler ») without matching on entity names. */
  id?: string;
  /** The entity is a NOTE title the model INVENTED (explicit-ask fallback — it failed
   *  the verbatim anchor). A note dedups on its FACT, never its title: the model mints
   *  a different title every run (« Préférence de réponse », « Préférence
   *  utilisateur »…), so an entity-keyed merge would create a duplicate per run. */
  note?: boolean;
}
export interface Extraction {
  profile?: string;
  facts: ExtractedFact[];
}

const CATS = new Set(["personne", "organisation", "projet", "autre"]);

/** A "thinking" model sometimes delivers its chain of thought within the reply itself
 *  (`<think>` tags, or a reasoning-only turn that fell back to text) — it readily
 *  contains braces and JSON examples that would trip up the scan. */
const stripReasoning = (s: string): string =>
  s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "");

/** Every top-level BALANCED `{…}` in the text, string-aware (a `}` inside a JSON
 *  string never closes the object). A greedy first-`{`-to-last-`}` regex broke on any
 *  prose containing a brace — exactly what a chatty extractor produces. */
function jsonCandidates(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"' && depth > 0) inStr = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0 && --depth === 0) {
      out.push(s.slice(start, i + 1));
      start = -1;
    }
  }
  return out;
}

/** Parse + clamp the model's reply. Returns `null` when NO JSON object parses at all —
 *  an UNREADABLE reply the caller may retry — and an (possibly empty) extraction for a
 *  parseable one: "nothing learned" and "broken reply" are two different answers.
 *  Never throws. Candidates are read LAST first (a thinking model quotes JSON examples
 *  in its prose before concluding), preferring the last one shaped like the contract. */
export function parseExtraction(reply: string, limit = MAX_EXTRACTED_FACTS): Extraction | null {
  const candidates = jsonCandidates(stripReasoning(reply));
  let raw: unknown;
  let found = false;
  for (let i = candidates.length - 1; i >= 0; i--) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidates[i]);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    if (!found) {
      raw = parsed;
      found = true;
    }
    if (Array.isArray((parsed as { faits?: unknown }).faits)) {
      raw = parsed;
      break;
    }
  }
  if (!found) return null;
  const o = raw as { profil?: unknown; faits?: unknown };
  const facts: ExtractedFact[] = [];
  if (Array.isArray(o.faits)) {
    for (const f of o.faits.slice(0, limit)) {
      const x = f as { entite?: unknown; alias?: unknown; cat?: unknown; fait?: unknown };
      if (typeof x.entite !== "string" || typeof x.fait !== "string") continue;
      const entity = x.entite.trim();
      const fact = x.fait.trim().slice(0, MAX_FACTS_CHARS);
      if (!entity || !fact || !isNominalEntityName(entity)) continue;
      let alias = typeof x.alias === "string" ? x.alias.trim() : "";
      if (alias && !isNominalEntityName(alias)) alias = "";
      facts.push({
        entity,
        ...(alias && normalizeMem(alias) !== normalizeMem(entity) ? { alias } : {}),
        cat: (typeof x.cat === "string" && CATS.has(x.cat) ? x.cat : "autre") as MemoryCard["cat"],
        fact,
      });
    }
  }
  return {
    profile: typeof o.profil === "string" && o.profil.trim() ? o.profil.trim() : undefined,
    facts,
  };
}

/** An entity NAME is a short NOUN PHRASE, never a sentence fragment. Log
 *  entry from 02/08: a card « Les deux fichiers sont des… » filed as an organization — its
 *  forced redaction then turned it into gibberish (« Brightpath capitalshojojkxm ») on every
 *  injection. Rejects: sentence punctuation, more than 6 words, a conjugated verb
 *  form in LOWERCASE (deliberately case-sensitive — « Plan A », « Grand Est »
 *  remain names). Conservative: a rejection only loses one ill-born card. */
const SENTENCE_VERB_RE =
  /\b(est|sont|était|étaient|sera|seront|a|ont|avait|avaient|fait|font|peut|peuvent|doit|doivent|is|are|was|were|has|have)\b/;
export function isNominalEntityName(name: string): boolean {
  const n = name.trim();
  if (!n || /[.…;:!?]$/.test(n) || /[.;!?]\s/.test(n)) return false;
  if (n.split(/\s+/).length > 6) return false;
  return !SENTENCE_VERB_RE.test(n);
}

/** Obvious secret shapes a FACT must never carry (the extractor is told, this enforces):
 *  IBAN, key-prefixed tokens, card-length digit runs, long mixed random tokens. */
const SECRET_SHAPES = [
  /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,}\b/, // IBAN
  /\b(?:sk|pk|ghp|gho|xox[a-z]|AKIA)[-_][A-Za-z0-9_-]{8,}/i, // key prefixes
  /\b\d{13,19}\b/, // card-length digit run
  /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/, // long mixed token
];
export function looksLikeSecret(s: string): boolean {
  return SECRET_SHAPES.some((re) => re.test(s));
}

