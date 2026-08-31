import { describe, it, expect } from "vitest";
import { pseudonymize } from "../../index";

/* Measured on a corpus of real scanned documents: when OCR glues words together, the NER
   reads the resulting blocks as entities. Seven of the sixteen false positives found had
   this single shape. */
describe("prose agglutinée par l'OCR", () => {
  const values = async (t: string) => (await pseudonymize(t, { vault: {} })).matches.map((m) => m.value);

  it("ne redacted pas une date collée à ses mots", async () => {
    const v = await values("signé le20juin2024 puis du20juin2024a la remise des clés");
    expect(v.some((x) => /20juin2024/.test(x))).toBe(false);
  });

  it("laisse en place ce qu'on ne sait pas distinguer d'un secret", async () => {
    // « ferontavantle5… » is glued prose, but nothing in its SHAPE separates it
    // from a key: we prefer a false positive to a secret leak. Deliberate case, pinned.
    const v = await values("Les payements se ferontavantle5dumoisparvirement ce mois-ci.");
    expect(v).toContain("ferontavantle5dumoisparvirement");
  });

  it("ne touche PAS un secret, qui a légitimement cette forme", async () => {
    // This is exactly the point of category-scoping: sk-live… is not prose.
    const v = await values("AWS_SECRET_KEY=wja29fhq0284hfqp2");
    expect(v.join(" | ")).toContain("wja29fhq0284hfqp2");
  });

  /* ⚠️ FAIL-OPEN REGRESSION (bench, 3 values out of 2,333). The prefix is tested case-
     insensitively: any ALL-CAPS code starting with a function word fell into the guard — and
     a candidate dropped here is neither redacted, nor counted in `matches`, nor signalled by
     `modelError`. The engine DETECTED the value and sent it in clear silently, which
     `redact()` (marker mode) exposed: it DID redact it.
     A value with no lowercase letter at all is not glued prose. */
  it.each([
    ["BIC UNCRITMMXXX", "UNCRITMMXXX"], // « UN » + CRITMMXXX
    ["BIC CEPAFRPP751", "CEPAFRPP751"], // « CE » + PAFRPP751
    ["USt-IdNr. DE812345678", "DE812345678"], // « DE » + 812345678
  ])("redacted %s — une valeur tout en capitales n'est pas de la prose collée", async (text, value) => {
    expect(await values(text)).toContain(value);
  });
});
