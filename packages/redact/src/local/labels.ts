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
  // ⚠️ THE CONTRACT WITH THE TRAINING REPOSITORY. Everything above is CoNLL's vocabulary,
  // which is all the SHIPPED model emits. A model fine-tuned in `openmasq-model` emits its
  // own — and the whole point of that work is to go past PER/ORG/LOC, to the categories
  // CoNLL never had. Without these rows a retrained model would have most of its
  // labels DROPPED here, silently: no error, no warning, just spans quietly discarded.
  //
  // `labels.parity.test.ts` pins that every target below is a category the product actually
  // has (`REDACTION_CATEGORIES`), because the two repositories cannot import each other and
  // a comment is not a guard.
  COMPANY: "COMPANY",
  ADDRESS: "ADDRESS",
  POSTAL: "POSTAL",
  CITY: "CITY",
  PLACE: "PLACE",
  NAME: "NAME",
  DOB: "DOB",
  SECRET: "SECRET",
  ID: "ID",
  // The CREDENTIAL family. The trainer keeps these apart because a token classifier learns
  // a coherent class far better than a heterogeneous one — a passphrase and a PEM block
  // share no surface statistic — and they collapse HERE, which is the right place for it:
  // the product has one home for all of them, "Clés & secrets".
  //
  // ⚠️ They land on `secret`, NOT on `apikey`, and that is deliberate. `apikey` is the
  // BROAD HEURISTIC category — "toute chaîne qui RESSEMBLE à une clé", which the catalogue
  // itself warns "attrape aussi des références produit inoffensives". A user who switches
  // that off is asking to lose noisy guesses, not to stop masking a real session cookie.
  // The engine already draws the same line: its vendor-prefixed rules carry the type
  // `api_key`, which falls through to `secret`, while only the generic `api_token`
  // heuristic resolves to `apikey`.
  COOKIE: "SECRET",
  APIKEY: "SECRET",
  JWT: "SECRET",
  PRIVKEY: "SECRET",
  CONNSTR: "SECRET",
  // Deliberately unmapped (dropped): MISC, DATE, TIME, O, and anything else.
};

/** The labels a model trained in `openmasq-model` may emit. Exported so the parity test can
 *  check each one resolves to a real product category — the training repo's `MODEL_LABELS`
 *  must stay a subset of this. */
export const TRAINED_LABELS: readonly string[] = [
  "NAME", "COMPANY", "CITY", "PLACE", "ADDRESS", "POSTAL", "DOB", "SECRET", "ID",
  "COOKIE", "APIKEY", "JWT", "PRIVKEY", "CONNSTR",
];

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
