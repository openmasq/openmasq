import type { Detection } from "../../types";
// The « released zones of a disabled category » family lives in its own file;
// re-exported from here so callers keep ONE phase entry point.
export { disabledValueSpans } from "./disabledZones";
import { RELEASABLE_FRAGMENT } from "./disabledZones";
import { redactionCategory, URL_EXEMPT_KINDS } from "../../kinds";
import { isKept, escapeRegExp } from "../../util";
import { occursOutsideUrl } from "../../engine/urls";
import { isNonPiiTerm, isGenericTerm, isStopword } from "../genericTerms";
import { isNotoriousEntity, type NotorietyOpts } from "../notorious";
import {
  trimSpanEdges,
  stripCivilStatusPrefix,
  stripTrailingEmailParen,
  stripBankOpPrefix,
} from "./spanEdges";
import {
  isMachineTokenGeo,
  isNotoriousFragment,
  isProseGeoHomograph,
  isSelfBoundEntity,
} from "./textContext";
import { isGluedProse } from "./gluedProse";
import { isBareNumber, numberCarriesMeaning } from "../pseudonymizeNumbers";

type UrlSpans = Parameters<typeof occursOutsideUrl>[2];

/** The fail-closed gates the {@link filterCandidates} pass enforces — isolated here so
 *  each drop is reviewable + testable in one place (the product's core leak surface). */
export interface FilterCtx {
  /** Allow-list — never redact (case-insensitive; wins over `forced`). */
  keep: Set<string>;
  /** UI categories the org MANDATES (a member cannot reveal them). `keep` does NOT win over
   *  these (audit): a composer "garder en clair" chip / reveal must not let an org-forced
   *  category egress in clear. Empty ⇒ unchanged (keep wins over everything, the default). */
  unrevealable?: Set<string>;
  /** True for an authored user message: a detected value equal to a fake is the user's
   *  REAL value, so DON'T drop it (it must get its own fake — dropping = leak). */
  reFakeExisting?: boolean;
  /** "Never re-fake a fake" predicate (tool-result compounding guard). */
  isExistingFake: (v: string) => boolean;
  /** Categories the user turned off → left in clear. */
  disabled: Set<string>;
  /** URL spans when the `url` category is OFF (drop a value confined to a URL), else null. */
  urlSpans: UrlSpans | null;
  /** Email spans (drop a non-email fragment confined to an email address), else null. */
  emailSpans: UrlSpans | null;
  /** Spans of the values a DISABLED category claimed — see {@link disabledValueSpans}. A
   *  candidate confined to one of them is dropped too, or turning a category off would
   *  shred its values instead of releasing them. Null/empty ⇒ gate off. */
  disabledSpans?: UrlSpans | null;
  /** Scope of the notoriety dispensation (`../notorious.ts`): `{commercial: true}` =
   *  commercial brands too (Standard/Enhanced levels). Absent ⇒ base
   *  dispensation only (public figures, public bodies, tickers, countries). */
  notoriety?: NotorietyOpts;
  /** The released VALUES themselves — the cheap pre-filter for the gate below: only a
   *  candidate that is a SUBSTRING of one of them can possibly sit inside its span, and
   *  a few short `includes` beat one document scan per candidate. */
  releasedValues?: readonly string[];
  input: string;
}

/**
 * Is the candidate just a FORCED value dressed up in generic words?
 * (« Employeur de Camille Verlant » when « Camille Verlant » is forced by a Memory
 * card.) The forced value must sit there at WORD BOUNDARIES — « Camille Verlant »
 * inside « Camille Verlandet » doesn't count — and every remaining word must be a stopword
 * or a generic term. Any doubt ⇒ false: the candidate lives its own life (fail closed — a
 * wrong drop would send the rest of the span in clear).
 */
function dressesForcedValue(value: string, forcedValues: readonly string[]): boolean {
  for (const f of forcedValues) {
    if (!f || value === f || !value.includes(f)) continue;
    const at = new RegExp(`(?<!\\p{L})${escapeRegExp(f)}(?!\\p{L})`, "u");
    if (!at.test(value)) continue;
    const reste = value.replace(at, " ");
    const mots = reste.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (mots.length && mots.every((w) => isStopword(w) || isGenericTerm(w))) return true;
  }
  return false;
}

