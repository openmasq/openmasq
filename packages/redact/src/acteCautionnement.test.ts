import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pseudonymize } from "./index";

/* Regression suite for the CAUTION ACT (acte de cautionnement immobilier, the
   CAMCA/Crédit-Agricole shape): a dense contract whose header, per-page footers and
   RGPD boilerplate shipped several identifiers in CLEAR while the legal prose around
   them was over-redacted. The fixture reproduces the exact traps observed:
   - "Référence du financement : KX8214" + the per-page "Référence Financement : KX8214"
     footers — a labeled bank-file reference, repeated on EVERY page;
   - "N° de contrat CAMCA : C2031469472000817KX9325107" — the financing reference is
     EMBEDDED inside the contract number, so leaking either leaks both;
   - the Luxembourg footer block: "N° Id TVA : LU19462833 - RCS Luxembourg B 61 227 -
     N°IDU : FR194628_03UKDQ" — three registry ids on one dash-joined line;
   - "immatriculée au Registre des Intermédiaires en Assurance sous le numéro
     07 042 385" — the ORIAS number gated by PROSE, not by a `label :`;
   - "Agence de : NARBONNE" — the bank branch locating the borrower;
   - "par mail : à l'adresse suivante : dpo-…" — a DOUBLE-labeled email line;
   - legal role nouns ("l'Assuré", "l'Assureur", "l'Emprunteur"), famous institutions
     ("CNIL", "Union Européenne", "Crédit Agricole") and Code-civil article numbers
     that a broken-context detector once faked into gibberish. */

const text = readFileSync(
  fileURLToPath(new URL("./__fixtures__/acte-cautionnement.txt", import.meta.url)),
  "utf8",
);

describe("acte de cautionnement — nothing identifying survives", () => {
  it("redacted every identifier the contract used to leak", async () => {
    const out = await pseudonymize(text, { vault: {} });
    const mustNotSurvive = [
      "MARC BOURDELIN", // the borrower (honorific-introduced, uppercase)
      "KX8214", // the financing reference — header AND both page footers
      "C1020258361000235", // the contract number (embeds the reference)
      "dpo-camca@ca-lorraine.example", // the DPO email (double-labeled line)
      "+352 22 99 11", // the Luxembourg phone
      "12 rue des Tanneurs", // the financed property's address…
      "82000 MONTAUBAN", // …and its city
      "56 avenue André Malraux", // the lender's address
      "57000 Metz",
      "31 boulevard du Prince Henri", // the caution company's LU address
      "NARBONNE", // the branch ("Agence de :")
      "LU19462833", // LU VAT
      "B 61 227", // RCS Luxembourg
      "07 042 385", // ORIAS (gated by the register prose)
      "FR194628_01ZVJG", // IDU (identifiant unique)
      "FR194628_03UKDQ",
    ];
    for (const v of mustNotSurvive) expect(out.text).not.toContain(v);
  });

  it("every vault original is fully substituted", async () => {
    const vault: Record<string, string> = {};
    const out = await pseudonymize(text, { vault });
    for (const original of Object.values(vault)) {
      // A vault entry whose value still occurs verbatim is a MINTED-BUT-UNAPPLIED
      // fake: recorded, yet leaked (the releveRepartition failure mode).
      expect(out.text).not.toContain(original);
    }
  });

  it("leaves the LEGAL prose alone — role nouns, institutions, articles, amounts", async () => {
    const out = await pseudonymize(text, { vault: {} });
    for (const v of [
      "l'Assuré", // role nouns are NOT names ("Ostrel"/"Calderis" was the observed FP)
      "l'Assureur",
      "l'Emprunteur",
      "Union Européenne", // famous institutions stay ("Cergy Européenne" was the FP)
      "CNIL",
      "Crédit Agricole",
      "articles 2288", // Code-civil references are structure, not PII
      "article 2310",
      "L 113-8",
      "Code civil",
      "181 947,00", // amounts and durations survive (numbers off by default)
      "163 947,00",
      "2 547,26",
      "240",
      "Version électronique",
      "CONDITIONS PARTICULIERES DE L'ACTE DE CAUTIONNEMENT",
    ]) {
      expect(out.text).toContain(v);
    }
  });
});
