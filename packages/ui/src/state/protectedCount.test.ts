import { describe, it, expect } from "vitest";
import { conversationProtectedCount, protectedCount, protectedEntries, vaultEntries } from "./protectedCount";
import type { Conversation, Message } from "../types";

const msg = (over: Partial<Message>): Message =>
  ({ id: "m1", role: "user", content: "", createdAt: 0, ...over }) as Message;

const conv = (over: Partial<Conversation>): Conversation =>
  ({ id: "c1", title: "", modelId: "m", messages: [], createdAt: 0, updatedAt: 0, ...over }) as Conversation;

/**
 * Le coffre RÉEL que le moteur produit pour « … pour Claire Berliand, jointe à
 * claire.berliand@atelier-fervoie.fr ou au 06 83 57 41 92 ? Le virement doit partir vers
 * FR76 3000 6000 0112 3456 7890 189. » — relevé sur `pseudonymize`, pas inventé.
 * QUATRE informations, NEUF entrées : le nom y est aussi mot par mot et en deux casses,
 * l'adresse y laisse son domaine.
 */
const VAULT_REEL = {
  "gwenola.grandjean@orange.fr": "claire.berliand@atelier-fervoie.fr",
  Gwenola: "Claire",
  gwenola: "claire",
  Grandjean: "Berliand",
  grandjean: "berliand",
  "orange.fr": "atelier-fervoie.fr",
  "FR76 1529 2307 4297 5319 7531 935": "FR76 3000 6000 0112 3456 7890 189",
  "Gwenola Grandjean": "Claire Berliand",
  "06 34 21 29 88": "06 83 57 41 92",
};

const KINDS = {
  "Claire Berliand": "name",
  "claire.berliand@atelier-fervoie.fr": "email",
  "06 83 57 41 92": "phone",
  "FR76 3000 6000 0112 3456 7890 189": "iban",
};

describe("un élément protégé = une VALEUR, pas une entrée de coffre", () => {
  // Le défaut que ceci ferme : l'app annonçait « 9 informations protégées » au-dessus
  // d'un comparatif qui n'en montrait que 4 — le chiffre contredisait sa propre preuve.
  it("replie les alias du coffre (mots d'un nom, casses, domaine d'une adresse)", () => {
    const c = conv({ redactionVault: VAULT_REEL, redactionKinds: KINDS });
    expect(vaultEntries(c)).toHaveLength(9);
    expect(conversationProtectedCount(c)).toBe(4);
    expect(protectedEntries(c).map(([, real]) => real).sort()).toEqual(
      [
        "06 83 57 41 92",
        "Claire Berliand",
        "FR76 3000 6000 0112 3456 7890 189",
        "claire.berliand@atelier-fervoie.fr",
      ].sort(),
    );
  });

  // ⚠️ Le piège du repli : « Claire Berliand » EST contenu dans « claire.berliand@… ».
  // Un simple test de fragment ferait disparaître le nom derrière l'adresse — deux
  // informations, pas une.
  it("ne replie JAMAIS une valeur reconnue dans une autre qui la contient", () => {
    const c = conv({ redactionVault: VAULT_REEL, redactionKinds: KINDS });
    const reals = protectedEntries(c).map(([, real]) => real);
    expect(reals).toContain("Claire Berliand");
    expect(reals).toContain("claire.berliand@atelier-fervoie.fr");
  });

  // Les `redactedSpans` d'un message disent aussi ce qui est canonique — une conversation
  // dont le `redactionKinds` n'a pas encore été persisté doit compter pareil.
  it("lit aussi les `redactedSpans` des messages", () => {
    const c = conv({
      redactionVault: VAULT_REEL,
      messages: [
        msg({
          redactedSpans: Object.entries(KINDS).map(([value, kind]) => ({ value, kind })),
        }),
      ],
    });
    expect(conversationProtectedCount(c)).toBe(4);
  });

  // On ne DEVINE pas : sans rien de canonique (conversation d'avant `redactionKinds`),
  // le coffre est rendu tel quel — jamais un sous-compte inventé.
  it("rend le coffre entier quand rien n'est reconnu", () => {
    expect(conversationProtectedCount(conv({ redactionVault: VAULT_REEL }))).toBe(9);
  });

  it("deux personnes distinctes restent deux", () => {
    const c = conv({
      redactionVault: { "Alice Morvan": "Claire Berliand", "Bob Petit": "Marc Brivet", Bob: "Marc" },
      redactionKinds: { "Claire Berliand": "name", "Marc Brivet": "name" },
    });
    expect(conversationProtectedCount(c)).toBe(2);
  });

  it("ignore les entrées vides et somme sur le compte", () => {
    const c = conv({ redactionVault: { "": "x", y: "", ...VAULT_REEL }, redactionKinds: KINDS });
    expect(conversationProtectedCount(c)).toBe(4);
    expect(protectedCount([c, c])).toBe(8);
    expect(protectedCount([])).toBe(0);
  });
});
