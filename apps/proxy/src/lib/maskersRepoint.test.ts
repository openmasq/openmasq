import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../config/config";
import { createMaskerSet } from "./maskers";

/* A level can move while the proxy runs -- the `l` key already does it globally, and a
   connector's own level is about to be changeable from the console. `repoint` is how that
   reaches the maskers, and the thing it must never do is hand out a NEW masker. */
const CONFIG = {
  ...DEFAULTS,
  level: "standard" as const,
  keep: ["OpenMasq"],
  disabledKinds: ["url"],
};

describe("re-pointing the per-server maskers", () => {
  it("gives a server its own masker only when its entry shapes one", () => {
    const set = createMaskerSet(CONFIG, {
      notion: { level: "strict" },
      github: { source: "client" }, // whose server it is -- not how it is masked
    });
    expect(set.forServer("notion")).not.toBe(set.masker);
    expect(set.forServer("github")).toBe(set.masker);
    expect(set.levelOf("notion")).toBe("strict");
    expect(set.levelOf("github")).toBe("standard");
  });

  /**
   * THE invariant. A masker reads its options at request time, so mutating them applies to
   * the next call and to nothing in flight. Handing out a fresh masker instead would leave a
   * request already inside the old one writing to a vault the next one does not know, and the
   * value would come back with a fake nothing can reverse.
   */
  it("mutates the options a server's masker already holds, never replaces the masker", () => {
    const set = createMaskerSet(CONFIG, { notion: { level: "strict" } });
    const before = set.forServer("notion");
    expect(set.repoint({ notion: { level: "renforce" } })).toEqual(["notion"]);
    expect(set.forServer("notion")).toBe(before);
    expect(set.levelOf("notion")).toBe("renforce");
  });

  it("reports only what actually moved, so a rewritten file says nothing", () => {
    const set = createMaskerSet(CONFIG, { notion: { level: "strict" } });
    expect(set.repoint({ notion: { level: "strict" } })).toEqual([]);
    // …the same masking, said with a key that does not change masking.
    expect(set.repoint({ notion: { level: "strict", source: "openmasq" } })).toEqual([]);
  });

  it("adds a server that gained an override, and drops one that lost it", () => {
    const set = createMaskerSet(CONFIG, {});
    expect(set.forServer("notion")).toBe(set.masker);
    expect(set.repoint({ notion: { level: "strict" } })).toEqual(["notion"]);
    expect(set.forServer("notion")).not.toBe(set.masker);
    // Back to following the run: the entry stays, but nothing in it shapes a masker.
    expect(set.repoint({ notion: { source: "openmasq" } })).toEqual(["notion"]);
    expect(set.forServer("notion")).toBe(set.masker);
    expect(set.levelOf("notion")).toBe("standard");
  });

  it("drops a server whose entry disappeared entirely", () => {
    const set = createMaskerSet(CONFIG, { notion: { level: "strict" } });
    expect(set.repoint({})).toEqual(["notion"]);
    expect(set.forServer("notion")).toBe(set.masker);
  });

  /** The run's own settings are not lost by a reload: a server's entry ADDS to them. */
  it("keeps composing the run's keeps and disables into every server", () => {
    const set = createMaskerSet(CONFIG, {});
    set.repoint({ notion: { level: "strict", keep: ["Notion"], disable: ["email"] } });
    const opts = set.optionsOf("notion");
    expect(opts?.keep).toEqual(["OpenMasq", "Notion"]);
    expect(opts?.disabledKinds).toContain("url"); // the run's
    expect(opts?.disabledKinds).toContain("email"); // the server's
  });

  /** Fail closed on the union: a server that needs the model makes the whole run need it. */
  it("still answers needsModel over every masker after a reload", () => {
    const set = createMaskerSet(CONFIG, {});
    expect(set.needsModel()).toBe(false); // standard everywhere
    set.repoint({ notion: { level: "strict" } });
    expect(set.needsModel()).toBe(true);
    set.repoint({});
    expect(set.needsModel()).toBe(false);
  });
});
