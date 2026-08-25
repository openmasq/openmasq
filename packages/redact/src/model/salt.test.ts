import { describe, expect, it } from "vitest";
import { pseudonymize } from "./pseudonymize";
import { fakeFor } from "./fakes";
import type { Vault } from "../types";

// The per-conversation salt: the fake is a SECRET-KEYED function of the real value, not a
// public deterministic one. Without it, « Augustin Vaudel » → « Simon Cros » in every
// conversation and for every user, so anyone holding the fake reverses it by precomputing
// the pool over a name dictionary. These pin the three properties the fix must have.

describe("fakeFor — salt shifts the mapping, deterministically per (value, salt)", () => {
  it("salt 0 is the legacy mapping (existing fakes unchanged — every other test relies on it)", () => {
    expect(fakeFor("NAME", "Marie Curie", 0)).toBe(fakeFor("NAME", "Marie Curie", 0, undefined, 0));
  });

  it("a different salt yields a DIFFERENT fake for the SAME value", () => {
    const a = fakeFor("NAME", "Augustin Vaudel", 0, undefined, 0);
    const b = fakeFor("NAME", "Augustin Vaudel", 0, undefined, 987654);
    expect(b).not.toBe(a);
  });

  it("the SAME salt is stable (a conversation re-deriving a fake gets the same one)", () => {
    expect(fakeFor("NAME", "Augustin Vaudel", 0, undefined, 42)).toBe(fakeFor("NAME", "Augustin Vaudel", 0, undefined, 42));
  });

  it("shifts EVERY kind, not just names (dictionary-invertible kinds all covered)", () => {
    const cases: [string, string][] = [
      ["EMAIL", "augustin.vaudel@example.fr"],
      ["ORG", "Karl Studio"],
      ["CITY", "Bordeaux"],
      ["PHONE", "+33 6 12 34 56 78"],
      ["IP", "192.168.4.7"],
      ["PATH", "/home/augustin/docs/budget.xlsx"],
      ["DATE", "12/05/1990"],
      ["IBAN", "FR76 3000 6000 0112 3456 7890 189"],
    ];
    for (const [cat, val] of cases) {
      const a = fakeFor(cat, val, 0, undefined, 0);
      const b = fakeFor(cat, val, 0, undefined, 555111);
      expect(b, `${cat} did not shift with the salt`).not.toBe(a);
    }
  });
});

// A free-form NAME has no fixed shape, so the regex engine can't see it — the real
// pipeline detects it with the model/NER. Stand in with a dictionary detector (the same
// device the process harness uses) so these exercise the fake ALLOCATION, which is what
// the salt touches.
const detect =
  (dict: Record<string, string>) =>
  async (input: string) =>
    Object.entries(dict)
      .filter(([v]) => input.includes(v))
      .map(([value, category]) => ({ value, category }));
const NAME = { detectLocal: detect({ "Augustin Vaudel": "NAME" }) };

describe("pseudonymize — salt is per-conversation; the vault keeps it stable", () => {
  it("two conversations (different salt) fake the same real value DIFFERENTLY, both reversible", async () => {
    const v1: Vault = {};
    const v2: Vault = {};
    const r1 = await pseudonymize("Contacte Augustin Vaudel à ce sujet.", { ...NAME, vault: v1, salt: 111 });
    const r2 = await pseudonymize("Contacte Augustin Vaudel à ce sujet.", { ...NAME, vault: v2, salt: 222 });
    // The fake the model sees differs between the two conversations…
    expect(r1.text).not.toBe(r2.text);
    expect(r1.text).not.toContain("Augustin Vaudel");
    expect(r2.text).not.toContain("Augustin Vaudel");
    // …yet each reverses to the real value via its own vault.
    expect(Object.values(v1)).toContain("Augustin Vaudel");
    expect(Object.values(v2)).toContain("Augustin Vaudel");
  });

  it("WITHIN a conversation the value keeps ONE fake across turns (vault reuse, salt held)", async () => {
    const vault: Vault = {};
    const t1 = await pseudonymize("Augustin Vaudel arrive lundi.", { ...NAME, vault, salt: 777 });
    const fake1 = Object.entries(vault).find(([, real]) => real === "Augustin Vaudel")?.[0];
    // Turn 2: same conversation vault + same salt → the vault supplies the SAME fake.
    const t2 = await pseudonymize("Je confirme à Augustin Vaudel.", { ...NAME, vault, salt: 777 });
    const fakes = Object.entries(vault).filter(([, real]) => real === "Augustin Vaudel");
    expect(fake1).toBeTruthy();
    expect(fakes).toHaveLength(1); // ONE identity, not one-per-turn
    expect(t1.text).toContain(fake1!);
    expect(t2.text).toContain(fake1!);
  });

  it("a name and its later FRAGMENT/other casing still collapse to ONE identity under a salt", async () => {
    // The salt is a uniform shift, so the atomic-identity machinery is unaffected: the
    // surname alone must map to the same person's fake, not a fresh one.
    const vault: Vault = {};
    await pseudonymize("Augustin Vaudel présentera le projet.", { ...NAME, vault, salt: 9090 });
    const r = await pseudonymize("Vaudel présentera le projet.", { ...NAME, vault, salt: 9090 });
    // « Vaudel » alone reversed through the vault must yield the real full-name person's
    // fake surname, never a second distinct identity — no new full-name vault entry.
    const names = Object.values(vault).filter((v) => v.includes("Augustin Vaudel"));
    expect(names).toHaveLength(1);
    expect(r.text).not.toContain("Vaudel");
  });
});
