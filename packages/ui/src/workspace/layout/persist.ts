/** Persist / restore a {@link WorkspaceLayout} (localStorage), with validation. */
import type { LayoutNode, WorkspaceLayout } from "./types";
import { collapse, fixFocus } from "./tree";
import { isChatRef, migrateTabId } from "./tabRef";

/** Rewrite every leaf's `tabs`/`activeTab` through `fn` (dropping filtered-out tabs). */
function mapTabs(node: LayoutNode, fn: (tabs: string[]) => string[]): LayoutNode {
  if (node.kind === "leaf") {
    const tabs = fn(node.tabs);
    const activeTab = node.activeTab && tabs.includes(node.activeTab)
      ? node.activeTab
      : (tabs[tabs.length - 1] ?? null);
    return { ...node, tabs, activeTab };
  }
  return { ...node, children: node.children.map((c) => mapTabs(c, fn)) };
}

export function serializeLayout(layout: WorkspaceLayout): string {
  // Only CHAT tabs persist — browser tabs are ephemeral (the child browser re-spawns
  // empty) and artifacts are derived, so neither can be restored. Drop them + collapse
  // any pane left empty, so a reload doesn't resurrect a dead browser/artifact tab.
  const root = collapse(mapTabs(layout.root, (tabs) => tabs.filter(isChatRef)));
  return JSON.stringify(fixFocus(root, layout.focusedPane));
}

/** Validate a persisted layout; returns null on any structural problem so the
 *  caller can fall back to a fresh single-pane layout. */
export function deserializeLayout(raw: string | null | undefined): WorkspaceLayout | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const validNode = (n: unknown): n is LayoutNode => {
    if (!n || typeof n !== "object") return false;
    const node = n as Record<string, unknown>;
    if (node.kind === "leaf") {
      return typeof node.id === "string"
        && Array.isArray(node.tabs) && node.tabs.every((t) => typeof t === "string");
    }
    if (node.kind === "split") {
      return typeof node.id === "string"
        && (node.direction === "row" || node.direction === "column")
        && Array.isArray(node.children) && node.children.length >= 2
        && Array.isArray(node.sizes) && node.sizes.length === node.children.length
        && node.children.every(validNode);
    }
    return false;
  };
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.focusedPane !== "string" || !validNode(p.root)) return null;
  const layout = p as unknown as WorkspaceLayout;
  // MIGRATE pre-unification data: bare conv ids → `chat:<id>` (idempotent — new data is
  // already namespaced). Then drop any non-chat tab that slipped in (shouldn't, but
  // serialize filters them — belt-and-suspenders).
  const root = collapse(mapTabs(layout.root, (tabs) => tabs.map(migrateTabId).filter(isChatRef)));
  return fixFocus(root, layout.focusedPane);
}