/**
 * Phase 2 — the FP-prevention / fail-closed candidate filter. Drops: allow-listed values,
 * an echoed fake (unless this is authored content), generic institutional/legal/type words,
 * notorious public entities (famous figures/brands/tickers, countries — category-scoped),
 * disabled categories, a value confined to a URL (except credentials — audit H-3), a
 * non-email fragment confined to an email (leaks the local-part otherwise), and a bare
 * meaningless number. A `forced` candidate bypasses every gate below the echo/keep checks.
 */
export function filterCandidates(candidates: Detection[], ctx: FilterCtx): Detection[] {
  const {
    keep,
    unrevealable,
    reFakeExisting,
    isExistingFake,
    disabled,
    urlSpans,
    emailSpans,
    disabledSpans,
    releasedValues,
    notoriety,
    input,
  } = ctx;
  // Trim BEFORE filtering: each of the gates below compares STRINGS
  // (notoriety, keep, generic terms), and a glued comma makes them all miss.
  // And on a NAME, strip the civil-status marker glued on by the detector
  // (« née X », « épouse Y ») — `stripCivilStatusPrefix` explains what keeping it cost.
  const forcedValues = candidates.filter((c) => c.forced && c.value).map((c) => c.value);
  return candidates
    .map((c) => {
      let v = trimSpanEdges(c.value);
      // A leading bank operation code (« VIR Rebour ») belongs to the STATEMENT, not
      // to the entity: keeping it gave two fakes to the same supplier (`spanEdges.ts`).
      const cat0 = redactionCategory(c.category);
      if (cat0 === "name" || cat0 === "company") v = stripBankOpPrefix(v);
      if (redactionCategory(c.category) === "name") {
        v = stripCivilStatusPrefix(v);
        // ⚠️ « Nom (adresse@exemple.fr) »: the parenthesis is stripped from the span, else the
        // REAL address travels in clear inside the fake (`spanEdges.ts` tells the story).
        v = stripTrailingEmailParen(v);
      }
      return v === c.value ? c : { ...c, value: v };
    })
    .filter((c) => {
    // `keep` wins over everything — EXCEPT an org-MANDATED category, which a member can't
    // reveal, so a kept value whose category is org-forced is still redacted (audit).
    if (isKept(c.value, keep) && !(unrevealable?.size && unrevealable.has(redactionCategory(c.category))))
      return false; // allow-listed → never redact (keep wins over forced, but not over org-forced)
    // "Never re-fake a fake" — but ONLY for tool-result echoes (compounding guard). For an
    // authored user message (`reFakeExisting`), a detected value that equals a fake is the
    // user's REAL value, not our echo: keep it as a candidate so it gets its OWN distinct fake
    // (else it's dropped → sent in CLEAR = leak → its reverse corrupts the other value).
    if (!reFakeExisting && isExistingFake(c.value)) return false;
    if (c.forced) return true; // user-forced → skip the FP-prevention gates below
    // A span that only DRESSES UP a FORCED value in generic words gives way.
    // The real-life case (Memory card, 14/08): « Employeur de Camille Verlant » claimed as
    // ORGANISATION by the contextual gate — the longer span was winning over the value
    // forced by the person card, which then got a SECOND fake, of type org: the
    // model was reading two entities where there is one. Deliberately bounded: we only give way if
    // the REMAINDER (forced value removed, at word boundaries) is entirely generic
    // — otherwise the span carries content of its own (« Rebour & Fils, employeur de X ») and
    // giving way would send it out in CLEAR, which would be the opposite of a fix.
    if (dressesForcedValue(c.value, forcedValues)) return false;
    // Never PII on its own: a generic institutional / legal / document-type word (FR
    // "assemblée générale", "syndic"…), an identifier LABEL ("iban", "passeport"), a
    // compound whose every word is generic ("read-data-schema" — MCP tool metadata,
    // whose per-word aliases redacted every "data"/"query" in the conversation), or
    // one of those behind an article. ONE predicate, shared with `../detect.ts` — the
    // three call sites had drifted apart (see `isNonPiiTerm`). This is the choke point,
    // so dropping here protects the DETERMINISTIC detectors too.
    const cat = redactionCategory(c.category);
    if (isNonPiiTerm(c.value, cat)) return false;
    // GLUED OCR PROSE. A scan whose words run together ("le20juin2024", "du20juin2024a")
    // is read as an opaque TOKEN by the credential rules — measured on a corpus of real
    // scanned documents. See `isGluedProse` for why the gate is narrow: a credential and
    // glued prose share a shape, and only the leading function word tells them apart.
    if (isGluedProse(c.value)) return false;
    // Notorious PUBLIC entity — world knowledge (a famous figure, a major company/fund/
    // ticker, a COUNTRY), never the user's own data: faking it makes the model answer
    // about nobody. Category-SCOPED (a person named "Jordan" is not the country — see
    // `../notorious.ts`), and an org-MANDATED category still wins, like it does over `keep`.
    // …EXCEPT when the text ties it to the writer (« je travaille chez Google »):
    // notoriety says the entity is public, never that the RELATIONSHIP is. See
    // `textContext.ts` — the gate only covers first-person attachment,
    // so « Total a répondu à l'appel d'offres » stays in clear.
    if (
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isNotoriousEntity(c.value, cat, notoriety) &&
      !isSelfBoundEntity(c.value, input)
    )
      return false;
    // …and neither is a WORD OF one that this very text names: a detector proposing
    // « emploi » next to « Pôle » walks past the check above, and the whole document is
    // then rewritten around an invented company. Same category scoping, same override.
    if (!(unrevealable?.size && unrevealable.has(cat)) && isNotoriousFragment(c.value, cat, input, notoriety))
      return false;
    // An all-lowercase place word in ordinary prose is the common noun, not the town
    // (« les phrases lourdes », « il ouvre les vannes »). A locative neighbour, a postal
    // code or a capitalised occurrence anywhere keeps it — see `textContext.ts`.
    if (
      cat === "location" &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isProseGeoHomograph(c.value, input)
    )
      return false;
    // A MACHINE IDENTIFIER segment (`CARD` in `CARD_PAYMENT`) is not a place:
    // the fake (« METZ_PAYMENT », a real bank statement) corrupts a technical enumeration
    // without protecting anyone. Same family as the gate above: LOCATION only,
    // occurrence-safe, and the org-mandated override keeps the upper hand.
    if (
      cat === "location" &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isMachineTokenGeo(c.value, input)
    )
      return false;
    if (disabled.has(cat)) return false;
    // …and neither does a FRAGMENT of one: a candidate confined to the span of a value the
    // user asked to see in clear is part of that value (a LOC inside a released ADDRESS, a
    // place inside a released company name). Dropping it is what makes « catégorie
    // désactivée » mean one thing instead of half-masking the value. An org-MANDATED
    // category is exempt — a policy the admin enforces cannot be released by turning a
    // NEIGHBOURING category off. `forced` never reaches here (it returned above).
    if (
      disabledSpans?.length &&
      cat === RELEASABLE_FRAGMENT &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      // Cheap necessary condition FIRST: a value that isn't part of any released value
      // can't be confined to one, and skipping the scan here is what keeps this off the
      // send's critical path.
      releasedValues?.some((v) => v.includes(c.value)) &&
      !occursOutsideUrl(c.value, input, disabledSpans)
    )
      return false;
    // URL-only suppression NEVER applies to a credential NOR to contact identity: a key,
    // a PAN/IBAN, an e-mail or a phone number embedded in a URL must still be redacted,
    // not leaked to the model (audit H-3 + F2 — see `URL_EXEMPT_KINDS`).
    if (urlSpans && !URL_EXEMPT_KINDS.has(cat) && !occursOutsideUrl(c.value, input, urlSpans))
      return false; // URL-only
    // Email-fragment gate: drop a non-email value confined to email addresses (reuses the
    // generic span-overlap check). Never drops the email itself (its category is "email").
    // ⚠️ The test is an OVERLAP, and it was also excluding the SUPERSET: a connection
    // string (`postgres://user:pass@hôte:5432/base`) overlaps the email span that
    // its `pass@hôte` builds, so it was excluded HERE — and it's the shorter
    // email fragment that went out faked instead, leaving the user, the host and the
    // database port IN CLEAR. A superset STRICTLY contains an entire span
    // (DSN, `Nom <mail@x>`) and is judged on its own category. The bound is strict
    // on purpose: a value EQUAL to the span — the same address re-detected under another
    // label (a « Contact : » field) — stays a fragment, else it comes back out under
    // a category that « E-mail disabled » doesn't cover.
    if (
      emailSpans &&
      redactionCategory(c.category) !== "email" &&
      !emailSpans.some(([s, e]) => {
        const span = input.slice(s, e);
        return c.value.length > span.length && c.value.includes(span);
      }) &&
      !occursOutsideUrl(c.value, input, emailSpans)
    )
      return false;
    if (isBareNumber(c.value) && !numberCarriesMeaning(c.category)) return false;
    return true;
  });
}

