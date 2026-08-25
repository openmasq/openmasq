import { describe, it, expect } from "vitest";
import { buildFakeName } from "./name";
import { pseudonymize } from "../pseudonymize";

describe("buildFakeName — primary fake carries the REAL token's casing", () => {
  const fresh = () => buildFakeName("keller", 0, () => undefined, () => false);

  it("a lowercase first-seen name gets a lowercase primary fake", () => {
    const fake = fresh();
    expect(fake).toBe(fake.toLowerCase());
  });

  it("an ALL-CAPS name gets an ALL-CAPS fake; Title stays Title", () => {
    expect(buildFakeName("KELLER", 0, () => undefined, () => false)).toMatch(/^[A-ZÀ-Ý]+$/);
    const title = buildFakeName("Keller", 0, () => undefined, () => false);
    expect(title[0]).toBe(title[0].toUpperCase());
    expect(title.slice(1)).toBe(title.slice(1).toLowerCase());
  });
});

describe("lowercase-first name — the Title-cased occurrence still substitutes", () => {
  it("'madame keller' then 'Mme Keller': BOTH casings leave the wire (order-independent)", async () => {
    // Regression: the Title-cased pool pick for "keller" used to occupy the key the
    // ["Nathan","Keller"] alias needed → "Mme Keller" had no forward mapping and
    // applyVault (case-sensitive) shipped the real surname to the model.
    const vault: Record<string, string> = {};
    const r = await pseudonymize("J'ai vu madame keller hier. Mme Keller confirmera.", { vault });
    expect(r.modelError).toBeUndefined();
    expect(r.text).not.toMatch(/keller/i);
  });
});

describe("alias par mot — un mot du VOCABULAIRE n'en reçoit jamais", () => {
  /**
   * ⚠️ RÉGRESSION mesurée par `bench/sourceFp.bench.ts`. Troisième chemin de la même
   * panne que la particule (« de ») et la civilité (« MME ») : un détecteur propose
   * « Signé Hugo SAVEL », le point de passage `filter.ts` ne voit rien à redire (la
   * valeur ENTIÈRE est bien un nom), et l'alias par mot naît quand même — après quoi
   * `applyVault` redacted CHAQUE « signé » de la conversation.
   */
  it("« Signé Hugo SAVEL » n'aliase pas « signé »", async () => {
    const vault: Record<string, string> = {};
    await pseudonymize("Fait à Nantes, le 12 mars 2026. Signé Hugo SAVEL, Directeur", {
      vault,
      detectLocal: async () => [{ value: "Signé Hugo SAVEL", category: "NAME" }],
    });
    const vaulted = Object.values(vault).map((v) => v.toLowerCase());
    expect(vaulted).not.toContain("signé");
    // …et le NOM, lui, reste bien redacted avec ses deux vrais mots.
    expect(vaulted).toEqual(expect.arrayContaining(["hugo", "savel"]));
  });
});
