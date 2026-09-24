import { describe, expect, it } from "vitest";
import { overridesMasking } from "@openmasq/catalog";
import { withConnectorLevel } from "./connectorMasking";

/* "Default" is the ABSENCE of an override, and the clearing half is where that goes wrong:
   an entry left behind empty still reads as "this connector differs", and the pipeline then
   builds it a masker of its own that masks exactly like the shared one — two identical
   maskers, which mint two identities for one value. */
describe("setting a connector's level", () => {
  it("writes it, on an empty map", () => {
    expect(withConnectorLevel(undefined, "notion", "strict")).toEqual({
      notion: { level: "strict" },
    });
  });

  it("replaces it without touching the others", () => {
    const before = { notion: { level: "strict" as const }, github: { level: "renforce" as const } };
    expect(withConnectorLevel(before, "notion", "standard")).toEqual({
      notion: { level: "standard" },
      github: { level: "renforce" },
    });
  });

  /** ⚠️ The half that matters. */
  it("leaves NO entry behind when the pick is Default", () => {
    const after = withConnectorLevel({ notion: { level: "strict" } }, "notion", null);
    expect(after).toBeUndefined();
    // …and what it produced would not read as an override to the resolver either.
    expect(overridesMasking(after?.notion ?? {})).toBe(false);
  });

  it("empties the map itself rather than leaving {}", () => {
    expect(withConnectorLevel({}, "notion", null)).toBeUndefined();
    expect(withConnectorLevel(undefined, "notion", null)).toBeUndefined();
  });

  it("keeps the other connectors when one goes back to Default", () => {
    const before = { notion: { level: "strict" as const }, github: { level: "renforce" as const } };
    expect(withConnectorLevel(before, "notion", null)).toEqual({ github: { level: "renforce" } });
  });

  /** This surface offers the level and nothing else; dropping the rest would let a picker
   *  undo a policy it never showed. */
  it("carries disable and keep through untouched", () => {
    const before = { notion: { level: "strict" as const, disable: ["url"], keep: ["Acme"] } };
    expect(withConnectorLevel(before, "notion", "renforce")).toEqual({
      notion: { level: "renforce", disable: ["url"], keep: ["Acme"] },
    });
    // …and an entry that still says something survives a Default pick.
    expect(withConnectorLevel(before, "notion", null)).toEqual({
      notion: { disable: ["url"], keep: ["Acme"] },
    });
  });

  it("never mutates the map it was given", () => {
    const before = { notion: { level: "strict" as const } };
    withConnectorLevel(before, "notion", null);
    expect(before).toEqual({ notion: { level: "strict" } });
  });
});
