import { applyVault, isGenericTerm, isStopword, unredact, type Vault } from "@openmasq/redact";
import { isTokenHomograph, keyInText, normalizeMem } from "./memory";
import { isExplicitMemoryAsk } from "./extractExplicit";
import { appendToProfile } from "./profile";
import { looksLikeSecret, type ExtractedFact, type Extraction } from "./extractParse";

// Le contrat prompt/parse de l'extracteur vit dans `extractParse.ts`, la fusion dans le
// store dans `mergeExtraction.ts` (règle 1) — ré-exportés ici pour que les imports
// existants ne bougent pas.
export { mergeExtraction } from "./mergeExtraction";
export {
  extractionPrompt,
  parseExtraction,
  looksLikeSecret,
  factLimitFor,
  MAX_EXTRACTED_FACTS,
  MAX_EXPLICIT_FACTS,
} from "./extractParse";
export type { ExtractedFact, Extraction } from "./extractParse";

// The explicit-ask detection lives in `extractExplicit.ts` (multilingual phrase lists);
// re-exported so existing `from "./extract"` imports are unchanged.
export { isExplicitMemoryAsk, EXPLICIT_LOOKBACK } from "./extractExplicit";

/**
 * AUTOMATIC memory extraction — the pure core. The privacy trick that makes it free of
 * any NEW egress: the extractor model reads the conversation's WIRE form (the already-
 * redacted replay this model has ALREADY seen), answers in fakes, and the result is
 * un-redacted LOCALLY through the conversation vault. Not one additional byte of PII
 * leaves the machine.
 *
 * The vault then doubles as the ANTI-HALLUCINATION filter: an extracted entity must,
 * once un-redacted, appear VERBATIM in the real conversation text — an entity the model
 * invented resolves to nothing present and is dropped.
 */

/** The zero-cost gate's floor: below this much NEW user text, never call a model. */
export const MIN_NEW_CHARS = 400;

/** A fact that is a SELF-preference about how the assistant should answer / what the
 *  user likes (« Préfère des réponses courtes en français »). It belongs to the
 *  PROFILE, never to a card — shared with `dedupe.ts` `autoCleanMemory`, which
 *  migrates the backlog of note cards this class produced before the routing fix. */
