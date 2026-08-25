import { describe, it, expect } from "vitest";
import {
  activeConvId,
  allOpenConvIds,
  closeTab,
  deserializeLayout,
  emptyLayout,
  findLeaf,
  focusPane,
  leaves,
  moveTab,
  openTab,
  paneOfTab,
  pruneLayout,
  removeConversation,
  resizeSplit,
  serializeLayout,
  setActiveTab,
  showWelcome,
  splitWithTab,
  type SplitNode,
  type WorkspaceLayout,
} from "./index";

/** p1 = [A,B,C] (active C) split row into p1=[A,B] | p2=[C]. */
function twoPanes(): WorkspaceLayout {
  let l = emptyLayout("p1", "A");
  l = openTab(l, "B");
  l = openTab(l, "C");
  return splitWithTab(l, {
    targetPane: "p1",
    convId: "C",
    direction: "row",
    position: "after",
    newPaneId: "p2",
  });
}

/** Assert a conversation appears in at most one leaf. */
function assertNoDupes(l: WorkspaceLayout) {
  const all = allOpenConvIds(l);
  expect(new Set(all).size).toBe(all.length);
}

describe("workspace layout — open / activate / focus", () => {
  it("seeds a single pane and appends tabs to the focused pane", () => {
    let l = emptyLayout("p1", "A");
    expect(activeConvId(l)).toBe("A");
    l = openTab(l, "B");
    expect(findLeaf(l, "p1")!.tabs).toEqual(["A", "B"]);
    expect(activeConvId(l)).toBe("B");
  });

  it("opening an already-open conversation focuses its pane instead of duplicating", () => {
    let l = twoPanes(); // p1=[A,B], p2=[C], focus p2
    l = openTab(l, "A"); // A already in p1
    expect(l.focusedPane).toBe("p1");
    expect(activeConvId(l)).toBe("A");
    assertNoDupes(l);
    // p2 still holds only C.
    expect(findLeaf(l, "p2")!.tabs).toEqual(["C"]);
  });

  it("setActiveTab / focusPane are no-ops for unknown targets", () => {
    const l = twoPanes();
    expect(setActiveTab(l, "p1", "Z")).toBe(l); // Z not in p1
    expect(focusPane(l, "ghost")).toBe(l);
  });

  it("showWelcome deselects the focused pane's tab, keeping its tabs", () => {
    // « Nouvelle conversation » : the pane shows the welcome (no active conv), the
    // conversation is minted at the FIRST SEND — never at the click. The tabs stay:
    // deselecting is not closing, and any tab click leaves the welcome again.
    let l = twoPanes(); // p1=[A,B], p2=[C], focus p2
    l = showWelcome(l);
    expect(activeConvId(l)).toBeNull();
    expect(findLeaf(l, "p2")!.tabs).toEqual(["C"]);
    expect(findLeaf(l, "p2")!.activeTab).toBeNull();
    // The OTHER pane is untouched — welcome is per-pane, not global.
    expect(findLeaf(l, "p1")!.activeTab).not.toBeNull();
    // A tab click restores it.
    l = setActiveTab(l, "p2", "C");
    expect(activeConvId(l)).toBe("C");
  });
});

describe("workspace layout — split", () => {
  it("splits a pane into a row and focuses the new pane", () => {
    const l = twoPanes();
    expect(l.root.kind).toBe("split");
    const root = l.root as SplitNode;
    expect(root.direction).toBe("row");
    expect(root.sizes).toEqual([0.5, 0.5]);
    expect(findLeaf(l, "p1")!.tabs).toEqual(["A", "B"]);
    expect(findLeaf(l, "p1")!.activeTab).toBe("B"); // C left, active fell back to B
    expect(findLeaf(l, "p2")!.tabs).toEqual(["C"]);
    expect(l.focusedPane).toBe("p2");
    assertNoDupes(l);
  });

  it("respects position: before puts the new pane first", () => {
    let l = emptyLayout("p1", "A");
    l = openTab(l, "B");
    l = splitWithTab(l, { targetPane: "p1", convId: "B", direction: "column", position: "before", newPaneId: "p2" });
    const root = l.root as SplitNode;
    expect(root.direction).toBe("column");
    expect((leaves(root)[0]).id).toBe("p2"); // new pane rendered first
  });

  it("is a no-op when splitting a lone-tab pane onto its own edge", () => {
    const l = emptyLayout("p1", "A"); // only A
    const after = splitWithTab(l, { targetPane: "p1", convId: "A", direction: "row", position: "after", newPaneId: "p2" });
    expect(after).toBe(l);
  });
});

