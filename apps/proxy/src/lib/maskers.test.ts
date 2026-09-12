import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../config/config";
import { createMaskerSet } from "./maskers";

describe("the run's maskers", () => {
  it("gives a server with a level of its own a masker of its own, and the others the chat's", () => {
    const set = createMaskerSet(
      { ...DEFAULTS, level: "standard", rulesOnly: true },
      { notion: { level: "strict", writes: "deny" }, github: { writes: "deny" } },
    );
    expect(set.forServer("notion")).not.toBe(set.masker);
    expect(set.forServer("github")).toBe(set.masker); // a write policy alone shapes no masker
    expect(set.forServer("unknown")).toBe(set.masker);
    expect(set.levelOf("notion")).toBe("strict");
    expect(set.levelOf("github")).toBe("standard");
  });

  it("asks for the on-device model when ANY masker of the set needs it — fail closed on the union", () => {
    expect(createMaskerSet({ ...DEFAULTS, level: "standard" }).needsModel()).toBe(false);
    expect(
      createMaskerSet(
        { ...DEFAULTS, level: "standard" },
        { notion: { level: "renforce" } },
      ).needsModel(),
    ).toBe(true);
    // …and the model, once loaded, reaches the chat's options (the servers' share the call).
    const set = createMaskerSet(
      { ...DEFAULTS, level: "standard" },
      { notion: { level: "strict" } },
    );
    const detect = async () => [];
    set.setDetect(detect);
    expect(set.global.detectLocal).toBe(detect);
  });

  it("adds a server's disables and keeps to the run's, never replaces them", async () => {
    const set = createMaskerSet(
      { ...DEFAULTS, level: "standard", disabledKinds: ["phone"], keep: ["Acme"] },
      { crm: { disable: ["email"], keep: ["Globex"] } },
    );
    const vault = {};
    const out = await set
      .forServer("crm")
      .mask(
        "Acme and Globex: +33 6 12 34 56 78, jean@ex.io, IBAN FR76 3000 6000 0112 3456 7890 189",
        vault,
        "fake",
      );
    expect(out.text).toContain("Acme");
    expect(out.text).toContain("Globex");
    expect(out.text).toContain("+33 6 12 34 56 78"); // the run's disable still applies
    expect(out.text).toContain("jean@ex.io"); // the server's disable adds to it
    expect(out.text).not.toContain("FR76 3000 6000 0112 3456 7890 189");
  });
});