export const isSelfPreference = (s: string): boolean =>
  /^(?:l['’]utilisateur\s+)?(?:préf[èe]re|préférerait|aime|adore|prefers?|likes?|prefiere|preferisce|prefere|prefiro|bevorzugt)\b/i.test(
    s.trim(),
  ) || /^(?:ma|sa|la) préférence\b/i.test(s.trim());

export interface ConvSlice {
  /** REAL user-message texts since the watermark (assistant turns excluded on purpose:
   *  extracting from our own replies — which embed the injected memory — is the
   *  self-reinforcement loop). */
  userTexts: string[];
  /** value→kind for the slice (the NER already ran — a FREE entity signal). */
  kinds: Record<string, string>;
}

/** The zero-cost "worth a model call?" gate. No entity AND no explicit phrasing AND
 *  under the char floor ⇒ skip, no call. */
export function worthExtracting(slice: ConvSlice): boolean {
  const text = slice.userTexts.join("\n");
  if (!text.trim()) return false;
  if (isExplicitMemoryAsk(text)) return true;
  if (text.length < MIN_NEW_CHARS) return false;
  return Object.values(slice.kinds).some((k) => k === "name" || k === "company");
}

/**
 * Resolve a parsed extraction back to REAL values and keep only what the conversation
 * actually supports:
 *  - every field is un-redacted through the conversation vault (fake → real);
 *  - an entity whose REAL form does not appear (case/accent-insensitively) in the real
 *    slice text — the user turns, plus the assistant turns on an explicit ask — is a
 *    HALLUCINATION → dropped;
 *  - a fact carrying a secret shape is dropped (memory stores facts, never credentials).
 */
export function resolveExtraction(
  parsed: Extraction,
  vault: Vault,
  realText: string,
  opts?: {
    /** EXPLICIT-ask mode only: an entity that fails the verbatim anchor becomes a NOTE
     *  card (model-chosen short title, cat forced « autre ») instead of being dropped.
     *  A deliberate, BOUNDED loosening of the anti-hallucination filter — the user asked
     *  for retention; silent extraction never gets it. Secret screening still applies. */
    allowNotes?: boolean;
    /** The WIRE text the model actually read (fakes). Its only job is to tell an
     *  unresolved PSEUDONYM from a model-invented note title: both fail the real-text
     *  anchor, but only the pseudonym is copied verbatim from the wire. Without it, a
     *  vault that hasn't hydrated turned « Verdanta Industries » — the fake for
     *  « gouvernement français » — into a memory card, storing the model's view as if it
     *  were the user's data (measured; the card even kept the real value as an alias).
     *  Absent ⇒ the guard is off and behaviour is unchanged. */
    wireText?: string;
  },
): Extraction {
  const normSource = normalizeMem(realText);
  const anchoredIn = (s: string): boolean => keyInText(normSource, normalizeMem(s));
  const normWire = opts?.wireText ? normalizeMem(opts.wireText) : "";
  /** Present in what the MODEL read, absent from the real text ⇒ an unresolved fake. */
  const fromWireOnly = (s: string): boolean =>
    !!normWire && keyInText(normWire, normalizeMem(s)) && !anchoredIn(s);
  // Un extracteur vivant recopie l'entité AVEC son élision/article de la phrase
  // (« d'Atelier Torbel », « chez Karl Studio ») — une surface différente qui crée un
  // DOUBLON de carte. La forme nue est préférée quand elle s'ancre aussi — mais
  // JAMAIS pour une personne : « de Vinci », « De Gaulle » sont des PARTICULES du
  // nom, pas des élisions de phrase.
  const stripElision = (s: string, cat: string): string => {
    if (cat === "personne") return s;
    const bare = s.replace(/^(?:[dl]['’]\s*|de\s+la\s+|de\s+|du\s+|des\s+|chez\s+)/i, "").trim();
    return bare.length >= 3 && bare !== s && anchoredIn(bare) ? bare : s;
  };
  const facts: ExtractedFact[] = parsed.facts
    .map((f) => ({
      ...f,
      entity: stripElision(unredact(f.entity, vault).trim(), f.cat),
      alias: f.alias ? stripElision(unredact(f.alias, vault).trim(), f.cat) : undefined,
      fact: unredact(f.fact, vault).trim(),
    }))
    .flatMap((f) => {
      if (looksLikeSecret(f.fact) || looksLikeSecret(f.entity)) return [];
      // Une entité-PHRASE (« Atelier Torbel s'appelle Ondine ») passe l'ancrage verbatim
      // (elle est copiée du texte !) mais n'est pas un NOM : une carte-fragment ne se
      // rappellera jamais proprement et DOUBLONNE les vraies cartes. Un verbe de
      // clause ou une entité trop longue la trahissent.
      if (
        /\b(?:s['’]appelle|se nomme|qui est|c['’]est|travaille|habite|g[èe]re|paie|dirige)\b/i.test(f.entity) ||
        f.entity.split(/\s+/).length > 5
      ) {
        return [];
      }
      // A GENERIC word must never become a matchable surface via the SILENT path —
      // an alias « direction » (or an entity « équipe ») would recall the card on
      // every sentence containing that word, a permanent recall false positive. The
      // user can still author one manually (their explicit choice), and an EXPLICIT
      // « retiens que… » keeps its entity (the ask is its own consent).
      const generic = (s: string): boolean => isStopword(s) || isGenericTerm(s);
      if (!opts?.allowNotes && generic(f.entity)) return [];
      // The alias passes the SAME verbatim anchor as the entity — an invented alias
      // would poison the recall pass — and is dropped alone, never the whole fact.
      // Un alias MONO-MOT homographe (« Claire ») est refusé aussi : posé sur l'une
      // des deux Claires, il fait matcher sa carte en tier whole-key sur CHAQUE
      // occurrence du prénom — le débordement exact que la deny-list des tokens évite.
      const alias =
        f.alias &&
        !looksLikeSecret(f.alias) &&
        !generic(f.alias) &&
        !(!f.alias.includes(" ") && isTokenHomograph(f.alias)) &&
        !fromWireOnly(f.alias) &&
        anchoredIn(f.alias) &&
        normalizeMem(f.alias) !== normalizeMem(f.entity)
          ? f.alias
          : undefined;
      const clean = { ...f, alias };
      if (anchoredIn(f.entity)) return [clean];
      // An unresolved PSEUDONYM is never a note title: writing it would put a value the
      // user never wrote into their memory, under a name only the model ever saw.
      if (fromWireOnly(f.entity)) return [];
      if (opts?.allowNotes && f.entity.length >= 3 && f.entity.length <= 60) {
        // a note: title kept, never a fake anchor — and FLAGGED, so the merge dedups
        // it on its FACT (the title is model-invented, different every run).
        return [{ ...clean, cat: "autre" as const, note: true }];
      }
      return []; // hallucinated (silent mode) → dropped
    });
  let profile = parsed.profile ? unredact(parsed.profile, vault).trim() : undefined;
  if (profile && looksLikeSecret(profile)) profile = undefined;
  // A NOTE whose fact is a SELF-PREFERENCE (« Préfère des réponses courtes en
  // français ») belongs to the PROFILE, not to a card — that is the module contract
  // (« a preference has no entity »), and the card path is exactly where the reported
  // duplicates came from: the model titles it « Préférence de réponse » one run,
  // « Préférence utilisateur » the next, and an entity-keyed merge can never dedup
  // an invented title. Facts ABOUT a named someone keep their card (the entity
  // anchored, so `note` is false).
  const prefNotes = facts.filter((f) => f.note && isSelfPreference(f.fact));
  // Coverage-deduped fold (`memory/profile.ts`): the model often puts the SAME
  // preference in `profil` AND as a fact — one run must not write it twice, in any
  // phrasing.
  if (prefNotes.length) profile = appendToProfile(profile, prefNotes.map((f) => f.fact)).profile;
  return { profile, facts: facts.filter((f) => !prefNotes.includes(f)) };
}

/** The wire slice the extractor reads: the SAME redacted replay the model already saw
 *  (applyVault over the real user texts). */
export function wireSlice(userTexts: string[], vault: Vault): string {
  return userTexts.map((t) => applyVault(t, vault, new Set())).join("\n\n");
}

/** A turn of the EXPLICIT-ask slice — assistant included, because « retiens tout ça »
 *  usually points at the ANSWER (a browsed page, a list the model just produced).
 *  Silent extraction stays user-only (the self-reinforcement loop `ConvSlice` states). */
export interface SliceTurn {
  role: "user" | "assistant";
  text: string;
}

/** Labeled wire over whole turns. Egress-neutral like `wireSlice`: the user texts are
 *  the replay the model already saw, and an assistant text is that model's OWN prior
 *  output — stored REAL (un-redacted) in the conversation, so applyVault re-fakes it
 *  back to exactly the form the model emitted. Not one new real value goes out. */
export function wireTurns(turns: SliceTurn[], vault: Vault): string {
  return turns
    .map((t) => `${t.role === "user" ? "Utilisateur" : "Assistant"} : ${applyVault(t.text, vault, new Set())}`)
    .join("\n\n");
}
