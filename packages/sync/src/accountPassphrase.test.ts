import { beforeEach, describe, expect, it } from "vitest";
import { accountPassphrase, type PassphraseStore } from "./accountPassphrase";

/**
 * Le défaut que ces cas ferment : la phrase était rangée sous UNE clé par appareil, et
 * rien ne l'effaçait au changement de compte — le compte suivant héritait donc de la clé
 * E2E du précédent et se retrouvait synchronisé sans l'avoir demandé.
 */
let mem: Record<string, string>;
const store: PassphraseStore = {
  get: async (k) => mem[k],
  set: async (k, v) => void (mem[k] = v),
  remove: async (k) => void delete mem[k],
};

let account: string | null = null;
const pass = accountPassphrase({ store, legacyKey: "pass", accountId: async () => account });

beforeEach(() => {
  mem = {};
  account = null;
});

describe("la phrase appartient au COMPTE", () => {
  it("le compte B n'hérite JAMAIS de la phrase de A", async () => {
    account = "A";
    await pass.set("phrase-de-a");
    account = "B";
    expect(await pass.get()).toBeNull();
  });

  it("revenir sur A retrouve la sienne — on range, on ne détruit pas", async () => {
    account = "A";
    await pass.set("phrase-de-a");
    account = "B";
    await pass.set("phrase-de-b");
    account = "A";
    expect(await pass.get()).toBe("phrase-de-a");
  });

  it("éteindre chez B ne touche pas A", async () => {
    account = "A";
    await pass.set("phrase-de-a");
    account = "B";
    await pass.set("phrase-de-b");
    await pass.clear();
    expect(await pass.get()).toBeNull();
    account = "A";
    expect(await pass.get()).toBe("phrase-de-a");
  });

  it("déconnecté : rien à lire, et poser LÈVE au lieu de faire semblant", async () => {
    expect(await pass.get()).toBeNull();
    await expect(pass.set("x")).rejects.toThrow(/no account/);
  });
});

describe("l'héritage de l'ancienne clé sans compte", () => {
  it("revient au PREMIER compte connecté, une seule fois", async () => {
    mem["pass"] = "ancienne";
    account = "A";
    expect(await pass.get()).toBe("ancienne");
    // …et la clé partagée a disparu, donc B repart sans phrase.
    expect(mem["pass"]).toBeUndefined();
    account = "B";
    expect(await pass.get()).toBeNull();
  });

  /* ⚠️ Sans compte résolu, l'adoption NE DOIT PAS courir : elle supprimerait la clé
     héritée, et une phrase perdue orpheline définitivement les coffres déjà synchronisés
     (aucun séquestre). Elle attend donc la première connexion. */
  it("déconnecté, elle est PRÉSERVÉE pour la prochaine connexion", async () => {
    mem["pass"] = "ancienne";
    expect(await pass.get()).toBeNull();
    expect(mem["pass"]).toBe("ancienne");
    account = "A";
    expect(await pass.get()).toBe("ancienne");
  });

  /* La réactivation, à l'identique : éteindre puis recharger ré-adoptait l'ancienne
     phrase si le marqueur n'était pas posé. */
  it("éteindre ferme la porte de l'adoption — pas de retour au rechargement", async () => {
    mem["pass"] = "ancienne";
    account = "A";
    expect(await pass.get()).toBe("ancienne");
    await pass.clear();
    expect(await pass.get()).toBeNull();
  });

  it("un compte qui pose SA phrase n'ouvre pas l'héritage au suivant", async () => {
    mem["pass"] = "ancienne";
    account = "A";
    await pass.set("la-mienne");
    account = "B";
    expect(await pass.get()).toBeNull();
  });
});
