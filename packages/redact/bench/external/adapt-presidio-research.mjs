#!/usr/bin/env node
/**
 * Adapter: presidio-research's `synth_dataset_v2.json` (InputSample format) to the home
 * bench's BenchCase format — to replay OUR metric on THEIR data.
 *
 * The taxonomy mapping is where comparisons die: here it is, whole and owned. Three types
 * are EXCLUDED because they fall outside the engine's product scope (it redacts neither
 * titles, nor age, nor nationality/religion): TITLE, AGE, NRP. The historical presidio
 * REPORT made the same exclusion the other way round (the « sans DATE_TIME/NRP » line).
 * Everything else is kept.
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
  DATE_TIME: "DATE",
};
const EXCLUDED = new Set(["TITLE", "AGE", "NRP"]);

const src = JSON.parse(readFileSync(join(HERE, "data", "synth_dataset_v2.json"), "utf8"));
let kept = 0, dropped = 0;
const cases = src.map((s, i) => {
  const truth = [];
  for (const sp of s.spans ?? []) {
    if (EXCLUDED.has(sp.entity_type)) { dropped++; continue; }
    const cat = MAP[sp.entity_type];
    if (!cat) throw new Error(`type non mappé : ${sp.entity_type}`);
    truth.push([sp.entity_value, cat]);
    kept++;
  }
  return { id: `pr-${i}${s.template_id != null ? `-t${s.template_id}` : ""}`, lang: "en", text: s.full_text, truth };
}).filter((c) => c.truth.length > 0);

writeFileSync(join(HERE, "presidio-research.benchcase.json"), JSON.stringify(cases, null, 1) + "\n");
console.log(`${cases.length} cas · ${kept} vérités conservées · ${dropped} exclues (TITLE/AGE/NRP, hors périmètre)`);
