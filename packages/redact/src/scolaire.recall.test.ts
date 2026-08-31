import { describe, it, expect } from "vitest";
import { scoreDomain, vaultedDespiteVocabulary } from "../bench/domainBench";
import type { BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/scolaire.json";

/* Recall + PRECISION bench for SCHOOL / ACADEMIC / CAREER documents — bulletin
   trimestriel, relevé de notes universitaire, CV + lettre de motivation, transcript et
   lettre de recommandation (EN), Zeugnis + expediente (DE+ES), pagella + histórico
   escolar (IT+PT).

   La famille la MOINS couverte avant ce volume (2/11 mesuré). Un bulletin ou un CV est
   fait presque entièrement de ce vocabulaire : « baccalauréat », « relevé de notes »,
   « moyenne générale », « alternance ». Redacted, il ne reste plus rien d'exploitable —
   c'est le type de document où le contenu utile EST le vocabulaire.

   Le corpus mêle aussi le vocabulaire de gestion (le CV d'une contrôleuse de gestion) :
   il exerce donc deux volumes à la fois, comme un vrai document le fait. */

const cases = corpus as BenchCase[];

const MUST_STAY_CLEAR = [
  "bulletin scolaire", "relevé de notes", "moyenne générale", "conseil de classe",
  "appréciation", "assiduité", "baccalauréat", "licence", "doctorat", "mention bien",
  "travaux pratiques", "devoir surveillé", "épreuve", "rattrapage", "redoublement",
  "conseiller d'orientation", "professeur principal", "élève", "étudiant",
  "année scolaire", "année universitaire", "unité d'enseignement", "soutenance",
  "stage de fin d'études", "alternance", "bourse", "scolarité", "inscription",
  "logement étudiant", "attestation de réussite", "spécialités", "matière",
  // gestion, présent dans le CV — deux volumes exercés par le même document
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
    // Un bulletin nomme un enfant, son responsable légal, leur adresse et leur
    // téléphone : le plancher porte sur les personnes les plus exposées du produit.
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
