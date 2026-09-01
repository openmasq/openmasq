import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";

/* Regression on a REAL case: a letter confirming registration with Pôle emploi,
   redacted under production conditions (identities substituted here).

   The log showed three defects that lost NO data but made the
   document and the instruction unusable:

     « recherche d'torvel », « demandeurs d'torvel », « Offre Raisonnable d'Torvel »
     « Vous êtes tenu de vous rendre à tout troyes-vous fixé »
     « Allège les phrases avignon sans changer le sens »   ← the user's instruction

   All three occurred WHILE the name, address and identifier were,
   themselves, correctly protected. So this is a PRECISION test: it first checks that
   the protection holds, then that nothing else goes into the vault. */

const PROMPT = `Relis le texte ci-dessous.
- Corrige l'orthographe, la grammaire et la ponctuation.
- Allège les phrases lourdes sans changer le sens ni le ton.`;

const LETTRE = `Page 1/2
                                                    M. VERNAUX ADRIEN
                                                    APPARTEMENT 400
                                                    1 ALLÉE DE VERDUN
                                                    53000 LAVAL

Références à rappeler
identifiant Pôle emploi 53954991
numéro de dossier 999                               ANNECY, le 12 juillet 2021

Objet : Confirmation de votre inscription à Pôle emploi

Monsieur VERNAUX,

Nous vous confirmons votre inscription à Pôle emploi à partir du 10 juillet 2021.

        Un suivi ou un accompagnement selon votre besoin, tout au long de votre
        recherche d'emploi, avec un conseiller référent dont les coordonnées vous
        seront communiquées prochainement ;
        Vous devez participer à la définition et à l'actualisation de votre projet
        personnalisé d'accès à l'emploi (PPAE), rechercher activement un emploi ;
        Vous vous engagez à donner suite aux offres raisonnables d'emploi, dont vous
        aurez défini les critères avec votre conseiller ;
        Vous êtes tenu de vous rendre à tout rendez-vous fixé avec Pôle emploi ou ses
        partenaires ;
        Honorer tous vos rendez-vous avec Pôle emploi (ou un organisme désigné par lui
        - Mission locale, Cap emploi, ...).

    Votre Projet Personnalisé d'Accès à l'Emploi (PPAE)
        Vous définirez ensemble les critères de l'Offre Raisonnable d'Emploi (ORE) :
        nature de l'emploi et du contrat recherché, temps de travail souhaité.

Pour les services d'appel au 3949 ou l'accueil en agence : utilisez votre identifiant
53954991 et votre code d'accès.

A défaut de réponse dans un délai d'un mois à compter de votre demande, vous avez la
possibilité de saisir la Commission d'Accès aux Documents Administratifs (CADA) dans un
délai de deux mois.`;

const texte = `${PROMPT}\n\nTexte :\n\n${LETTRE}`;

describe("lettre Pôle emploi — la protection tient, le reste reste lisible", () => {
  it("protège toujours l'identité, l'adresse et l'identifiant", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize(texte, { vault });
    const coffre = Object.values(vault);
    const attendu = ["VERNAUX", "53954991", "LAVAL"];
    const manquants = attendu.filter((v) => !coffre.some((o) => o.includes(v)));
    expect(manquants, `non protégés : ${manquants.join(", ")}`).toEqual([]);
  });

  it("ne redacted pas « emploi » — c'est un mot de « Pôle emploi », qui est notoire", async () => {
    const vault: Record<string, string> = {};
    const { text: out } = await pseudonymize(texte, { vault });
    // The notorious-entity fragment: `isNotoriousEntity` tests the WHOLE value, so
    // « emploi » alone used to get through while « Pôle emploi » two characters
    // further along was, itself, correctly recognised.
    expect(Object.values(vault).map((v) => v.toLowerCase())).not.toContain("emploi");
    expect(out).toContain("recherche d'emploi");
    expect(out).toContain("Offre Raisonnable d'Emploi");
  });

  it("ne coupe pas « rendez-vous » en deux", async () => {
    const vault: Record<string, string> = {};
    const { text: out } = await pseudonymize(texte, { vault });
    expect(Object.values(vault).map((v) => v.toLowerCase())).not.toContain("rendez");
    expect(out).toContain("rendez-vous");
  });

  it("ne prend pas l'adjectif « lourdes » de la CONSIGNE pour la ville", async () => {
    const vault: Record<string, string> = {};
    const { text: out } = await pseudonymize(texte, { vault });
    expect(Object.values(vault).map((v) => v.toLowerCase())).not.toContain("lourdes");
    expect(out).toContain("Allège les phrases lourdes");
  });

  it("laisse en clair les organismes publics nommés", async () => {
    const vault: Record<string, string> = {};
    const { text: out } = await pseudonymize(texte, { vault });
    for (const org of ["Pôle emploi", "Mission locale", "Cap emploi", "(CADA)"])
      expect(out, `${org} devrait rester en clair`).toContain(org);
  });

  it("garde le vocabulaire du courrier lisible", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize(texte, { vault });
    const coffre = new Set(Object.values(vault).map((v) => v.toLowerCase()));
    const mots = ["conseiller", "référent", "actualisation", "accompagnement",
      "inscription", "agence", "indemnisation", "allocation"];
    const pris = mots.filter((m) => coffre.has(m));
    expect(pris, `vocabulaire redacted : ${pris.join(", ")}`).toEqual([]);
  });

});

