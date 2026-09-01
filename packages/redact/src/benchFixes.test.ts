import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { pseudonymize } from "./index";
import { isGenericTerm } from "./model/genericTerms";
import { createNerPredict } from "./local/ner";
import { detectLocalNer } from "./local/detect";

/* What the manual bench from 27/07/2026 actually found, once replayed against the
   SEND path rather than the composer's preview. Each case below was measured
   before the fix. */

const MODEL_DIR = resolve(process.cwd(), "apps/desktop/build/ner-models");
const withNer = existsSync(MODEL_DIR) ? it : it.skip;

describe("champ de compte en PROSE — « mon pseudo est … »", () => {
  it("attrape la forme sans deux-points, que le détecteur étiqueté exigeait", async () => {
    for (const [p, attendu] of [
      ["Mon pseudo est ajoligy92.", "ajoligy92"],
      ["Mon login est ajoligy92.", "ajoligy92"],
      ["My username is jdoe.", "jdoe"],
      ["Notre identifiant est AC-4471.", "AC-4471"],
    ] as const) {
      const vault: Record<string, string> = {};
      await pseudonymize(p, { vault });
      expect(Object.values(vault), p).toContain(attendu);
    }
  });

  it("⚠️ exige le POSSESSIF — c'est lui qui rend la règle sûre", async () => {
    // Without this guard, « Le login est obligatoire » would redact « obligatoire ».
    for (const p of ["Le login est obligatoire.", "Le pseudo est libre."]) {
      const vault: Record<string, string> = {};
      await pseudonymize(p, { vault });
      expect(Object.values(vault), p).toEqual([]);
    }
  });
});

describe("faux positifs mesurés — le mot ordinaire partait en prénom", () => {
  it("couvre les étiquettes de compte et les verbes de mise en relation", () => {
    // « Mon login est ajoligy92 » redacted « login » and left ajoligy92 in clear; « Appelle le
    // 06 … » replaced « Appelle » with a first name and the model received an absurd sentence.
    for (const w of ["login", "pseudo", "identifiant", "username", "matricule",
      "appelle", "rappelle", "joignable", "contacte", "envoie"])
      expect(isGenericTerm(w), w).toBe(true);
  });

  withNer("ne redacted plus le verbe qui ouvre la phrase", async () => {
    const predict = await createNerPredict({
      modelName: "openmasq/bert-base-multilingual-cased-ner-hrl",
      dtype: "q8",
      cacheDir: MODEL_DIR,
      allowLocalModels: true,
    });
    const detectLocal = (t: string) => detectLocalNer(t, predict, { chunkSize: 1000, chunkOverlap: 100 });
    for (const p of ["Appelle le 06 12 34 56 78.", "Joignable au 06-12-34-56-78"]) {
      const vault: Record<string, string> = {};
      await pseudonymize(p, { vault, detectLocal });
      const mots = Object.values(vault).filter((v) => /^[A-Za-zÀ-ÿ]+$/.test(v));
      expect(mots, p).toEqual([]);
      // …and the number, itself, is still protected.
      expect(Object.values(vault).some((v) => /\d/.test(v)), p).toBe(true);
    }
  }, 900000);
});

describe("notoriété RATTACHÉE à la personne", () => {
  withNer("« je travaille chez X » l'emporte sur la célébrité de X", async () => {
    const predict = await createNerPredict({
      modelName: "openmasq/bert-base-multilingual-cased-ner-hrl",
      dtype: "q8",
      cacheDir: MODEL_DIR,
      allowLocalModels: true,
    });
    const detectLocal = (t: string) => detectLocalNer(t, predict, { chunkSize: 1000, chunkOverlap: 100 });
    const vaultOf = async (p: string) => {
      const vault: Record<string, string> = {};
      await pseudonymize(p, { vault, detectLocal });
      return Object.values(vault);
    };
    // Notoriety says the entity is public; it does not say the RELATION is.
    expect(await vaultOf("Je travaille chez Google.")).toContain("Google");
    expect(await vaultOf("Notre client BNP Paribas a signé.")).toContain("BNP Paribas");
    expect(await vaultOf("I work at Airbus.")).toContain("Airbus");
    // …and a THIRD PARTY, or a general-knowledge question, stay intact: that's what
    // removing the filter entirely destroyed (measured: 10 named regressions).
    // A third-party BRAND is now redacted too (decision of 27/07/2026):
    // only public bodies, indices and general knowledge remain in clear.
    expect(await vaultOf("Renault a présenté sa nouvelle voiture.")).toContain("Renault");
    expect(await vaultOf("Le courrier vient de Pôle emploi.")).toEqual([]);
    expect(await vaultOf("Quelles sont les plus grandes villes de France ?")).toEqual([]);
    expect(await vaultOf("Qui est Albert Einstein ?")).toEqual([]);
  }, 900000);
});
