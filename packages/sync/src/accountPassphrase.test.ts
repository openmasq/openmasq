import { beforeEach, describe, expect, it } from "vitest";
import { accountPassphrase, type PassphraseStore } from "./accountPassphrase";

/**
 * The bug these cases close: the passphrase was stored under ONE key per device, and
 * nothing cleared it on an account change — the next account therefore inherited the
 * E2E key of the previous one and ended up synced without having asked for it.
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
    // …and the shared key is gone, so B starts fresh with no passphrase.
    expect(mem["pass"]).toBeUndefined();
    account = "B";
    expect(await pass.get()).toBeNull();
  });

  /* ⚠️ Without a resolved account, adoption MUST NOT run: it would delete the
     inherited key, and a lost passphrase permanently orphans the vaults already synced
     (no escrow). So it waits for the first connection. */
  it("déconnecté, elle est PRÉSERVÉE pour la prochaine connexion", async () => {
    mem["pass"] = "ancienne";
    expect(await pass.get()).toBeNull();
    expect(mem["pass"]).toBe("ancienne");
    account = "A";
    expect(await pass.get()).toBe("ancienne");
  });

  /* Reactivation, identically: turning off then reloading used to re-adopt the old
     passphrase if the marker wasn't set. */
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
