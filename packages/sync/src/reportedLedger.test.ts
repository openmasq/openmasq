import { beforeEach, describe, expect, it } from "vitest";
import { reportedLedger } from "./reportedLedger";
import type { PassphraseStore } from "./accountPassphrase";

let mem: Record<string, string>;
const store: PassphraseStore = {
  get: async (k) => mem[k],
  set: async (k, v) => void (mem[k] = v),
  remove: async (k) => void delete mem[k],
};

let account: string | null = null;
const KEY = "reported";
const make = () => reportedLedger({ store, legacyKey: KEY, accountId: async () => account });

beforeEach(() => {
  mem = {};
  account = null;
});

const dump = () => JSON.stringify(mem);

describe("le journal est PAR COMPTE", () => {
  /* Le sous-comptage : ce que A a rapporté empêchait l'organisation de B de compter les
     siennes, sur un tableau de bord qu'un administrateur lit comme la vérité. */
  it("ce que A a rapporté n'aveugle pas B", async () => {
    account = "A";
    const a = await make().open();
    await a.mark(["marc@ex.fr"]);
    expect(await a.seen("marc@ex.fr")).toBe(true);

    account = "B";
    const b = await make().open();
    expect(await b.seen("marc@ex.fr")).toBe(false);
  });

  it("et A garde le sien quand B rapporte de son côté", async () => {
    account = "A";
    await (await make().open()).mark(["a@ex.fr"]);
    account = "B";
    await (await make().open()).mark(["b@ex.fr"]);
    account = "A";
    const a = await make().open();
    expect(await a.seen("a@ex.fr")).toBe(true);
    expect(await a.seen("b@ex.fr")).toBe(false);
  });

  it("déconnecté : rien n'est marqué (rien n'a pu être rapporté)", async () => {
    const l = await make().open();
    await l.mark(["x@ex.fr"]);
    expect(await l.seen("x@ex.fr")).toBe(false);
  });
});

describe("aucune valeur réelle ne dort sur le disque", () => {
  it("ce qui est écrit ne contient JAMAIS la valeur", async () => {
    account = "A";
    await (await make().open()).mark(["marc.rebour@example.fr", "0612345678"]);
    expect(dump()).not.toContain("marc.rebour@example.fr");
    expect(dump()).not.toContain("0612345678");
  });

  /* ⚠️ Le clair hérité doit partir MÊME déconnecté : attendre une connexion laisserait la
     PII sur une machine où plus personne ne se reconnecte — le défaut le plus concret. */
  it("l'ancien journal EN CLAIR est haché sur place, connecté ou non", async () => {
    mem[KEY] = JSON.stringify(["marc.rebour@example.fr"]);
    await make().open(); // déconnecté
    expect(dump()).not.toContain("marc.rebour@example.fr");
    expect(mem[KEY]).toBeDefined(); // …mais l'info de dédoublonnage, elle, survit
  });

  it("le sel rend deux installations incomparables", async () => {
    account = "A";
    await (await make().open()).mark(["marc@ex.fr"]);
    const first = mem[`${KEY}:A`];
    // Une autre installation : même valeur, autre sel.
    mem = {};
    account = "A";
    await (await make().open()).mark(["marc@ex.fr"]);
    expect(mem[`${KEY}:A`]).not.toBe(first);
  });
});

describe("l'héritage de l'ancienne clé", () => {
  it("revient au PREMIER compte connecté, puis disparaît", async () => {
    mem[KEY] = JSON.stringify(["deja@ex.fr"]);
    account = "A";
    const a = await make().open();
    expect(await a.seen("deja@ex.fr")).toBe(true);
    expect(mem[KEY]).toBeUndefined();

    account = "B";
    expect(await (await make().open()).seen("deja@ex.fr")).toBe(false);
  });

  /* Le supprimer sans l'avoir donné à personne ferait re-rapporter tout l'historique —
     le SUR-comptage, l'autre moitié du défaut. */
  it("déconnecté, il est conservé (haché) pour la prochaine connexion", async () => {
    mem[KEY] = JSON.stringify(["deja@ex.fr"]);
    await make().open();
    expect(mem[KEY]).toBeDefined();
    account = "A";
    expect(await (await make().open()).seen("deja@ex.fr")).toBe(true);
  });
});
