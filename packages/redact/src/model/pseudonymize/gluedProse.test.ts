import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";

/* Mesuré sur un corpus de documents scannés réels : quand l'OCR colle les mots, le NER
   lit les blocs obtenus comme des entités. Sept des seize faux positifs relevés avaient
   cette seule forme. */
describe("prose agglutinée par l'OCR", () => {
  const values = async (t: string) => (await pseudonymize(t, { vault: {} })).matches.map((m) => m.value);

  it("ne redacted pas une date collée à ses mots", async () => {
    const v = await values("signé le20juin2024 puis du20juin2024a la remise des clés");
    expect(v.some((x) => /20juin2024/.test(x))).toBe(false);
  });

  it("laisse en place ce qu'on ne sait pas distinguer d'un secret", async () => {
    // « ferontavantle5… » est de la prose collée, mais rien dans sa FORME ne le sépare
    // d'une clé : on préfère un faux positif à la fuite d'un secret. Cas assumé, pinné.
    const v = await values("Les payements se ferontavantle5dumoisparvirement ce mois-ci.");
    expect(v).toContain("ferontavantle5dumoisparvirement");
  });

  it("ne touche PAS un secret, qui a légitimement cette forme", async () => {
    // C'est tout l'objet du cadrage par catégorie : sk-live… n'est pas de la prose.
    const v = await values("AWS_SECRET_KEY=wja29fhq0284hfqp2");
    expect(v.join(" | ")).toContain("wja29fhq0284hfqp2");
  });

  /* ⚠️ RÉGRESSION FAIL-OPEN (banc, 3 valeurs sur 2 333). Le préfixe est testé sans égard à
     la casse : tout code en CAPITALES ouvrant par un mot-outil tombait dans la garde — et
     un candidat écarté ici n'est ni redacted, ni compté dans `matches`, ni signalé par
     `modelError`. Le moteur DÉTECTAIT la donnée et l'envoyait en clair en silence, ce que
     `redact()` (mode marqueur) faisait apparaître : il la redact, lui.
     Une valeur sans aucune minuscule n'est pas de la prose agglutinée. */
  it.each([
    ["BIC UNCRITMMXXX", "UNCRITMMXXX"], // « UN » + CRITMMXXX
    ["BIC CEPAFRPP751", "CEPAFRPP751"], // « CE » + PAFRPP751
    ["USt-IdNr. DE812345678", "DE812345678"], // « DE » + 812345678
  ])("redacted %s — une valeur tout en capitales n'est pas de la prose collée", async (text, value) => {
    expect(await values(text)).toContain(value);
  });
});
