/**
 * Pure operations on a {@link WorkspaceLayout}. Each is `(layout, …) → layout`.
 * No ids are minted here — callers pass pre-generated ids (`newPaneId`) so every
 * op is deterministic + unit-testable.
 */
import type { LeafPane, SplitNode, WorkspaceLayout } from "./types";
import { collapse, detach, findLeaf, fixFocus, leaves, mapLeaf, paneOfTab, renorm } from "./tree";
import { isChatRef, tabKind, tabRefId } from "./tabRef";

export function focusPane(layout: WorkspaceLayout, paneId: string): WorkspaceLayout {
  return findLeaf(layout, paneId) ? { ...layout, focusedPane: paneId } : layout;
}

/** Make `convId` the active tab of its pane and focus that pane. No-op if absent. */
export function setActiveTab(layout: WorkspaceLayout, paneId: string, convId: string): WorkspaceLayout {
  if (!findLeaf(layout, paneId)?.tabs.includes(convId)) return layout;
  const root = mapLeaf(layout.root, paneId, (l) => ({ ...l, activeTab: convId }));
  return { root, focusedPane: paneId };
}

/**
 * Show the WELCOME state in the focused pane: no active tab, tabs kept.
 *
 * This is what « Nouvelle conversation » does — it no longer mints a conversation
 * (that happens at the FIRST SEND, in the pane's `onSend`), it deselects. A leaf with
 * `activeTab: null` is already a legal state (the sole root leaf may be empty — the
 * welcome screen), this op just reaches it deliberately from a pane that has tabs.
 * Clicking any tab (`setActiveTab`) leaves it again.
 */
export function showWelcome(layout: WorkspaceLayout): WorkspaceLayout {
  const root = mapLeaf(layout.root, layout.focusedPane, (l) => ({ ...l, activeTab: null }));
  return { root, focusedPane: layout.focusedPane };
}

/**
 * Open a conversation: if it is already open anywhere, focus that pane+tab;
 * otherwise append it to `paneId` (default: the focused pane) and activate it.
 */
export function openTab(layout: WorkspaceLayout, convId: string, paneId?: string): WorkspaceLayout {
  const existing = paneOfTab(layout, convId);
  if (existing) return setActiveTab(layout, existing.id, convId);
  const target = paneId && findLeaf(layout, paneId) ? paneId : layout.focusedPane;
  const root = mapLeaf(layout.root, target, (l) => ({
    ...l,
    tabs: [...l.tabs, convId],
    activeTab: convId,
  }));
  return { root, focusedPane: target };
}

/** Close a tab in a pane; drop + collapse the pane if it empties. */
export function closeTab(layout: WorkspaceLayout, paneId: string, convId: string): WorkspaceLayout {
  const root = collapse(
    mapLeaf(layout.root, paneId, (l) => {
      if (!l.tabs.includes(convId)) return l;
      const tabs = l.tabs.filter((t) => t !== convId);
      const activeTab = l.activeTab === convId ? (tabs[tabs.length - 1] ?? null) : l.activeTab;
      return { ...l, tabs, activeTab };
    }),
  );
  return fixFocus(root, layout.focusedPane);
}

/** Remove a conversation from the whole layout (it was deleted). */
export function removeConversation(layout: WorkspaceLayout, convId: string): WorkspaceLayout {
  const pane = paneOfTab(layout, convId);
  return pane ? closeTab(layout, pane.id, convId) : layout;
}

/**
 * Move a conversation into `toPane` at `toIndex` (default: end), removing it from
 * its current pane and collapsing that pane if it empties. Activates + focuses the
 * destination.
 */
export function moveTab(
  layout: WorkspaceLayout,
  args: { convId: string; toPane: string; toIndex?: number },
): WorkspaceLayout {
  const { convId, toPane, toIndex } = args;
  if (!findLeaf(layout, toPane)) return layout;
  const from = paneOfTab(layout, convId);
  if (from && from.id === toPane) {
    // Reorder within the same pane.
    const root = mapLeaf(layout.root, toPane, (l) => {
      const without = l.tabs.filter((t) => t !== convId);
      const at = toIndex == null ? without.length : Math.max(0, Math.min(toIndex, without.length));
      without.splice(at, 0, convId);
      return { ...l, tabs: without, activeTab: convId };
    });
    return { root, focusedPane: toPane };
  }
  const inserted = mapLeaf(detach(layout.root, convId), toPane, (l) => {
    const at = toIndex == null ? l.tabs.length : Math.max(0, Math.min(toIndex, l.tabs.length));
    const tabs = l.tabs.slice();
    tabs.splice(at, 0, convId);
    return { ...l, tabs, activeTab: convId };
  });
  return fixFocus(collapse(inserted), toPane);
}

