import { describe, expect, it } from "vitest";
import {
  effectiveMasking,
  loosensMasking,
  maskedCategories,
  overriddenConnectors,
  overridesMasking,
  type MaskingPolicy,
} from "./maskingPolicy";

/* The resolution rule, which both surfaces have to agree on: the LEVEL replaces, everything
   else ADDS. A connector that masked less than the run globally asked for would be a hole
   opened by a settings pane, so `disable` and `keep` are unions and cannot narrow. */
describe("a connector's effective masking", () => {
  const POLICY: MaskingPolicy = {
    level: "standard",
    disable: ["url"],
    keep: ["OpenMasq"],
    connectors: {
      filesystem: { level: "strict" },
      search: { disable: ["name", "company"] },
      notion: { keep: ["Notion"] },
      plain: {},
    },
  };

  it("follows the default when the connector says nothing", () => {
    expect(effectiveMasking(POLICY, "unlisted")).toEqual({
      level: "standard",
      disable: ["url"],
      keep: ["OpenMasq"],
    });
    expect(effectiveMasking(POLICY, "plain").level).toBe("standard");
  });

  it("lets a connector REPLACE the level — that is what its own level means", () => {
    expect(effectiveMasking(POLICY, "filesystem").level).toBe("strict");
    // …while still inheriting what the run set globally.
    expect(effectiveMasking(POLICY, "filesystem").disable).toEqual(["url"]);
  });

  /** The half that must never become an override: a pane that could narrow these would let
   *  a connector mask LESS than the run asked for. */
  it("ADDS the connector's disables and keeps to the run's, never replacing them", () => {
    expect(effectiveMasking(POLICY, "search").disable).toEqual(["url", "name", "company"]);
    expect(effectiveMasking(POLICY, "notion").keep).toEqual(["OpenMasq", "Notion"]);
  });

  it("says a value once even when both sides name it", () => {
    const p: MaskingPolicy = {
      level: "standard",
      disable: ["url"],
      connectors: { a: { disable: ["url", "name"] } },
    };
    expect(effectiveMasking(p, "a").disable).toEqual(["url", "name"]);
  });

  it("survives a policy with no connectors at all", () => {
    expect(effectiveMasking({ level: "renforce" }, "anything")).toEqual({
      level: "renforce",
      disable: [],
      keep: [],
    });
  });
});

describe("which connectors genuinely differ", () => {
  it("is true of a level, a disable or a keep — and false of an empty entry", () => {
    expect(overridesMasking({})).toBe(false);
    expect(overridesMasking({ disable: [] })).toBe(false); // declared, but says nothing
    expect(overridesMasking({ level: "strict" })).toBe(true);
    expect(overridesMasking({ disable: ["email"] })).toBe(true);
    expect(overridesMasking({ keep: ["Acme"] })).toBe(true);
  });

  /** A connector that differs in nothing must not get a masker of its own: two identical
   *  maskers mint two identities for one value, which un-redaction cannot reconcile. */
  it("lists only those a summary should show, in a stable order", () => {
    const p: MaskingPolicy = {
      level: "standard",
      connectors: { zed: { level: "strict" }, plain: {}, acme: { keep: ["Acme"] } },
    };
    expect(overriddenConnectors(p)).toEqual(["acme", "zed"]);
    expect(overriddenConnectors({ level: "standard" })).toEqual([]);
  });
});

/* The question a surface asks before applying a change it was handed. Asked on the SETS, not
   on the level name: a rule written on the name alone waves through a `strict` that just
   disabled a category, which is exactly the move a gate exists to catch. */
describe("does this change expose more than before", () => {
  it("is true of a lower level, false of a higher one", () => {
    expect(loosensMasking({ level: "strict" }, { level: "standard" })).toBe(true);
    expect(loosensMasking({ level: "renforce" }, { level: "standard" })).toBe(true);
    expect(loosensMasking({ level: "standard" }, { level: "strict" })).toBe(false);
    expect(loosensMasking({ level: "standard" }, { level: "standard" })).toBe(false);
  });

  /** The move a level-name comparison misses entirely. */
  it("is true of a category newly left in clear, at the SAME level", () => {
    expect(loosensMasking({ level: "strict" }, { level: "strict", disable: ["email"] })).toBe(true);
    // …and false the other way: taking a disable away protects more.
    expect(loosensMasking({ level: "strict", disable: ["email"] }, { level: "strict" })).toBe(
      false,
    );
  });

  it("is true of a value newly kept in clear", () => {
    const at = { level: "renforce" } as const;
    expect(loosensMasking(at, { ...at, keep: ["Acme"] })).toBe(true);
    expect(loosensMasking({ ...at, keep: ["Acme"] }, at)).toBe(false);
  });

  /** A trade — one level down, one disable removed — must not read as neutral just because
   *  the two moves cancel in a count. Anything that was masked and no longer is counts. */
  it("sees a category dropped even when another is picked up", () => {
    expect(loosensMasking({ level: "strict" }, { level: "renforce", disable: [] })).toBe(true);
  });

  it("counts the credential floor as never lost — no level can drop it", () => {
    for (const level of ["standard", "renforce", "strict"] as const)
      for (const key of ["apikey", "secret"])
        expect(maskedCategories({ level }).has(key)).toBe(true);
  });
});
