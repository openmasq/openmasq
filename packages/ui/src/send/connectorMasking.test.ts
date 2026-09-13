import { describe, expect, it } from "vitest";
import { categoriesForLevel, disabledKindsOf } from "@openmasq/catalog";
import { disabledKindsForTool } from "./toolResult";

/* A single level is the wrong grain for an app that reads the user's own files through one
   connector and a stranger's web page through another. A connector may therefore mask at ITS
   level; one that says nothing follows the global rules, which is what the overwhelming
   majority do. The resolution rule is `@openmasq/catalog`'s and is shared with the local
   proxy: the LEVEL replaces, `disable` ADDS. */
const GLOBAL = ["url", "date"];
const strictly = (level: "standard" | "renforce" | "strict") =>
  disabledKindsOf(categoriesForLevel(level));

describe("a connector masked at its own level", () => {
  it("follows the global rules when it says nothing", () => {
    expect(disabledKindsForTool(GLOBAL, "notion__search", {})).toEqual(GLOBAL);
    expect(disabledKindsForTool(GLOBAL, "notion__search", { github: { level: "strict" } })).toEqual(
      GLOBAL,
    );
  });

  it("REPLACES them with its level's own, when it has one", () => {
    const out = disabledKindsForTool(GLOBAL, "filesystem__read", {
      filesystem: { level: "strict" },
    });
    // Strict leaves nothing off, so the global `url`/`date` no longer apply to this connector.
    expect(out).toEqual(strictly("strict"));
    expect(out).not.toContain("date");
  });

  /**
   * ⚠️ The half that must never become an override. `disable` can only ADD to what is left in
   * clear; a connector that could narrow it would mask LESS than its own level says, which is
   * a hole opened from a settings pane.
   */
  it("ADDS its own disables to its level's, never narrowing them", () => {
    const out = disabledKindsForTool(GLOBAL, "search__web", {
      search: { level: "strict", disable: ["company"] },
    });
    expect(out).toContain("company");
    for (const kind of strictly("strict")) expect(out).toContain(kind);
  });

  it("still adds what the tool's own category earns in clear", () => {
    // A public web search keeps place/org readable — that policy is the connector category's,
    // and a per-connector level does not switch it off.
    const plain = disabledKindsForTool(GLOBAL, "exa__search");
    const levelled = disabledKindsForTool(GLOBAL, "exa__search", { exa: { level: "strict" } });
    for (const kind of plain.filter((k) => !GLOBAL.includes(k)))
      expect(levelled, `${kind} is the tool's clear policy`).toContain(kind);
  });

  it("says each kind once, however many sources name it", () => {
    const out = disabledKindsForTool(["company"], "exa__search", {
      exa: { level: "standard", disable: ["company"] },
    });
    expect(out.filter((k) => k === "company")).toHaveLength(1);
  });

  it("is keyed on the connector, not the tool — every tool of one server shares its level", () => {
    const policy = { notion: { level: "strict" as const } };
    const a = disabledKindsForTool(GLOBAL, "notion__search", policy);
    const b = disabledKindsForTool(GLOBAL, "notion__create_page", policy);
    expect(a).toEqual(b);
  });

  it("leaves a call with no tool exactly as it was", () => {
    expect(disabledKindsForTool(GLOBAL, undefined, { x: { level: "strict" } })).toEqual(GLOBAL);
  });
});
