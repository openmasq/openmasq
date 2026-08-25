import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { unredact } from "../engine/vault";
import type { Vault } from "../types";

/* MODE JETONS (`mode: "token"`) — le modèle ne voit que des marqueurs.
 *
 * Le mode par défaut envoie des FAUX vraisemblables, parce qu'un texte qui reste du texte
 * se laisse rédiger, accorder et raisonner. Le mode jetons échange cette qualité contre la
 * sobriété : un faux nom reste un nom, un faux code postal reste une région — un jeton, lui,
 * ne laisse RIEN. Les deux sont réversibles par le même coffre.
 *
 * Ce que ces tests épinglent, ce sont les invariants qui ne changent pas AVEC le mode :
 * une valeur → un substitut, une entité → un numéro, jamais de valeur réelle sur le fil. */

// Un détecteur-dictionnaire tient lieu de NER (même dispositif que `salt.test.ts`) : ces
// tests exercent l'ALLOCATION, pas la détection.
const detect =
  (dict: Record<string, string>) =>
  async (input: string) =>
    Object.entries(dict)
      .filter(([v]) => input.includes(v))
      .map(([value, category]) => ({ value, category }));

const TOKEN = { mode: "token" as const };

describe("mode jetons — ce qui part sur le fil", () => {
  it("substitue un marqueur, jamais un faux nom, et reste réversible", async () => {
    const vault: Vault = {};
    const r = await pseudonymize("Préviens Augustin Vaudel de la réunion.", {
      ...TOKEN,
      vault,
      detectLocal: detect({ "Augustin Vaudel": "NAME" }),
    });
    expect(r.text).not.toContain("Augustin Vaudel");
    expect(r.text).toContain("[PERSON1]");
    // Le coffre porte le vrai, donc la réponse du modèle se restitue.
    expect(vault["[PERSON1]"]).toBe("Augustin Vaudel");
    expect(unredact("[PERSON1] est prévenu.", vault)).toBe("Augustin Vaudel est prévenu.");
  });

  it("numérote par famille, avec la MÊME table que l'affichage", async () => {
    const vault: Vault = {};
    const r = await pseudonymize(
      "Augustin Vaudel, IBAN FR76 3000 6000 0112 3456 7890 189, écrit à paul.savary@example.fr.",
      { ...TOKEN, vault, detectLocal: detect({ "Augustin Vaudel": "NAME" }) },
    );
    expect(r.text).toContain("[PERSON1]");
    expect(r.text).toContain("[IBAN1]");
    expect(r.text).toContain("[EMAIL1]");
    // Aucune valeur réelle ne subsiste.
    expect(r.text).not.toMatch(/FR76|paul\.savary|Augustin/);
  });

  it("deux personnes = deux numéros ; la même personne au tour suivant garde le sien", async () => {
    const vault: Vault = {};
    const NAMES = detect({ "Augustin Vaudel": "NAME", "Léa Morvan": "NAME" });
    await pseudonymize("Augustin Vaudel ouvre le dossier.", { ...TOKEN, vault, detectLocal: NAMES });
    const t2 = await pseudonymize("Léa Morvan répond à Augustin Vaudel.", { ...TOKEN, vault, detectLocal: NAMES });
    expect(vault["[PERSON1]"]).toBe("Augustin Vaudel");
    expect(vault["[PERSON2]"]).toBe("Léa Morvan");
    // Une valeur → UN jeton, sur toute la conversation (pas un par tour).
    expect(Object.values(vault).filter((v) => v === "Augustin Vaudel")).toHaveLength(1);
    expect(t2.text).toContain("[PERSON1]");
    expect(t2.text).toContain("[PERSON2]");
  });

  it("une entité en plusieurs CASSES garde UN numéro — sinon le modèle lit deux entités", async () => {
    // `applyVault` est sensible à la casse : chaque casse a besoin de sa propre entrée de
    // coffre. Elles ne diffèrent que par la casse du jeton, ce qu'un lecteur — humain ou
    // modèle — lit comme un seul et même jeton.
    const vault: Vault = {};
    const r = await pseudonymize("KARL STUDIO facture ; Karl Studio livre.", {
      ...TOKEN,
      vault,
      detectLocal: detect({ "KARL STUDIO": "ORG", "Karl Studio": "ORG" }),
    });
    expect(r.text).toContain("[COMPANY1]"); // la casse de titre prend la forme canonique
    expect(r.text).toContain("[Company1]"); // les capitales prennent la variante
    expect(r.text).not.toMatch(/COMPANY2/i);
    expect(vault["[COMPANY1]"]).toBe("Karl Studio");
    expect(vault["[Company1]"]).toBe("KARL STUDIO");
    // Chaque casse se restitue vers SA valeur.
    expect(unredact("[COMPANY1] et [Company1]", vault)).toBe("Karl Studio et KARL STUDIO");
  });

  it("les écritures partielles d'une personne restent LA même personne", async () => {
    // Mesuré par `bench/tokensVsFakes.ts` : sans ça, « Présents : Léa Morvan, L. Morvan
    // (excusée)… » partait en QUATRE jetons pour DEUX personnes, et le modèle comptait
    // quatre présents. Le chemin des faux tient ce lien par ses alias par mot ; un jeton
    // n'a pas de mots à partager, alors il partage l'INDICE et prend une lettre.
    const vault: Vault = {};
    const r = await pseudonymize("Présents : Léa Morvan, L. Morvan, Augustin Vaudel et A. Vaudel.", {
      ...TOKEN,
      vault,
      detectLocal: detect({
        "Léa Morvan": "NAME",
        "L. Morvan": "NAME",
        "Augustin Vaudel": "NAME",
        "A. Vaudel": "NAME",
      }),
    });
    expect(r.text).toContain("[PERSON1]");
    expect(r.text).toContain("[PERSON1b]");
    expect(r.text).toContain("[PERSON2]");
    expect(r.text).toContain("[PERSON2b]");
    expect(r.text).not.toMatch(/PERSON3/);
    // Chaque écriture garde SA propre entrée, donc chacune se restitue telle qu'écrite.
    expect(unredact("[PERSON1b] et [PERSON2b]", vault)).toMatch(/^(L\. Morvan|A\. Vaudel) et /);
  });

  it("un « [PERSON1] » écrit par l'utilisateur ne peut pas être écrasé", async () => {
    // Fail closed : la clé calculée est déjà dans le texte, donc on avance jusqu'à une clé
    // libre. Sans ça, la substitution de l'un mangerait le littéral de l'autre.
    const vault: Vault = {};
    const r = await pseudonymize("Le gabarit dit [PERSON1] ; remplace par Augustin Vaudel.", {
      ...TOKEN,
      vault,
      detectLocal: detect({ "Augustin Vaudel": "NAME" }),
    });
    expect(vault["[PERSON1]"]).toBeUndefined();
    expect(vault["[PERSON2]"]).toBe("Augustin Vaudel");
    expect(r.text).not.toContain("Augustin Vaudel");
  });

  it("le mode par défaut reste les FAUX (aucune régression du chemin existant)", async () => {
    const vault: Vault = {};
    const r = await pseudonymize("Préviens Augustin Vaudel.", {
      vault,
      detectLocal: detect({ "Augustin Vaudel": "NAME" }),
    });
    expect(r.text).not.toContain("[PERSON1]");
    expect(r.text).not.toContain("Augustin Vaudel");
    expect(Object.values(vault)).toContain("Augustin Vaudel");
  });

  it("la postcondition « signalé ⇒ coffré ⇒ substitué » tient aussi en mode jetons", async () => {
    const vault: Vault = {};
    const r = await pseudonymize("Augustin Vaudel, 06 12 34 56 78, paul.savary@example.fr", {
      ...TOKEN,
      vault,
      detectLocal: detect({ "Augustin Vaudel": "NAME" }),
    });
    expect(r.modelError).toBeUndefined();
    for (const m of r.matches) {
      expect(vault[m.placeholder]).toBe(m.value);
      expect(r.text).toContain(m.placeholder);
    }
  });
});

