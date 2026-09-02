#!/usr/bin/env node
/**
 * Adapter: presidio-research's `synth_dataset_v2.json` (InputSample format) to the home
 * bench's BenchCase format — to replay OUR metric on THEIR data.
 *
 * The taxonomy mapping is where comparisons die: here it is, whole and owned.
 *
 * FOUR types are out of the product's scope and are NOT scored for recall — titles, age,
 * nationality/religion, and dates. Dates joined them on 2026-09-02: this engine redacts a
 * date only in a BIRTH context, on purpose (a blanket date rule would destroy every
 * timestamp a conversation carries), while this corpus annotates every date in every
 * sentence as a truth. Scoring it was measuring a design decision as a defect.
 *
 * They are mapped to `CONTEXT`, NOT dropped — and the difference is the whole fairness of
 * the comparison. `metric.ts` skips `CONTEXT` in the recall denominator but still counts it
 * as annotated truth when deciding what a FALSE POSITIVE is. Deleting the spans instead
 * would have turned every date Presidio correctly finds into an error against it: 119
 * fabricated false positives, in our favour, on a number we then publish. An engine is not
 * penalised for finding a real personal datum we chose not to score.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const MAP = {
  PERSON: "NAME",
  EMAIL_ADDRESS: "EMAIL",
  PHONE_NUMBER: "PHONE",
  CREDIT_CARD: "CARD",
  IBAN_CODE: "IBAN",
  IP_ADDRESS: "IP",
  US_SSN: "ID",
  US_DRIVER_LICENSE: "ID",
  STREET_ADDRESS: "ADDRESS",
  GPE: "CITY",
  ORGANIZATION: "ORG",
  ZIP_CODE: "POSTAL",
  DOMAIN_NAME: "URL",
};

/** Out of the product's scope: annotated as `CONTEXT` (precision only, never recall). */
const UNSCORED = new Set(["TITLE", "AGE", "NRP", "DATE_TIME"]);

const src = JSON.parse(readFileSync(join(HERE, "data", "synth_dataset_v2.json"), "utf8"));
let scored = 0, unscored = 0;
const cases = src.map((s, i) => {
  const truth = [];
  for (const sp of s.spans ?? []) {
    if (UNSCORED.has(sp.entity_type)) { truth.push([sp.entity_value, "CONTEXT"]); unscored++; continue; }
    const cat = MAP[sp.entity_type];
    if (!cat) throw new Error(`type non mappé : ${sp.entity_type}`);
    truth.push([sp.entity_value, cat]);
    scored++;
  }
  return { id: `pr-${i}${s.template_id != null ? `-t${s.template_id}` : ""}`, lang: "en", text: s.full_text, truth };
// A case annotated ONLY out of scope is KEPT: excluding dates from the SCORE is not a
// reason to remove text from the corpus. It scores no recall and still offers every engine
// the same chance to produce a false positive on it.
}).filter((c) => c.truth.length > 0);

writeFileSync(join(HERE, "presidio-research.benchcase.json"), JSON.stringify(cases, null, 1) + "\n");
console.log(
  `${cases.length} cas · ${scored} vérités notées · ${unscored} annotées non notées ` +
    `(${[...UNSCORED].join("/")} → CONTEXT : hors périmètre pour le rappel, comptées pour la précision)`,
);
