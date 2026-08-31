#!/usr/bin/env node
/**
 * Adaptateur : `synth_dataset_v2.json` de presidio-research (format InputSample) vers le
 * format BenchCase du banc maison — pour rejouer NOTRE métrique sur LEURS données.
 *
 * Le mapping de taxonomies est l'endroit où les comparaisons meurent : le voici, entier
 * et assumé. Trois types sont EXCLUS parce qu'ils sont hors du périmètre produit du
 * moteur (il ne redacted ni les civilités, ni l'âge, ni la nationalité/religion) :
 * TITLE, AGE, NRP. Le RAPPORT-presidio historique faisait la même exclusion en sens
 * inverse (ligne « sans DATE_TIME/NRP »). Tout le reste est conservé.
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
