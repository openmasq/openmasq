import { describe, it, expect } from "vitest";
import { pseudonymize, isNotoriousEntity, type Vault } from "../index";
import { ibanValid } from "../engine/validators/validators";

/* Regression on a supplier's INVOICE FOOTER (02/08 log — OVH invoice):
   four distinct over-redactions, each with its own mechanism.
   1. "HSBC FRANCE" read as a NAME → word-for-word alias FRANCE→<fake>, reapplied to
      EVERY "FRANCE" in the text — the invariant "countries are never masked"
      broken by an alias. 2. "ovh" aliased via the path segment `factures/ovh`.
   3. "Facture n°X du 13 Mars 2023" swallowed by the IBAN rule (mod-97 passed by
      chance, 1/97) → fake "98 Mars 4986", the model "discovers" a nonexistent
      inconsistency. 4. "RCS LILLE" (registry citation) vaulted as an organisation. */

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
    expect(isNotoriousEntity("HSBC FRANCE", "name", { commercial: true })).toBe(true); // NER tags it PER
    // An unknown company + country stays redacted — the country tail isn't a blank check.
    expect(isNotoriousEntity("Zorglub France", "company", { commercial: true })).toBe(false);
  });

  it("un alias de mot ne touche JAMAIS un pays, même pour une société inconnue", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize("Banque Zorglub FRANCE — et la FRANCE entière le sait.", {
      vault,
      forced: [{ value: "Banque Zorglub FRANCE", category: "NAME" }],
      ...NOTORIETY,
    });
    expect(text).not.toContain("Zorglub"); // the entity itself IS redacted
    expect(text).toContain("la FRANCE entière"); // the country outside the entity stays in clear
    expect(Object.values(vault)).not.toContain("FRANCE"); // no FRANCE→<fake> alias
  });

  it("un segment de chemin qui est une MARQUE notoire reste verbatim (pas de cascade « ovh »)", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(
      "/Users/juliensabourdin/Desktop/KARLSTUDIO/legal/factures/ovh/Facture_FR40182376.pdf",
      { vault, ...NOTORIETY },
    );
    expect(text).toContain("/ovh/"); // the brand segment, intact within the FAKE path
    expect(text).not.toContain("juliensabourdin");
    expect(Object.values(vault)).not.toContain("ovh"); // no ovh→<fake> alias
  });

  it("« Facture n°REF du 13 Mars 2023 » : la date reste intacte, la réf seule est redacted", async () => {
    const { text } = await pseudonymize("Facture n°FR40182376 du 13 Mars 2023", { vault: {}, ...NOTORIETY });
    expect(text).toContain("du 13 Mars 2023");
    expect(text).not.toContain("FR40182376");
  });

  it("ibanValid : un token purement alphabétique en minuscules est de la prose, un vrai IBAN passe", () => {
    expect(ibanValid("FR40182376 du 13 Mars 2023")).toBe(false); // lucky mod-97 ≠ IBAN
    expect(ibanValid("FR76 3005 6005 0305 0300 0004 147")).toBe(true);
    expect(ibanValid("GB29 NWBK 6016 1331 9268 19")).toBe(true); // uppercase LETTER group = real BBAN
  });
});
