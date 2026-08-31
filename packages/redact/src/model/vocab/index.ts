/**
 * The **vocabulary volumes** — one file per domain, all folded into the single flat
 * `GENERIC_TERMS` Set by `genericTermsData.ts` (so a lookup stays O(1) and adding a
 * domain or a language costs nothing at runtime).
 *
 * They exist because a real document is DENSE with its domain's vocabulary, and a NER
 * tags that vocabulary PERSON/ORG/LOC by the dozen. Each miss is then replaced by an
 * invented name or company, so the model reads a payslip about nobody, a post-mortem
 * about a system that does not exist, a prescription for an illness with no name — and
 * not one byte of real data was protected by any of it.
 *
 * ⚠️ THE DISCIPLINE, once, for every volume — an allow-list entry ships that word in
 * clear FOREVER, so the cost of a wrong entry is unbounded and permanent:
 *
 * 1. **KIND-of-thing words only.** A common noun, an adjective, or an acronym that reads
 *    as a kind of body/act/document ("URSSAF", "IRM", "ECTS"). A specific vendor's or
 *    institution's proper NAME belongs in `notorious.ts`, which is category-SCOPED —
 *    spared here, "Datadog" would also be spared as somebody's surname.
 * 2. **Never a word that doubles as a first name or surname.** This is the rule that
 *    bounds every list, and it is why each volume carries an explicit ABSENT roster:
 *    `richter` (DE judge / very common surname), `doyen`, `dean`, `maire`, `courtier`,
 *    `ledger`, `bachelier`, `pasteur`, `curie`, and every eponymous disease
 *    (`parkinson`, `alzheimer`, `crohn`, `hodgkin`) — those ARE surnames, spelled
 *    exactly as the person's. The engine's homograph guard covers the recall side; what
 *    it cannot undo is a leak.
 * 3. **Never a bare 1-2 char token** (`go`, `c`, `ai`, `vs`): they collide with initials,
 *    and the match is on the WHOLE value, so a real one-token name would be spared.
 * 4. **Write the ACCENTED form.** The match keeps accents (only delimiters are folded),
 *    so `observabilité` and `observabilite` are two different entries. List the accented
 *    spelling — it is the one that occurs in real text — and add the bare-ASCII twin only
 *    where OCR or a degraded export actually produces it. `vocab.accents.test.ts` fails
 *    on an entry whose accented form is missing.
 * 5. **Standalone-only semantics.** A span that merely CONTAINS one of these ("Cabinet
 *    Rebour", "clinique Berlioz") is untouched; a multi-word span falls out only when
 *    EVERY word is covered (`isGenericCompound`), which is how "tribunal de commerce" or
 *    "taux de conversion" fall out of their function words plus these entries.
 *
 * Coverage is MEASURED, never assumed: each domain has a bench corpus of elaborate
 * documents (`bench/corpora/`) and a recall+precision test that stubs an over-tagging
 * detector — without that stub the deterministic pipeline never proposes "Kubernetes" as
 * an ORG and the measurement proves nothing.
 */
import { ADMIN_TERMS } from "./admin";
import { VIE_TERMS } from "./vie";
import { TECH_TERMS, TOOL_DOC_TERMS } from "./tech";
import { ARIA_ROLE_TERMS } from "./aria";
import { SANTE_TERMS } from "./sante";
import { EDU_TERMS } from "./edu";
import { DROIT_TERMS } from "./droit";
import { GESTION_TERMS } from "./gestion";
import { PRO_TERMS } from "./pro";
import { CLINIQUE_TERMS } from "./clinique";
import { FORMULAIRE_TERMS } from "./formulaire";
import { QUOTIDIEN_TERMS } from "./quotidien";

export { ARIA_ROLE_TERMS };

/**
 * ⚠️ **`CLINIQUE_TERMS` is NOT folded into `VOCAB_TERMS`, and that is the whole design.**
 * A flat entry outranks everything, so sparing « diabète » there would make the
 * user-toggleable « Santé » category INERT — the one category whose entire purpose is to
 * mask a diagnosis. It is therefore applied CATEGORY-SCOPED by `../genericTerms.ts`
 * `isNonPiiTerm`: dropped for every category EXCEPT `health`.
 *
 * Which is exactly the bug it fixes: « DOLIPRANE » ships because a NER tags it ORG, not
 * because anyone called it a diagnosis. The molecule stops being an organisation; the
 * pathology keeps obeying the user's switch. Same stance as `../notorious.ts`.
 */
export { CLINIQUE_TERMS };

/** Every domain volume, flattened. Order is irrelevant — the consumer is a Set. */
export const VOCAB_TERMS: string[] = [
  ...ADMIN_TERMS, // insurance / banking / social / tax / administration
  ...VIE_TERMS, // employment, housing, health, school, courts, invoices
  ...TECH_TERMS, // languages, infra, observability, compliance, protocols
  ...TOOL_DOC_TERMS, // the words that structure a tool's doc (System/entity — 15/08)
  ...SANTE_TERMS, // care professions, exams, biology, treatment, care pathway
  ...EDU_TERMS, // schooling, higher education, degrees, assessment, research
  ...DROIT_TERMS, // procedure, parties, remedies, contract vocabulary
  ...GESTION_TERMS, // accounting, financial statements, markets, controlling
  ...PRO_TERMS, // meetings, sales & marketing, customer service, mobility
  ...FORMULAIRE_TERMS, // form/letter furniture: labels, civil-status connectives, postal words
  ...QUOTIDIEN_TERMS, // the everyday: cooking, DIY, garden, sport, the car, the weather
];
