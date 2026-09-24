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
import { isMalformedEntity } from "./shapeGates";
import { isBareNumber, numberCarriesMeaning } from "./numbers";

type UrlSpans = Parameters<typeof occursOutsideUrl>[2];

/** The fail-closed gates the {@link filterCandidates} pass enforces — isolated here so
 *  each drop is reviewable + testable in one place (the product's core leak surface). */
export interface FilterCtx {
  /** Allow-list — never redact (case-insensitive; wins over `forced`). */
  keep: Set<string>;
  /** UI categories the org MANDATES (a member cannot reveal them). `keep` does NOT win over
   *  these. Empty ⇒ keep wins over everything (the default). */
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
 * notorious public entities (category-scoped), disabled categories, a value confined to a
 * URL (except credentials and contact identity), a non-email fragment confined to an email,
 * and a bare meaningless number. A `forced` candidate bypasses every gate below the
 * echo/keep checks.
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
  // Trim BEFORE filtering: the gates below compare STRINGS, and a glued comma makes them all
  // miss. On a NAME, strip the civil-status marker glued on by the detector.
  const forcedValues = candidates.filter((c) => c.forced && c.value).map((c) => c.value);
  return candidates
    .map((c) => {
      let v = trimSpanEdges(c.value);
      // A leading bank operation code (« VIR Rebour ») belongs to the STATEMENT, not to the
      // entity (`spanEdges.ts`).
      const cat0 = redactionCategory(c.category);
      if (cat0 === "name" || cat0 === "company") v = stripBankOpPrefix(v);
      if (redactionCategory(c.category) === "name") {
        v = stripCivilStatusPrefix(v);
        // « Nom (adresse@exemple.fr) »: strip the parenthesis, else the REAL address travels
        // in clear inside the fake (`spanEdges.ts`).
        v = stripTrailingEmailParen(v);
      }
      return v === c.value ? c : { ...c, value: v };
    })
    .filter((c) => {
    // `keep` wins over everything — EXCEPT an org-MANDATED category, which a member can't reveal.
    if (isKept(c.value, keep) && !(unrevealable?.size && unrevealable.has(redactionCategory(c.category))))
      return false; // allow-listed → never redact (keep wins over forced, but not over org-forced)
    // "Never re-fake a fake" — ONLY for tool-result echoes. For an authored user message a
    // value equal to a fake is the user's REAL value: keep it so it gets its OWN fake
    // (dropping it sends it in CLEAR and its reverse corrupts the other value).
    if (!reFakeExisting && isExistingFake(c.value)) return false;
    if (c.forced) return true; // user-forced → skip the FP-prevention gates below
    // A span that only DRESSES UP a FORCED value in generic words gives way (« Employeur de
    // Camille Verlant » when the name is forced), else the person gets a SECOND fake of type
    // org. Bounded: only if the REMAINDER is entirely generic, else the span carries content
    // of its own and giving way would send it out in CLEAR.
    if (dressesForcedValue(c.value, forcedValues)) return false;
    // Never PII on its own: a generic institutional / legal / document-type word, an
    // identifier LABEL, a compound whose every word is generic (MCP tool metadata), or one
    // of those behind an article. ONE predicate (`isNonPiiTerm`), the choke point that
    // protects the DETERMINISTIC detectors too.
    const cat = redactionCategory(c.category);
    if (isNonPiiTerm(c.value, cat, input)) return false;
    // GLUED OCR PROSE ("le20juin2024") reads as an opaque TOKEN to the credential rules. The
    // gate is narrow (`isGluedProse`): only the leading function word tells it from a key.
    if (isGluedProse(c.value)) return false;
    // A free-form entity whose SHAPE no name or company takes — a backtick, a sentence
    // boundary, a kebab-case identifier: a NER reading Markdown as prose (`shapeGates.ts`).
    if ((cat === "name" || cat === "company") && isMalformedEntity(c.value)) return false;
    // Notorious PUBLIC entity (a famous figure, a major company, a COUNTRY) is world
    // knowledge, never the user's data: faking it makes the model answer about nobody.
    // Category-SCOPED (`../notorious.ts`), an org-MANDATED category still wins, and the text
    // tying it to the writer (« je travaille chez Google ») keeps it: notoriety says the
    // entity is public, never that the RELATIONSHIP is (`textContext.ts`).
    if (
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isNotoriousEntity(c.value, cat, notoriety) &&
      !isSelfBoundEntity(c.value, input)
    )
      return false;
    // …and neither is a WORD OF one that this very text names (« emploi » next to « Pôle »).
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
    // A MACHINE IDENTIFIER segment (`CARD` in `CARD_PAYMENT`) is not a place: the fake
    // corrupts a technical enumeration without protecting anyone. LOCATION only.
    if (
      cat === "location" &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isMachineTokenGeo(c.value, input)
    )
      return false;
    if (disabled.has(cat)) return false;
    // …and neither does a FRAGMENT of one: a candidate confined to a value the user asked to
    // see in clear is part of that value (a LOC inside a released ADDRESS). An org-MANDATED
    // category is exempt. `forced` never reaches here.
    if (
      disabledSpans?.length &&
      cat === RELEASABLE_FRAGMENT &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      // Cheap necessary condition FIRST: keeps the document scan off the send's critical path.
      releasedValues?.some((v) => v.includes(c.value)) &&
      !occursOutsideUrl(c.value, input, disabledSpans)
    )
      return false;
    // URL-only suppression NEVER applies to a credential NOR to contact identity: a key, a
    // PAN, an e-mail or a phone embedded in a URL must still be redacted (`URL_EXEMPT_KINDS`).
    if (urlSpans && !URL_EXEMPT_KINDS.has(cat) && !occursOutsideUrl(c.value, input, urlSpans))
      return false; // URL-only
    // Email-fragment gate: drop a non-email value confined to email addresses. Never drops
    // the email itself. The test is an OVERLAP, so a SUPERSET that STRICTLY contains an
    // entire span (a DSN `postgres://user:pass@hôte`, `Nom <mail@x>`) is judged on its own
    // category — else the shorter email fragment goes out faked and the user, host and port
    // stay IN CLEAR. Strict on purpose: a value EQUAL to the span (the same address under a
    // « Contact : » label) stays a fragment.
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
 * PERSONAL ANCHOR for prose geo: a region/department ALONE is not personal data (« les 5
 * plus grandes villes de Normandie »), and redacting it makes the model drift onto the
 * FAKE's cities — IRREVERSIBLY. REGION/DEPARTMENT only survive if ANOTHER candidate
 * survived the gates (the geo accompanies personal data) or the VAULT already carries
 * entries (a geo coherent with the existing fakes must stay so). `forced` is never dropped.
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
  // Exact VALUE duplicate between the generic `apikey` heuristic and a SPECIFIC rule: the
  // rule wins, else the LAST category overwrites the display (« api token » on a BIC).
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