/** Prose-geo categories: a region/department mentioned in PROSE. Emitted ungated by
 *  `frGeo`/`usGeo`/`cjkGeo` because inside an ADDRESS they must be faked coherently. */
const PROSE_GEO = new Set(["REGION", "DEPARTMENT"]);

/**
 * PERSONAL ANCHOR for prose geo: a region/department ALONE is not
 * personal data — « les 5 plus grandes villes de Normandie » is a general-knowledge
 * question, and redacting it makes the model drift onto the FAKE's cities
 * (Dijon for a fake Bourgogne), an IRREVERSIBLE corruption (the derivation isn't
 * a vault key). The product rule: nothing is redacted as long as no personal
 * data is present. So REGION/DEPARTMENT only survive if:
 *  - ANOTHER candidate (name, address, commune, phone…) survived the gates — the geo
 *    accompanies personal data (an address, a form); or
 *  - the VAULT already carries entries — the conversation is already personal, and a
 *    geo coherent with the existing fakes must stay that way.
 * A `forced` candidate is never dropped (the user explicitly asked for it).
 */
export function dropUnanchoredProseGeo(kept: Detection[], vaultEmpty: boolean): Detection[] {
  const anchored = !vaultEmpty || kept.some((c) => !PROSE_GEO.has(c.category) || c.forced);
  return anchored ? kept : kept.filter((c) => !PROSE_GEO.has(c.category) || c.forced);
}

