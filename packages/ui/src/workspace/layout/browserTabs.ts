import type { LayoutNode, LeafPane, WorkspaceLayout } from "./types";
import { browserRef, tabKind } from "./tabRef";

/** Rewrite every leaf in the tree through `fn`. */
function mapLeaves(node: LayoutNode, fn: (leaf: LeafPane) => LeafPane): LayoutNode {
  if (node.kind === "leaf") return fn(node);
  return { ...node, children: node.children.map((c) => mapLeaves(c, fn)) };
}

/** All tab refs across the whole tree, in leaf order. */
function allTabRefs(node: LayoutNode): string[] {
  return node.kind === "leaf" ? node.tabs : node.children.flatMap(allTabRefs);
}

/** Any `browser:` ref anywhere in the tree — the "browser is open as a tab" signal. */
export function hasBrowserTab(layout: WorkspaceLayout): boolean {
  return allTabRefs(layout.root).some((r) => tabKind(r) === "browser");
}

/**
 * STAGE 2 (unified tabs) — reconcile the agent browser's LIVE child tab ids into the
 * layout so browser tabs live in the same pane strips as chat conversations.
 *
 * Pure + idempotent, chat/artifact refs UNTOUCHED. It:
 *  - DROPS every `browser:<id>` ref whose id is no longer in `liveTabIds` (the child
 *    closed it) — re-anchoring a leaf's `activeTab` if the dropped ref was active;
 *  - ADDS a `browser:<id>` ref (appended to pane `targetPaneId`) for each live id not
 *    already present in ANY pane (a tab opened by the user / a `window.open` / the MODEL
 *    over CDP — mirrored 1:1 from `host.browser.onTabs`).
 *
 * The child browser is the SOURCE OF TRUTH for the SET of browser tabs; this only mirrors
 * it into the layout. Nothing here touches web content — a `browser:` ref is pure metadata
 * (the id); its title/url are resolved live from the same `onTabs` report at render time.
 */
export function reconcileBrowserTabs(
  layout: WorkspaceLayout,
  liveTabIds: readonly string[],
  targetPaneId: string,
): WorkspaceLayout {
  const liveRefs = new Set(liveTabIds.map(browserRef));

  // 1. Drop stale browser refs (id no longer live). Keep chat/artifact + live browser refs.
  let root = mapLeaves(layout.root, (leaf) => {
    const tabs = leaf.tabs.filter((ref) => tabKind(ref) !== "browser" || liveRefs.has(ref));
    if (tabs.length === leaf.tabs.length) return leaf;
    const activeTab =
      leaf.activeTab && tabs.includes(leaf.activeTab) ? leaf.activeTab : (tabs[tabs.length - 1] ?? null);
    return { ...leaf, tabs, activeTab };
  });

  // 2. Append any live browser ref not present in ANY pane into `targetPaneId`.
  const present = new Set(allTabRefs(root).filter((r) => tabKind(r) === "browser"));
  const toAdd = [...liveRefs].filter((r) => !present.has(r));
  if (toAdd.length) {
    let added = false;
    root = mapLeaves(root, (leaf) => {
      if (leaf.id !== targetPaneId || added) return leaf;
      added = true;
      return { ...leaf, tabs: [...leaf.tabs, ...toAdd] };
    });
  }

  return root === layout.root ? layout : { ...layout, root };
}
