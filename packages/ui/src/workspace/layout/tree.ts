/**
 * Tree utilities + read helpers for the workspace layout. Internal transforms
 * (`mapLeaf`/`collapse`/`fixFocus`/`detach`) are shared by the operations and the
 * persistence validator; the read helpers are public.
 *
 * Invariants every op preserves: each SPLIT has ≥2 children with aligned `sizes`;
 * a conversation id lives in AT MOST one leaf; `focusedPane` names a live leaf; an
 * emptied non-root leaf is dropped + its split collapsed; the sole root leaf may be
 * empty (the welcome screen).
 */
import type { LayoutNode, LeafPane, WorkspaceLayout } from "./types";
import { isChatRef, tabRefId } from "./tabRef";

/** A single-leaf layout, optionally seeded with one conversation. */
export function emptyLayout(paneId: string, convId?: string | null): WorkspaceLayout {
  const leaf: LeafPane = {
    kind: "leaf",
    id: paneId,
    tabs: convId ? [convId] : [],
    activeTab: convId ?? null,
  };
  return { root: leaf, focusedPane: paneId };
}

/** All leaf panes, left-to-right / top-to-bottom. */
export function leaves(node: LayoutNode): LeafPane[] {
  return node.kind === "leaf" ? [node] : node.children.flatMap(leaves);
}

export function findLeaf(layout: WorkspaceLayout, paneId: string): LeafPane | undefined {
  return leaves(layout.root).find((l) => l.id === paneId);
}

/** The leaf currently holding a conversation (each conv is in at most one leaf). */
export function paneOfTab(layout: WorkspaceLayout, convId: string): LeafPane | undefined {
  return leaves(layout.root).find((l) => l.tabs.includes(convId));
}

/** Every open CONVERSATION id across all panes (a conv appears once). Browser /
 *  artifact tabs are NOT conversations, so they are excluded and the ids are returned
 *  de-namespaced — this feeds the store's prune-vs-loaded-conversations. */
export function allOpenConvIds(layout: WorkspaceLayout): string[] {
  return leaves(layout.root)
    .flatMap((l) => l.tabs)
    .filter(isChatRef)
    .map(tabRefId);
}

/** The focused pane's active CONVERSATION — the workspace's global "active" (drives the
 *  store's `activeId`). Null when the focused pane's active tab is a browser/artifact tab
 *  (there's no active conversation then). */
export function activeConvId(layout: WorkspaceLayout): string | null {
  const t = findLeaf(layout, layout.focusedPane)?.activeTab;
  return t && isChatRef(t) ? tabRefId(t) : null;
}

/** Replace the leaf `paneId` with `fn(leaf)` (structure otherwise untouched). */
export function mapLeaf(node: LayoutNode, paneId: string, fn: (l: LeafPane) => LayoutNode): LayoutNode {
  if (node.kind === "leaf") return node.id === paneId ? fn(node) : node;
  return { ...node, children: node.children.map((c) => mapLeaf(c, paneId, fn)) };
}

export function renorm(sizes: number[]): number[] {
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (sum <= 0) return sizes.map(() => 1 / sizes.length);
  return sizes.map((s) => s / sum);
}

/**
 * Drop empty non-root leaves and collapse single-child splits, bottom-up,
 * renormalising sizes. The sole survivor may be an empty leaf (welcome screen).
 */
export function collapse(node: LayoutNode): LayoutNode {
  if (node.kind === "leaf") return node;
  const kept: LayoutNode[] = [];
  const keptSizes: number[] = [];
  node.children.forEach((raw, i) => {
    const c = collapse(raw);
    if (c.kind === "leaf" && c.tabs.length === 0) return; // reclaim an emptied pane
    kept.push(c);
    keptSizes.push(node.sizes[i] ?? 0);
  });
  if (kept.length === 0) {
    const first = leaves(node)[0];
    return { kind: "leaf", id: first?.id ?? node.id, tabs: [], activeTab: null };
  }
  if (kept.length === 1) return kept[0];
  return { ...node, children: kept, sizes: renorm(keptSizes) };
}

/** After a structural change, ensure `focusedPane` still names a live leaf. */
export function fixFocus(root: LayoutNode, preferred: string): WorkspaceLayout {
  const ls = leaves(root);
  const focusedPane = ls.some((l) => l.id === preferred) ? preferred : (ls[0]?.id ?? preferred);
  return { root, focusedPane };
}

/** Remove a conversation from whatever leaf holds it (no collapse). */
export function detach(root: LayoutNode, convId: string): LayoutNode {
  const pane = leaves(root).find((l) => l.tabs.includes(convId));
  if (!pane) return root;
  return mapLeaf(root, pane.id, (l) => {
    const tabs = l.tabs.filter((t) => t !== convId);
    const activeTab = l.activeTab === convId ? (tabs[tabs.length - 1] ?? null) : l.activeTab;
    return { ...l, tabs, activeTab };
  });
}
