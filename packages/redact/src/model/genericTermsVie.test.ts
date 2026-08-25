import { describe, expect, it } from "vitest";
import { isGenericTerm, isGenericCompound, isStopword } from "./genericTerms";
import { isNotoriousEntity } from "./notorious";

/**
 * The everyday-institution volume (`vocab/vie.ts`) — audit-driven: 123/193 of
 * the most common payslip/lease/health/school/registry/invoice/administration words were
 * uncovered, and each one was faked into an invented name/company (the document read as
 * being about nobody). This pins the coverage AND the discipline that bounds it.
 */
const covered = (v: string): boolean => isGenericTerm(v) || isStopword(v) || isGenericCompound(v);

describe("vocabulaire institutionnel du quotidien (audit)", () => {
  it("couvre les mots les plus fréquents de chaque domaine, toutes langues", () => {
    const words = [
      // paie — FR/EN/DE/ES/IT/PT
      "salarié", "convention collective", "net à payer", "congés payés", "RTT",
      "payslip", "Lohnabrechnung", "nómina", "busta paga", "folha de pagamento",
      // bail
      "bailleur", "dépôt de garantie", "état des lieux", "taxe foncière",
      "landlord", "Nebenkosten", "arrendatario", "canone", "caução",
      // santé
      "médecin traitant", "carte vitale", "feuille de soins", "tiers payant",
      "practitioner", "Krankenkasse", "receta", "ricovero", "baixa médica",
      // école
      "élève", "rectorat", "scolarité", "CROUS",
      "scholarship", "Zeugnis", "matrícula", "pagella", "bolsa de estudos",
      // greffe / société
      "greffe", "comptes annuels", "liasse fiscale", "commissaire aux comptes",
      "INPI", "BODACC", "Handelsregister", "registro mercantil", "commercialista",
      // facture
      "titulaire", "donneur d'ordre", "total TTC", "conditions de règlement",
      "account holder", "Kontoauszug", "domiciliación", "estratto conto",
      // administration
      "préfecture", "pièce justificative", "accusé de réception", "requérant",
      "certified copy", "Bürgeramt", "ayuntamiento", "autocertificazione", "câmara municipal",
    ];
    const missing = words.filter((w) => !covered(w));
    expect(missing).toEqual([]);
  });

  it("les enveloppes d'épargne sont des TYPES — jamais redacted (le bug « PEA »)", () => {
    // « Trace un graphique des 5 ETF éligibles au PEA » : le NER taguait PEA/ETF ORG et
    // les fakait en sigles inventés — le modèle traçait un graphique de rien. Le schéma
    // est générique ; le NUMÉRO de compte, lui, reste couvert par ses propres règles.
    for (const v of ["PEA", "PEL", "LDDS", "ETF", "SICAV", "SCPI", "assurance-vie", "compte-titres"]) {
      expect(covered(v), v).toBe(true);
    }
  });

  it("les composés tombent par leurs mots — sans être listés eux-mêmes", () => {
    // The compound path (`isGenericCompound`): function words + covered nouns. This is
    // what makes the phrases fall out without a per-phrase entry to maintain.
    for (const v of [
      "tribunal de commerce",
      "greffe du tribunal de commerce",
      "dépôt des comptes annuels",
      "attestation de scolarité",
    ]) {
      expect(isGenericCompound(v), v).toBe(true);
    }
  });

  it("la discipline patronymique tient — les mots à double vie ne sont PAS couverts", () => {
    // An entry here ships the word in clear FOREVER, so a plausible surname must stay
    // out — the same rule that keeps "berger"/"meunier"/"marchand" out of the admin
    // volume. If one of these starts passing, someone widened the allow-list wrongly.
    for (const v of ["garant", "Garant", "berger", "meunier", "marchand", "prevost"]) {
      expect(isGenericTerm(v), v).toBe(false);
    }
  });

  it("les portails du registre sont épargnés comme ORG notoire — pas comme mot générique", () => {
    // "Infogreffe" is a proper NAME (a specific operator), so it lives in `notorious.ts`
    // category-scoped: spared as a COMPANY, still redactable as a person's name.
    expect(isNotoriousEntity("Infogreffe", "company")).toBe(true);
    expect(isNotoriousEntity("Infogreffe", "name")).toBe(false);
    expect(isGenericTerm("Infogreffe")).toBe(false);
  });
});
