import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { unredact } from "../engine/vault";
import type { Vault } from "../types";

/* TOKEN MODE (`mode: "token"`) — the model sees only markers.
 *
 * The default mode sends believable FAKES, because text that stays text
 * can still be drafted, agreed and reasoned over. Token mode trades that quality for
 * sobriety: a fake name stays a name, a fake postal code stays a region — a token, on the
 * other hand, leaves NOTHING. Both are reversible through the same vault.
 *
 * What these tests pin are the invariants that DON'T change WITH the mode:
 * one value → one substitute, one entity → one number, never a real value on the wire. */

// A dictionary-detector stands in for the NER (same setup as `salt.test.ts`): these
// tests exercise ALLOCATION, not detection.
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
    // The vault carries the real value, so the model's reply is restored.
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
    // No real value survives.
    expect(r.text).not.toMatch(/FR76|paul\.savary|Augustin/);
  });

  it("deux personnes = deux numéros ; la même personne au tour suivant garde le sien", async () => {
    const vault: Vault = {};
    const NAMES = detect({ "Augustin Vaudel": "NAME", "Léa Morvan": "NAME" });
    await pseudonymize("Augustin Vaudel ouvre le dossier.", { ...TOKEN, vault, detectLocal: NAMES });
    const t2 = await pseudonymize("Léa Morvan répond à Augustin Vaudel.", { ...TOKEN, vault, detectLocal: NAMES });
    expect(vault["[PERSON1]"]).toBe("Augustin Vaudel");
    expect(vault["[PERSON2]"]).toBe("Léa Morvan");
    // One value → ONE token, across the whole conversation (not one per turn).
    expect(Object.values(vault).filter((v) => v === "Augustin Vaudel")).toHaveLength(1);
    expect(t2.text).toContain("[PERSON1]");
    expect(t2.text).toContain("[PERSON2]");
  });

  it("une entité en plusieurs CASSES garde UN numéro — sinon le modèle lit deux entités", async () => {
    // `applyVault` is case-sensitive: every casing needs its own vault
    // entry. They only differ by the token's casing, which a reader — human or
    // model — reads as one and the same token.
    const vault: Vault = {};
    const r = await pseudonymize("KARL STUDIO facture ; Karl Studio livre.", {
      ...TOKEN,
      vault,
      detectLocal: detect({ "KARL STUDIO": "ORG", "Karl Studio": "ORG" }),
    });
    expect(r.text).toContain("[COMPANY1]"); // title case takes the canonical form
    expect(r.text).toContain("[Company1]"); // the all-caps form takes the variant
    expect(r.text).not.toMatch(/COMPANY2/i);
    expect(vault["[COMPANY1]"]).toBe("Karl Studio");
    expect(vault["[Company1]"]).toBe("KARL STUDIO");
    // Each casing restores to ITS OWN value.
    expect(unredact("[COMPANY1] et [Company1]", vault)).toBe("Karl Studio et KARL STUDIO");
  });

  it("les écritures partielles d'une personne restent LA même personne", async () => {
    // Measured by `bench/tokensVsFakes.ts`: without this, « Présents : Léa Morvan, L. Morvan
    // (excusée)… » went out as FOUR tokens for TWO people, and the model counted
    // four attendees. The fakes path keeps this link through its per-word aliases; a token
    // has no words to share, so it shares the INDEX and takes a letter suffix.
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
    // Each spelling keeps ITS OWN entry, so each one restores exactly as written.
    expect(unredact("[PERSON1b] et [PERSON2b]", vault)).toMatch(/^(L\. Morvan|A\. Vaudel) et /);
  });

  it("un « [PERSON1] » écrit par l'utilisateur ne peut pas être écrasé", async () => {
    // Fail closed: the computed key is already in the text, so we advance to a free
    // key. Without this, substituting one would eat the other's literal text.
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
  // A fake name crosses the reply intact; a token, the model REWRITES. Every form
  // that isn't restored leaves « PERSON1 » in front of the user instead of their
  // information — the mode is only worth it if the reverse pass absorbs these distortions.
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
    // `\[PERSON1\]`: the brackets AND their escaping are part of the marker, so they
    // disappear with it — the rendered sentence keeps no orphan punctuation.
    expect(unredact("\\[PERSON1\\] confirme.", vault)).toBe("Augustin Vaudel confirme.");
  });

  it("restitue un jeton écrit SANS crochets — la déformation la plus courante", () => {
    // A model readily copies PERSON1 spelled out in a sentence, or as a table
    // header. Without this tolerance the user reads « PERSON1 » in THEIR reply.
    expect(unredact("Le dossier de PERSON1 est complet.", vault)).toBe(
      "Le dossier d'Augustin Vaudel est complet.",
    );
  });

  it("ne restitue PAS un mot ordinaire qui ressemble de loin à un jeton", () => {
    // The bracket-free tolerance must not turn an ordinary word into real data.
    expect(unredact("La personne est absente.", vault)).toBe("La personne est absente.");
    expect(unredact("PERSON12 n'existe pas.", vault)).toBe("PERSON12 n'existe pas.");
  });
});
