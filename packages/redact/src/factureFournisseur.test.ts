import { describe, it, expect } from "vitest";
import { pseudonymize, isNotoriousEntity, type Vault } from "./index";
import { ibanValid } from "./engine/validators/validators";

/* Régression sur le PIED DE FACTURE d'un fournisseur (journal 02/08 — facture OVH) :
   quatre over-redactions distincts, chacun avec sa mécanique propre.
   1. « HSBC FRANCE » lu comme un NOM → alias mot-à-mot FRANCE→<faux>, réappliqué à
      CHAQUE « FRANCE » du texte — l'invariant « les pays ne sont jamais masqués »
      cassé par un alias. 2. « ovh » aliasé via le segment de chemin `factures/ovh`.
   3. « Facture n°X du 13 Mars 2023 » avalé par la règle IBAN (mod-97 passé par
      hasard, 1/97) → faux « 98 Mars 4986 », le modèle « découvre » une incohérence
      inexistante. 4. « RCS LILLE » (citation de registre) vaulté comme organisation. */

const NOTORIETY = { commercialNotoriety: true, peopleNotoriety: true };

describe("pied de facture fournisseur — marques, pays et dates restent intacts", () => {
  it("FRANCE, HSBC FRANCE, ovh et RCS LILLE restent en clair ; IBAN/BIC/SIREN masqués", async () => {
    const footer = [
      "taux d’intérêt légal en vigueur en FRANCE, montant minimum de 40 euros.",
      "Nos coordonnées bancaires",
      "HSBC FRANCE",
      "BIC : CCFRFRPP",
      "IBAN : FR76 3005 6005 0305 0300 0004 147",
      "ovh - 2 rue kellermann BP 80157 59053 ROUBAIX CEDEX 1 - FRANCE",
      "SAS - RCS LILLE METROPOLE 424 761 419 00045",
    ].join("\n");
    const { text } = await pseudonymize(footer, { vault: {}, ...NOTORIETY });
    for (const clear of ["en vigueur en FRANCE", "HSBC FRANCE", "ovh -", "RCS LILLE METROPOLE", "- FRANCE"]) {
      expect(text).toContain(clear);
    }
    for (const masked of ["FR76 3005 6005 0305 0300 0004 147", "CCFRFRPP", "424 761 419 00045", "2 rue kellermann"]) {
      expect(text).not.toContain(masked);
    }
  });

  it("la filiale nationale est notoire : « <marque> + PAYS » réessaie sans le pays", () => {
    expect(isNotoriousEntity("HSBC FRANCE", "company", { commercial: true })).toBe(true);
    expect(isNotoriousEntity("Google France", "company", { commercial: true })).toBe(true);
    expect(isNotoriousEntity("HSBC FRANCE", "name", { commercial: true })).toBe(true); // NER le tague PER
    // Une société inconnue + pays reste redacted — la queue-pays n'est pas un blanc-seing.
    expect(isNotoriousEntity("Zorglub France", "company", { commercial: true })).toBe(false);
  });

  it("un alias de mot ne touche JAMAIS un pays, même pour une société inconnue", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Banque Zorglub FRANCE — et la FRANCE entière le sait.", {
      vault,
      forced: [{ value: "Banque Zorglub FRANCE", category: "NAME" }],
      ...NOTORIETY,
    });
    expect(text).not.toContain("Zorglub"); // l'entité, elle, est bien redacted
    expect(text).toContain("la FRANCE entière"); // le pays hors entité reste en clair
    expect(Object.values(vault)).not.toContain("FRANCE"); // aucun alias FRANCE→<faux>
  });

  it("un segment de chemin qui est une MARQUE notoire reste verbatim (pas de cascade « ovh »)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(
      "/Users/juliensabourdin/Desktop/KARLSTUDIO/legal/factures/ovh/Facture_FR40182376.pdf",
      { vault, ...NOTORIETY },
    );
    expect(text).toContain("/ovh/"); // le segment marque, intact dans le chemin FAKE
    expect(text).not.toContain("juliensabourdin");
    expect(Object.values(vault)).not.toContain("ovh"); // aucun alias ovh→<faux>
  });

  it("« Facture n°REF du 13 Mars 2023 » : la date reste intacte, la réf seule est redacted", async () => {
    const { text } = await pseudonymize("Facture n°FR40182376 du 13 Mars 2023", { vault: {}, ...NOTORIETY });
    expect(text).toContain("du 13 Mars 2023");
    expect(text).not.toContain("FR40182376");
  });

  it("ibanValid : un token purement alphabétique en minuscules est de la prose, un vrai IBAN passe", () => {
    expect(ibanValid("FR40182376 du 13 Mars 2023")).toBe(false); // mod-97 heureux ≠ IBAN
    expect(ibanValid("FR76 3005 6005 0305 0300 0004 147")).toBe(true);
    expect(ibanValid("GB29 NWBK 6016 1331 9268 19")).toBe(true); // groupe LETTRES majuscules = BBAN réel
  });
});
