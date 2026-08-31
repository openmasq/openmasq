import { describe, expect, it } from "vitest";
import { pseudonymize, unredact } from "./index";
import type { Detection, Vault } from "./types";

/**
 * The Sacem royalty statement — the regression for the two reported false positives:
 *  - "Etranger" (a distribution-FAMILY label, alone in its column) tagged ORG
 *    by the NER and faked into an invented company ("Ashborne");
 *  - "SACEM" (the statement's ISSUER, never the reader's identity) faked into "KELBY",
 *    sending the user off to browse a nonexistent company's site.
 * The NER is SIMULATED via `detectLocal` — that's the choke-point contract: every
 * source passes through the same filter, so pinning the drop here covers the real NER.
 */
const DOC = `Société Civile à Capital Variable - 775 675 739 RCS Nanterre
N° SIRET 775 675 739 03 131 N° TVA intracommunautaire : FR 42 775 675 739

RELEVÉ DE VOS DROITS D'AUTEUR

Nom : Sabourdin Julien
N° de personne : 5837219
N° compte : 317645928

FAMILLES
Autres
46,04 €
Etranger
30,89 €
Copie Privée
23,80 €

rendez-vous dans votre espace membre sur SACEM.FR`;

/** What the local NER plausibly tags on this document. */
const NER: Detection[] = [
  { value: "Sabourdin Julien", category: "NAME" },
  { value: "Etranger", category: "ORG" },
  { value: "SACEM", category: "ORG" },
  { value: "Nanterre", category: "LOCATION" },
];

describe("relevé Sacem — les libellés du document ne sont pas des identités", () => {
  it("« Etranger » (famille de répartition) et « SACEM » (émetteur) restent en clair", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(DOC, {
      vault,
      detectLocal: async () => NER,
    });
    expect(text).toContain("Etranger"); // distribution generic — never a company
    expect(text).toContain("SACEM.FR"); // the notorious issuer — the link must stay real
    expect(Object.values(vault)).not.toContain("Etranger");
    expect(Object.values(vault)).not.toContain("SACEM");
  });

  it("les vraies données du lecteur restent couvertes — le drop n'est pas un affaiblissement", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(DOC, {
      vault,
      detectLocal: async () => NER,
    });
    for (const real of ["Sabourdin Julien", "5837219", "317645928"]) {
      expect(text, `${real} doit être redacted`).not.toContain(real);
      expect(Object.values(vault)).toContain(real);
    }
    expect(unredact(text, vault)).toBe(DOC); // always reversible
  });
});
