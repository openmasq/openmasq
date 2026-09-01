import { describe, it, expect } from "vitest";
import { scoreDomain, vaultedDespiteVocabulary } from "../bench/domainBench";
import type { BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/scolaire.json";

/* Recall + PRECISION bench for SCHOOL / ACADEMIC / CAREER documents — bulletin
   trimestriel, relevé de notes universitaire, CV + lettre de motivation, transcript and
   lettre de recommandation (EN), Zeugnis + expediente (DE+ES), pagella + histórico
   escolar (IT+PT).

   The family LEAST covered before this volume (2/11 measured). A report card or résumé is
   made almost entirely of this vocabulary: « baccalauréat », « relevé de notes »,
   « moyenne générale », « alternance ». Redacted, nothing usable is left —
   this is the type of document where the useful content IS the vocabulary.

   The corpus also mixes in management vocabulary (a financial controller's résumé):
   it therefore exercises two volumes at once, as a real document does. */

const cases = corpus as BenchCase[];

const MUST_STAY_CLEAR = [
  "bulletin scolaire", "relevé de notes", "moyenne générale", "conseil de classe",
  "appréciation", "assiduité", "baccalauréat", "licence", "doctorat", "mention bien",
  "travaux pratiques", "devoir surveillé", "épreuve", "rattrapage", "redoublement",
  "conseiller d'orientation", "professeur principal", "élève", "étudiant",
  "année scolaire", "année universitaire", "unité d'enseignement", "soutenance",
  "stage de fin d'études", "alternance", "bourse", "scolarité", "inscription",
  "logement étudiant", "attestation de réussite", "spécialités", "matière",
  // management, present in the CV — two volumes exercised by the same document
  "contrôle de gestion", "budget prévisionnel", "plan de trésorerie",
  "écarts budgétaires", "tableau de bord", "comptabilité analytique",
  "grand livre", "rapprochement bancaire", "coût de revient", "liasse fiscale",
  "écritures comptables", "expert-comptable", "commissaire aux comptes",
  "compte de résultat", "consolidation", "business plan", "reporting",
  "transcript", "coursework", "dissertation", "peer review", "scholarship",
  "tuition fees", "honours", "internship", "research group", "admission",
  "zeugnis", "notendurchschnitt", "klausur", "leistungsnachweis", "praktikum",
  "versetzung", "unterricht",
  "expediente académico", "matrícula", "convocatoria", "sobresaliente", "notable",
  "prácticas externas", "beca",
  "pagella", "tirocinio", "borsa di studio", "scrutinio",
  "histórico escolar", "licenciatura", "estágio", "bolsa de estudo",
];

describe("school & career recall + precision (deterministic pipeline, 6 languages)", () => {
  it("holds the recall floor on the scolaire corpus", async () => {
    const s = await scoreDomain("scolaire", cases);
    // A report card names a child, their legal guardian, their address and
    // phone number: the floor covers the most exposed people in the product.
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.8);
  });

  it("ne redacted PAS le vocabulaire scolaire et de gestion, même PROPOSÉ", async () => {
    const caught = await vaultedDespiteVocabulary(cases, MUST_STAY_CLEAR);
    expect(caught, `vocabulaire scolaire redacted : ${caught.join(", ")}`).toEqual([]);
  });

  it("garde un taux de faux positifs BAS — le over-redaction est mesuré, pas supposé", async () => {
    const s = await scoreDomain("scolaire", cases);
    expect(s.fp / s.total).toBeLessThanOrEqual(0.6);
  });
});
