import { describe, expect, it } from "vitest";
import { createMasker, disabledKindsFor, levelNeedsModel, tally, VENDOR_TERMS } from "./masker";

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
    // `standard` is pattern rules alone: a name or a company is NEVER masked there, in any
    // case — the level does not load the model that would find one.
    expect(standard).toContain("name");
    expect(standard).toContain("company");
    // …and no handle rule either: on source code and docs a leading `@` is `@file`, `@handle`,
    // a bot mention — measured at 28 of 42 substitutions on a run that read three CLAUDE.md.
    // The catalogue puts `username` on from `renforce` (`FROM_RENFORCE`, `levels.test.ts`).
    expect(standard).toContain("username");
    expect(disabledKindsFor("renforce", [])).not.toContain("username");
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

  /** A stub detector standing in for the on-device model: it tags what it is told to. */
  const tagging = (spans: { value: string; category: string }[]) => async () => spans;

  it("keeps the vendors' own names in clear at every level — they are nobody's data", async () => {
    expect(VENDOR_TERMS).toContain("Anthropic");
    const m = createMasker({
      ...base,
      level: "strict",
      detectLocal: tagging([
        { value: "Claude", category: "NAME" },
        { value: "Anthropic", category: "ORG" },
      ]),
    });
    const r = await m.mask("You are Claude, made by Anthropic.", {}, "fake");
    expect(r.text).toBe("You are Claude, made by Anthropic.");
  });

  it("spares a famous brand at renforce and masks it at strict — the level's own promise", async () => {
    const tagger = tagging([{ value: "Airbus", category: "ORG" }]);
    const renforce = await createMasker({ ...base, level: "renforce", detectLocal: tagger }).mask(
      "Le dossier Airbus est prêt.",
      {},
      "fake",
    );
    expect(renforce.text).toContain("Airbus");
    const strict = await createMasker({ ...base, level: "strict", detectLocal: tagger }).mask(
      "Le dossier Airbus est prêt.",
      {},
      "fake",
    );
    expect(strict.text).not.toContain("Airbus");
  });

  // The rule the per-server policies rest on: every masker writes the SAME session vault, and
  // a vault is replayed BEFORE anything is detected. So what a stricter source vaulted stays
  // masked in a chat whose level would never have found it — fragments included, both modes.
  it("keeps what a stricter pass vaulted masked in a standard-level pass — the vault outranks the level", async () => {
    for (const mode of ["fake", "token"] as const) {
      const vault = {};
      const key = "ab".repeat(32);
      // A tool result at strict (forced here: the test loads no model).
      const strict = createMasker({
        ...base,
        level: "strict",
        forced: [{ value: "Jean Dupont", category: "name" }],
      });
      const r1 = await strict.mask("Compte-rendu : Jean Dupont valide le devis.", vault, mode, key);
      expect(r1.text).not.toContain("Dupont");
      // The chat at standard — names are not even looked for — on the same vault.
      const standard = createMasker({
        ...base,
        level: "standard",
        disabledKinds: disabledKindsFor("standard", []),
      });
      const r2 = await standard.mask(
        "Jean est parti. DUPONT aussi. Jean Dupont revient demain.",
        vault,
        mode,
        key,
      );
      expect(r2.text, mode).not.toContain("Dupont");
      expect(r2.text, mode).not.toMatch(/\bJean\b/);
      // …and the reply comes back readable: the same vault reverses it.
      expect(standard.restoreReply(r2.text, vault)).toContain("Jean Dupont revient demain.");
    }
  });
});