describe("workspace layout — move + collapse", () => {
  it("moves a tab between panes and collapses the emptied source", () => {
    let l = twoPanes(); // p1=[A,B], p2=[C]
    l = moveTab(l, { convId: "C", toPane: "p1" }); // p2 empties
    expect(l.root.kind).toBe("leaf"); // split collapsed
    expect(findLeaf(l, "p1")!.tabs).toEqual(["A", "B", "C"]);
    expect(l.focusedPane).toBe("p1");
    assertNoDupes(l);
  });

  it("reorders within a pane", () => {
    let l = emptyLayout("p1", "A");
    l = openTab(l, "B");
    l = openTab(l, "C"); // [A,B,C]
    l = moveTab(l, { convId: "C", toPane: "p1", toIndex: 0 });
    expect(findLeaf(l, "p1")!.tabs).toEqual(["C", "A", "B"]);
  });

  it("moves a tab into another pane at an index without duplicating", () => {
    let l = twoPanes(); // p1=[A,B], p2=[C]
    l = moveTab(l, { convId: "A", toPane: "p2", toIndex: 0 }); // p1 keeps [B]
    expect(findLeaf(l, "p1")!.tabs).toEqual(["B"]);
    expect(findLeaf(l, "p2")!.tabs).toEqual(["A", "C"]);
    assertNoDupes(l);
  });
});

describe("workspace layout — close / remove", () => {
  it("closes a tab, keeping the pane while other tabs remain", () => {
    let l = twoPanes(); // p1=[A,B]
    l = closeTab(l, "p1", "A");
    expect(findLeaf(l, "p1")!.tabs).toEqual(["B"]);
    expect(l.root.kind).toBe("split"); // still two panes
  });

  it("collapses the pane + split when the last tab of a pane closes", () => {
    let l = twoPanes(); // p2=[C]
    l = closeTab(l, "p2", "C");
    expect(l.root.kind).toBe("leaf");
    expect(findLeaf(l, "p1")!.tabs).toEqual(["A", "B"]);
    expect(l.focusedPane).toBe("p1"); // focus repaired off the dead p2
  });

  it("keeps a single empty root leaf when the very last tab closes", () => {
    let l = emptyLayout("p1", "A");
    l = closeTab(l, "p1", "A");
    expect(l.root).toMatchObject({ kind: "leaf", tabs: [], activeTab: null });
    expect(activeConvId(l)).toBeNull();
  });

  it("removeConversation drops a deleted conversation wherever it lives", () => {
    let l = twoPanes();
    l = removeConversation(l, "C"); // was the only tab of p2
    expect(paneOfTab(l, "C")).toBeUndefined();
    expect(l.root.kind).toBe("leaf"); // p2 collapsed
  });
});

describe("workspace layout — prune (boot / deleted convs)", () => {
  it("drops conversations that no longer exist and repairs active/focus", () => {
    let l = twoPanes(); // p1=[A,B] active B, p2=[C] focus p2
    l = pruneLayout(l, new Set(["A", "C"])); // B gone
    expect(findLeaf(l, "p1")!.tabs).toEqual(["A"]);
    expect(findLeaf(l, "p1")!.activeTab).toBe("A"); // B removed → fell back to A
    expect(findLeaf(l, "p2")!.tabs).toEqual(["C"]);
  });

  it("collapses a pane fully emptied by prune", () => {
    let l = twoPanes();
    l = pruneLayout(l, new Set(["A", "B"])); // C gone → p2 empties
    expect(l.root.kind).toBe("leaf");
    expect(l.focusedPane).toBe("p1");
  });

  it("yields a single empty leaf when everything is gone", () => {
    const l = pruneLayout(twoPanes(), new Set());
    expect(leaves(l.root)).toHaveLength(1);
    expect(activeConvId(l)).toBeNull();
  });
});

describe("workspace layout — resize", () => {
  it("sets and renormalises split sizes", () => {
    let l = twoPanes();
    const splitId = (l.root as SplitNode).id;
    l = resizeSplit(l, splitId, [3, 1]); // renormalised to 0.75 / 0.25
    expect((l.root as SplitNode).sizes).toEqual([0.75, 0.25]);
  });

  it("ignores a size array of the wrong length", () => {
    const l = twoPanes();
    const splitId = (l.root as SplitNode).id;
    const after = resizeSplit(l, splitId, [1, 1, 1]);
    expect((after.root as SplitNode).sizes).toEqual([0.5, 0.5]);
  });
});

describe("workspace layout — persistence", () => {
  it("round-trips a layout through serialize/deserialize (id migration idempotent)", () => {
    const l = twoPanes();
    // deserialize canonicalises a legacy BARE conv id (→ `chat:<id>`) exactly once, so the
    // round-trip is STABLE from the first normalised form onward (identity thereafter).
    const once = deserializeLayout(serializeLayout(l))!;
    expect(deserializeLayout(serializeLayout(once))).toEqual(once);
  });

  it("rejects malformed / non-JSON input", () => {
    expect(deserializeLayout(null)).toBeNull();
    expect(deserializeLayout("not json")).toBeNull();
    expect(deserializeLayout(JSON.stringify({ focusedPane: "p1" }))).toBeNull(); // no root
    // A malformed 1-child split (a well-formed layout never has one — collapse
    // prevents it) is rejected so the caller falls back to a fresh layout.
    expect(
      deserializeLayout(JSON.stringify({ root: { kind: "split", id: "s", direction: "row", children: [{ kind: "leaf", id: "p1", tabs: [], activeTab: null }], sizes: [1] }, focusedPane: "p1" })),
    ).toBeNull();
  });
});
