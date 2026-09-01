import { describe, it, expect } from "vitest";
import { scoreDomain, vaultedDespiteVocabulary } from "../bench/domainBench";
import type { BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/sante.json";

/* Recall + PRECISION bench for MEDICAL documents — compte rendu de consultation,
   ordonnance de biologie, discharge summary (EN), Arztbrief (DE), informe médico (ES),
   referto / relatório (IT+PT).

   This is the document a user hesitates most to hand to a model, and it's
   the one where over-redacting costs the most: « cardiologue », « échographie »,
   « glycémie » redacted, all that's left is a letter about an anonymous patient with a
   nameless disease, examined by a made-up company — and the patient's identity,
   meanwhile, was already protected by its own rule.

   ⚠️ Sparing the word exposes NO health data: « glycémie » is the name of a
   measurement, the value next to it is a number caught by its own rule. The same sharing as
   « IBAN » in clear with the number in the vault. */

const cases = corpus as BenchCase[];

/** The medical vocabulary, in the corpus's six languages, that must NEVER enter
 *  the vault — even when proposed by a detector that over-tags the page. */
const MUST_STAY_CLEAR = [
  "cardiologue", "généraliste", "médecin traitant", "chirurgien", "pharmacien",
  "échographie", "électrocardiogramme", "doppler", "radiographie", "biopsie",
  "hémoglobine", "glycémie", "cholestérol", "créatinine", "plaquettes",
  "tension artérielle", "saturation", "posologie", "effet indésirable",
  "antécédents", "consultation", "hospitalisation", "urgences", "prélèvement",
  "dossier médical", "secret médical", "personne de confiance", "carte vitale",
  "téléconsultation", "permanence des soins", "maison de santé", "tiers payant",
  "discharge summary", "informed consent", "outpatient", "inpatient", "referral",
  "physiotherapist", "anaesthesia", "blood count", "haemoglobin", "prescription",
  "arztbrief", "befund", "blutbild", "blutdruck", "überweisung", "krankschreibung",
  "schweigepflicht", "nebenwirkungen", "vorsorge", "nachsorge",
  "informe médico", "historia clínica", "alta médica", "urgencias", "analítica",
  "fisioterapeuta", "quirófano", "receta", "efectos secundarios",
  "referto", "cartella clinica", "ecografia", "posologia", "anamnesi",
  "prontuário", "relatório médico", "pressão arterial", "dosagem",
];

describe("medical-document recall + precision (deterministic pipeline, 6 languages)", () => {
  it("holds the recall floor on the santé corpus", async () => {
    const s = await scoreDomain("santé", cases);
    // The floor: these documents carry surnames, dates of birth,
    // addresses, phone numbers and emails in the middle of medical noise — the noise
    // must not drown them out.
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.8);
  });

  it("ne redacted PAS le vocabulaire médical, même quand un détecteur le PROPOSE", async () => {
    const caught = await vaultedDespiteVocabulary(cases, MUST_STAY_CLEAR);
    expect(caught, `vocabulaire médical redacted : ${caught.join(", ")}`).toEqual([]);
  });

  it("garde un taux de faux positifs BAS — le over-redaction est mesuré, pas supposé", async () => {
    const s = await scoreDomain("santé", cases);
    // Counterpart of the floor: without a ceiling, redacting everything would pass the test above.
    expect(s.fp / s.total).toBeLessThanOrEqual(0.6);
  });
});