/**
 * Split `targetPane` and drop `convId` into a NEW leaf beside it (drag-a-tab-to-
 * the-edge, or the "diviser" menu). `direction` = row (side by side) / column
 * (stacked); `position` = which side the new pane lands. The conversation is
 * removed from its current pane (collapsed if it empties). No-op if it would just
 * re-create the same single pane (dragging a lone tab onto its own pane's edge).
 */
export function splitWithTab(
  layout: WorkspaceLayout,
  args: {
    targetPane: string;
    convId: string;
    direction: "row" | "column";
    position: "before" | "after";
    newPaneId: string;
  },
): WorkspaceLayout {
  const { targetPane, convId, direction, position, newPaneId } = args;
  const target = findLeaf(layout, targetPane);
  if (!target) return layout;
  const from = paneOfTab(layout, convId);
  if (from && from.id === targetPane && target.tabs.length < 2) return layout;

  const newLeaf: LeafPane = { kind: "leaf", id: newPaneId, tabs: [convId], activeTab: convId };
  const withSplit = mapLeaf(detach(layout.root, convId), targetPane, (l) => {
    const split: SplitNode = {
      kind: "split",
      id: newPaneId + "-s",
      direction,
      children: position === "before" ? [newLeaf, l] : [l, newLeaf],
      sizes: [0.5, 0.5],
    };
    return split;
  });
  return fixFocus(collapse(withSplit), newPaneId);
}

/** Set the size fractions of a split node (from a gutter drag). */
export function resizeSplit(layout: WorkspaceLayout, splitId: string, sizes: number[]): WorkspaceLayout {
  const walk = (node: WorkspaceLayout["root"]): WorkspaceLayout["root"] => {
    if (node.kind === "leaf") return node;
    if (node.id === splitId && sizes.length === node.children.length) {
      return { ...node, sizes: renorm(sizes) };
    }
    return { ...node, children: node.children.map(walk) };
  };
  return { ...layout, root: walk(layout.root) };
}

/**
 * Drop conversations that no longer exist (deleted / not loaded yet), collapse
 * emptied panes, and repair `activeTab` / `focusedPane`. Returns a valid layout;
 * if everything is gone, a single empty leaf (reusing a live pane id).
 */
export function pruneLayout(layout: WorkspaceLayout, existing: Set<string>): WorkspaceLayout {
  const scrub = (node: WorkspaceLayout["root"]): WorkspaceLayout["root"] => {
    if (node.kind === "leaf") {
      // Only CHAT tabs are pruned against the live-conversation set; browser/artifact
      // tabs aren't conversations, so they're always kept (their own lifecycle owns them).
      const tabs = node.tabs.filter((t) => !isChatRef(t) || existing.has(tabRefId(t)));
      const activeTab = node.activeTab && tabs.includes(node.activeTab)
        ? node.activeTab
        : (tabs[tabs.length - 1] ?? null);
      return { ...node, tabs, activeTab };
    }
    return { ...node, children: node.children.map(scrub) };
  };
  return fixFocus(collapse(scrub(layout.root)), layout.focusedPane);
}

// Re-export the read helpers callers need alongside the ops.
export { activeConvId, allOpenConvIds, emptyLayout, findLeaf, leaves, paneOfTab } from "./tree";

/** Strip every `file:` ref from a restored layout (their display meta is session-only). */
export function pruneFileRefs(layout: WorkspaceLayout): WorkspaceLayout {
  const scrub = (node: WorkspaceLayout["root"]): WorkspaceLayout["root"] => {
    if (node.kind === "leaf") {
      const tabs = node.tabs.filter((r) => tabKind(r) !== "file");
      const activeTab = node.activeTab && tabs.includes(node.activeTab) ? node.activeTab : (tabs[tabs.length - 1] ?? null);
      return { ...node, tabs, activeTab };
    }
    return { ...node, children: node.children.map(scrub) };
  };
  return { ...layout, root: scrub(layout.root) };
}