describe("mode jetons — la restitution, là où le mode se joue", () => {
  // Un faux nom traverse la réponse intact ; un jeton, le modèle le RÉÉCRIT. Chaque forme
  // non restituée laisse « PERSON1 » sous les yeux de l'utilisateur à la place de son
  // information — le mode ne vaut que si la passe inverse encaisse ces déformations.
  const vault: Vault = { "[PERSON1]": "Augustin Vaudel", "[IBAN1]": "FR76 3000 6000 0112 3456 7890 189" };

  it("restitue le jeton tel quel", () => {
    expect(unredact("Bonjour [PERSON1],", vault)).toBe("Bonjour Augustin Vaudel,");
  });

  it("restitue une casse changée par le modèle", () => {
    expect(unredact("Bonjour [person1],", vault)).toBe("Bonjour Augustin Vaudel,");
  });

  it("restitue un jeton emphasé en markdown", () => {
    expect(unredact("**[PERSON1]** confirme.", vault)).toBe("**Augustin Vaudel** confirme.");
  });

  it("restitue un jeton dont les crochets ont été échappés par le markdown", () => {
    // `\[PERSON1\]` : les crochets ET leur échappement font partie du marqueur, donc ils
    // disparaissent avec lui — la phrase rendue ne garde pas de ponctuation orpheline.
    expect(unredact("\\[PERSON1\\] confirme.", vault)).toBe("Augustin Vaudel confirme.");
  });

  it("restitue un jeton écrit SANS crochets — la déformation la plus courante", () => {
    // Un modèle recopie volontiers PERSON1 en toutes lettres dans une phrase, ou en titre
    // de tableau. Sans cette tolérance l'utilisateur lit « PERSON1 » dans SA réponse.
    expect(unredact("Le dossier de PERSON1 est complet.", vault)).toBe(
      "Le dossier d'Augustin Vaudel est complet.",
    );
  });

  it("ne restitue PAS un mot ordinaire qui ressemble de loin à un jeton", () => {
    // La tolérance sans crochets ne doit pas transformer un mot anodin en donnée réelle.
    expect(unredact("La personne est absente.", vault)).toBe("La personne est absente.");
    expect(unredact("PERSON12 n'existe pas.", vault)).toBe("PERSON12 n'existe pas.");
  });
});
