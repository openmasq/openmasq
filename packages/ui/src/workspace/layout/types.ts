/**
 * Workspace layout types — a recursive split tree for the tiling chat workspace
 * (split the screen however you want: any pane split row/column, conversations
 * moved between panes, resizable). A node is a LEAF (a pane = ordered open
 * conversations + the active one) or a SPLIT (a row/column of ≥2 sized children).
 */

export type PaneId = string;

export interface LeafPane {
  kind: "leaf";
  id: PaneId;
  /** Conversation ids open in this pane, in tab order. */
  tabs: string[];
  /** The focused tab within this pane (a member of `tabs`, or null when empty). */
  activeTab: string | null;
}

export interface SplitNode {
  kind: "split";
  id: PaneId;
  /** "row" = children side by side (a vertical divider); "column" = stacked. */
  direction: "row" | "column";
  children: LayoutNode[];
  /** Size fraction per child (same length as `children`, sums to ~1). */
  sizes: number[];
}

export type LayoutNode = LeafPane | SplitNode;

export interface WorkspaceLayout {
  root: LayoutNode;
  /** Id of the focused LEAF — drives the global `activeId` (sidebar / ⌘K / new). */
  focusedPane: PaneId;
}