/* ⚠️ The tests above exercise ONLY the dictionary: they pass identically with
   both `textContext.ts` gates disabled, because the deterministic pipeline never
   proposes « emploi » as an organisation nor « lourdes » as a place — the NER
   does that, and that's where these gates act. So the detector is simulated, made to
   propose EXACTLY what the NER proposed on the real document. */

const proposant = (dets: { value: string; category: string }[]) => async () => JSON.stringify(dets);

const coffreDe = async (texteIn: string, dets: { value: string; category: string }[]) => {
  const vault: Record<string, string> = {};
  await pseudonymize(texteIn, { vault, complete: proposant(dets) });
  return new Set(Object.values(vault).map((v) => v.toLowerCase()));
};

describe("fragment d'entité notoire — le détecteur propose un mot, pas l'entité", () => {
  it("épargne le mot quand le texte nomme l'entité entière", async () => {
    const cas: [string, string, string][] = [
      ["Inscription à Pôle emploi le 10 juillet.", "Pôle", "ORG"],
      ["Le dossier a été transmis à France Travail.", "Travail", "ORG"],
      ["Le dossier part à l'Assurance Maladie demain.", "Maladie", "ORG"],
    ];
    for (const [texteCas, fragment, cat] of cas) {
      const coffre = await coffreDe(texteCas, [{ value: fragment, category: cat }]);
      expect(coffre, `${fragment} (dans « ${texteCas} »)`).not.toContain(fragment.toLowerCase());
    }
  });

  it("garde le mot quand le texte ne nomme PAS l'entité — rien à quoi se rattacher", async () => {
    const coffre = await coffreDe("Le pôle recrute deux personnes.", [
      { value: "pôle", category: "ORG" },
    ]);
    expect(coffre).toContain("pôle");
  });

  it("ne rattache un fragment qu'à une entité RÉELLEMENT dispensée", async () => {
    // « Goldman Sachs » has not been exempt since commercial brands were removed
    // (27/07/2026), so its fragment isn't either: a Léa Serval mentioned right next to it
    // still gets redacted. The gate follows the list, it doesn't duplicate it.
    const coffre = await coffreDe("Léa Serval a rencontré Goldman Sachs hier.", [
      { value: "Sachs", category: "NAME" },
    ]);
    expect(coffre).toContain("sachs");
  });

  it("⚠️ RÉSIDUEL ASSUMÉ : un patronyme identique à un mot d'un organisme public", async () => {
    // The « name » branch spares a MULTI-WORD span equal to a public body (a NER
    // reads « Assurance Maladie » as a person). Consequence: a Léa Maladie mentioned
    // right next to it goes out in clear. Documented in `textContext.ts`; pinning the residual
    // is better than discovering it in production.
    const coffre = await coffreDe("Léa Maladie a écrit à l'Assurance Maladie hier.", [
      { value: "Maladie", category: "NAME" },
    ]);
    expect(coffre).not.toContain("maladie");
  });
});

describe("homographe géographique en prose — « lourdes », « vannes »", () => {
  it("épargne l'adjectif en minuscules au milieu d'une phrase", async () => {
    for (const [t, mot] of [
      ["Allège les phrases lourdes sans changer le sens.", "lourdes"],
      ["Le plombier a fermé les vannes ce matin.", "vannes"],
    ] as [string, string][]) {
      const coffre = await coffreDe(t, [{ value: mot, category: "LOCATION" }]);
      expect(coffre, `${mot} dans « ${t} »`).not.toContain(mot);
    }
  });

  it("PROTÈGE toujours la vraie mention, même tapée en minuscules", async () => {
    // The discriminant: a locative word right before. That's what makes the gate safe —
    // someone who types their city without a capital letter must stay protected.
    for (const [t, mot] of [
      ["j'habite à vannes depuis trois ans", "vannes"],
      ["il est né à lourdes en 1980", "lourdes"],
      ["8 rue de Lorraine, 35000 vannes", "vannes"],
    ] as [string, string][]) {
      const coffre = await coffreDe(t, [{ value: mot, category: "LOCATION" }]);
      // Protected EITHER as its own value, OR inside the whole address that
      // the address detector caught — both count as "protected".
      expect([...coffre].some((v) => v.includes(mot)), `${mot} dans « ${t} »`).toBe(true);
    }
  });

  it("échoue FERMÉ quand il n'y a aucun indice — pas de voisin, pas de relâchement", async () => {
    // Two forms that exist on a real form and that do NOT have a locative word
    // in front: the city alone at the start of a line, and the postal code placed AFTER.
    for (const t of ["vannes\n35000", "Ville\nvannes 35000", "vannes"]) {
      const coffre = await coffreDe(t, [{ value: "vannes", category: "LOCATION" }]);
      expect([...coffre].some((v) => v.includes("vannes")), `« ${t} »`).toBe(true);
    }
  });

  it("PROTÈGE quand le mot apparaît capitalisé ailleurs dans le texte", async () => {
    const coffre = await coffreDe("Vannes est jolie. On passe par vannes demain.", [
      { value: "vannes", category: "LOCATION" },
    ]);
    expect(coffre).toContain("vannes");
  });
});
