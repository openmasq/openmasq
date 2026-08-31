import { describe, it, expect } from "vitest";
import { scoreDomain, vaultedDespiteVocabulary } from "../bench/domainBench";
import type { BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/sante.json";

/* Recall + PRECISION bench for MEDICAL documents — compte rendu de consultation,
   ordonnance de biologie, discharge summary (EN), Arztbrief (DE), informe médico (ES),
   referto / relatório (IT+PT).

   C'est le document qu'un utilisateur hésite le plus à confier à un modèle, et c'est
   celui où le over-redaction coûte le plus cher : « cardiologue », « échographie »,
   « glycémie » redacted, il reste une lettre sur un patient anonyme atteint d'une
   maladie sans nom, examiné par une entreprise inventée — et l'identité du patient,
   elle, était déjà protégée par sa propre règle.

   ⚠️ Épargner le mot n'expose AUCUNE donnée de santé : « glycémie » est le nom d'une
   mesure, la valeur à côté est un nombre pris par sa propre règle. Même partage que
   « IBAN » en clair avec le numéro au coffre. */

const cases = corpus as BenchCase[];

/** Le vocabulaire médical, dans les six langues du corpus, qui ne doit JAMAIS entrer
 *  au coffre — même proposé par un détecteur qui sur-étiquette la page. */
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
    // Le plancher : ces documents portent des patronymes, des dates de naissance, des
    // adresses, des téléphones et des e-mails au milieu du bruit médical — le bruit ne
    // doit pas les noyer.
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.8);
  });

  it("ne redacted PAS le vocabulaire médical, même quand un détecteur le PROPOSE", async () => {
    const caught = await vaultedDespiteVocabulary(cases, MUST_STAY_CLEAR);
    expect(caught, `vocabulaire médical redacted : ${caught.join(", ")}`).toEqual([]);
  });

  it("garde un taux de faux positifs BAS — le over-redaction est mesuré, pas supposé", async () => {
    const s = await scoreDomain("santé", cases);
    // Contrepartie du plancher : sans plafond, tout redact passerait le test ci-dessus.
    expect(s.fp / s.total).toBeLessThanOrEqual(0.6);
  });
});