/**
 * Drop candidates fully SUBSUMED by a longer one — e.g. a NER-detected NAME
 * ("julien.sabourdin") inside a regex EMAIL ("julien.sabourdin@gmail.com") would
 * otherwise be redacted as a SECOND, overlapping item (2 chips for 1 email).
 * Value-based + occurrence-safe: a candidate is dropped only when EVERY occurrence
 * of its value sits inside a longer candidate's value — a standalone occurrence
 * elsewhere (a real name NOT in an email) is still caught.
 */
export function deNest(kept: Detection[], input: string): Detection[] {
  // Exact VALUE duplicate where one of the candidates comes from the generic key
  // heuristic (`apikey`) and the other from a SPECIFIC rule: the rule wins, the key
  // duplicate is removed. Recording both let the LAST category overwrite the display
  // (« api token » on a BIC that was nonetheless typed `bic`, log 02/08). Surgical: a
  // duplicate between two non-generic categories keeps the existing behaviour.
  const hasSpecific = new Set(
    kept.filter((c) => redactionCategory(c.category) !== "apikey").map((c) => c.value),
  );
  kept = kept.filter((c) => !(redactionCategory(c.category) === "apikey" && hasSpecific.has(c.value)));
  return kept.filter((c) => {
    const supers = kept.filter(
      (o) => o.value.length > c.value.length && o.value.includes(c.value),
    );
    if (!supers.length) return true;
    let masked = input;
    for (const s of supers) masked = masked.split(s.value).join(" ".repeat(s.value.length));
    return masked.includes(c.value);
  });
}
