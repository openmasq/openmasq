// Maps a token-classification model's entity label to one of the engine's own
// categories (NAME/ORG/CITY/… — the same vocabulary the LLM detector emits, so the
// rest of the pipeline, `fakeFor`/`redactionCategory`, treats both sources alike).
//
// The local NER model detects the CLASSIC named-entity set (person / organisation /
// location). Structured PII (email/phone/card/IBAN/IP/…) is left to the regex
// `RULES`, which run alongside the model and are more precise on shape. A `LOC`
// hit maps to CITY so `fakeFor` swaps it for a real different city; the regex still
// covers postal codes / street numbers within a full address.

/**
 * Model entity label (e.g. `PER`, `B-ORG`, `LOC`) -> engine category (the UPPER
 * token `fakeFor` / `redactionCategory` understand), or "" to DROP the span
 * (e.g. `MISC`, which is too noisy — nationalities, events, products — for the
 * "names/orgs/places" goal). Covers the standard CoNLL labels plus common
 * synonyms other NER models emit.
 */
const LABEL_TO_CATEGORY: Readonly<Record<string, string>> = {
  PER: "NAME",
  PERSON: "NAME",
  PERS: "NAME",
  PS: "NAME",
  ORG: "ORG",
  ORGANIZATION: "ORG",
  OG: "ORG",
  LOC: "CITY",
  LOCATION: "CITY",
  GPE: "CITY",
  LC: "CITY",
  // Deliberately unmapped (dropped): MISC, DATE, TIME, O, and anything else.
};

/**
 * Map a raw model label to an engine category, or "" to drop the span. The
 * label is normalised (BIO prefix stripped, upper-cased) before lookup, so
 * `B-PER` / `I-per` / `PER` all resolve the same.
 */
export function nerLabelToCategory(label: unknown): string {
  const raw = typeof label === "string" ? label : "";
  const norm = raw.replace(/^[BILUES]-/i, "").trim().toUpperCase();
  return LABEL_TO_CATEGORY[norm] ?? "";
}
