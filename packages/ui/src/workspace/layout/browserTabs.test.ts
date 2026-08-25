import { describe, it, expect } from "vitest";
import { hasBrowserTab, reconcileBrowserTabs } from "./browserTabs";
import { browserRef, chatRef } from "./tabRef";
import type { LayoutNode, WorkspaceLayout } from "./types";

const leaf = (id: string, tabs: string[], activeTab: string | null = tabs[tabs.length - 1] ?? null): LayoutNode => ({
  kind: "leaf",
  id,
  tabs,
  activeTab,
});
const layout = (root: LayoutNode): WorkspaceLayout => ({ root, focusedPane: "p1" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asLeaf = (n: LayoutNode): any => n;

describe("reconcileBrowserTabs (unified-tabs stage 2)", () => {
  it("adds a browser ref for a new live child tab, into the target pane", () => {
    const out = reconcileBrowserTabs(layout(leaf("p1", [chatRef("A")])), ["b1"], "p1");
    expect(asLeaf(out.root).tabs).toEqual([chatRef("A"), browserRef("b1")]);
  });

  it("drops a browser ref whose id is no longer live + re-anchors activeTab", () => {
    const l = layout(leaf("p1", [chatRef("A"), browserRef("b1")], browserRef("b1")));
    const out = reconcileBrowserTabs(l, [], "p1");
    expect(asLeaf(out.root).tabs).toEqual([chatRef("A")]);
    expect(asLeaf(out.root).activeTab).toBe(chatRef("A")); // active browser tab gone → last remaining
  });

  it("leaves chat refs untouched (returns the SAME layout when nothing changes)", () => {
    const l = layout(leaf("p1", [chatRef("A"), chatRef("B")]));
    const out = reconcileBrowserTabs(l, [], "p1");
    expect(out).toBe(l); // no browser refs to add/remove → identity
  });

  it("is idempotent", () => {
    const once = reconcileBrowserTabs(layout(leaf("p1", [chatRef("A")])), ["b1"], "p1");
    expect(reconcileBrowserTabs(once, ["b1"], "p1")).toEqual(once);
  });

  it("does not duplicate a live browser ref already present in another pane", () => {
    const root: LayoutNode = {
      kind: "split",
      id: "s",
      direction: "row",
      children: [leaf("p1", [chatRef("A")]), leaf("p2", [browserRef("b1")])],
      sizes: [0.5, 0.5],
    };
    const out = reconcileBrowserTabs(layout(root), ["b1"], "p1");
    expect(asLeaf(out.root).children[0].tabs).toEqual([chatRef("A")]);
    expect(asLeaf(out.root).children[1].tabs).toEqual([browserRef("b1")]);
  });

  it("hasBrowserTab sees a browser ref anywhere in the tree, and nothing else", () => {
    expect(hasBrowserTab(layout(leaf("p1", [chatRef("A")])))).toBe(false);
    const root: LayoutNode = {
      kind: "split",
      id: "s",
      direction: "row",
      children: [leaf("p1", [chatRef("A")]), leaf("p2", [browserRef("b1")])],
      sizes: [0.5, 0.5],
    };
    expect(hasBrowserTab(layout(root))).toBe(true);
  });
});
