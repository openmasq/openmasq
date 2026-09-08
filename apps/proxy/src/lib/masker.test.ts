import { describe, expect, it } from "vitest";
import { createMasker, disabledKindsFor, levelNeedsModel, tally } from "./masker";

// The engine on its pattern rules alone (no NER): what is pinned is the BINDING — a forced
// term is masked whatever the detectors say, a secret is erased, a level leaves kinds in clear.
const base = { keep: [], disabledKinds: [], forced: [], secrets: [] };

describe("masker", () => {
  it("masks a forced term (the Vault) even when no detector would flag it, reversibly", async () => {
    const m = createMasker({ ...base, forced: [{ value: "Groupe Delorme", category: "company" }] });
    const vault = {};
    const r = await m.mask("Merci au Groupe Delorme pour le lancement.", vault, "fake");
    expect(r.text).not.toContain("Groupe Delorme");
    expect(m.restoreReply(r.text, vault)).toBe("Merci au Groupe Delorme pour le lancement.");
  });

  it("erases a secret", async () => {
    const m = createMasker({ ...base, secrets: ["sk-live-abcdef123456"] });
    const r = await m.mask("token: sk-live-abcdef123456", {}, "token");
    expect(r.text).not.toContain("sk-live-abcdef123456");
  });

  it("derives the kinds a level leaves in clear from the catalogue, plus explicit disables", () => {
    const standard = disabledKindsFor("standard", []);
    expect(standard).toContain("name"); // free-form identity readable at the reduced level
    expect(standard).not.toContain("email");
    expect(disabledKindsFor("strict", [])).toEqual([]);
    expect(disabledKindsFor("renforce", ["email"])).toContain("email");
    expect(disabledKindsFor("renforce", [])).not.toContain("name");
  });

  it("leaves an email in clear when its kind is disabled", async () => {
    const m = createMasker({ ...base, disabledKinds: ["email"] });
    const r = await m.mask("Écrivez à camille.roussel@exemple.fr", {}, "fake");
    expect(r.text).toContain("camille.roussel@exemple.fr");
  });

  it("only asks for the on-device model when a level wants a category it alone finds", () => {
    // `standard` is the deterministic floor: nothing here needs the model, so nothing loads.
    expect(levelNeedsModel("standard", [])).toBe(false);
    expect(levelNeedsModel("renforce", [])).toBe(true);
    expect(levelNeedsModel("strict", [])).toBe(true);
    // ...and disabling every model-only category by hand takes the need away too.
    expect(levelNeedsModel("strict", ["name", "dob", "address", "location", "company"])).toBe(
      false,
    );
  });

  it("folds a detector's raw label onto the engine's category, so nothing is counted twice", () => {
    const m = (category: string) =>
      ({ type: "x", value: "v", placeholder: "p", category }) as never;
    expect(tally([m("ORG"), m("COMPANY"), m("EMAIL")])).toEqual({ COMPANY: 2, EMAIL: 1 });
  });
});
