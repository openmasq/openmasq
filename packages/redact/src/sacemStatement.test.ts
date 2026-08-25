import { describe, expect, it } from "vitest";
import { pseudonymize, unredact } from "./index";
import type { Detection, Vault } from "./types";

/**
 * Le relevé de droits d'auteur Sacem — la régression des deux faux positifs rapportés :
 *  - « Etranger » (un libellé de FAMILLE de répartition, seul dans sa colonne) tagué ORG
 *    par le NER et faké en société inventée (« Ashborne ») ;
 *  - « SACEM » (l'ÉMETTEUR du relevé, jamais l'identité du lecteur) faké en « KELBY »,
 *    envoyant l'utilisateur consulter le site d'une société inexistante.
 * Le NER est SIMULÉ via `detectLocal` — c'est le contrat du choke point : toutes les
 * sources passent le même filtre, donc épingler le drop ici couvre le vrai NER.
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

/** Ce que le NER local tague plausiblement sur ce document. */
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
    expect(text).toContain("Etranger"); // générique de répartition — jamais une société
    expect(text).toContain("SACEM.FR"); // l'émetteur notoire — le lien doit rester vrai
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
    expect(unredact(text, vault)).toBe(DOC); // réversible, toujours
  });
});
