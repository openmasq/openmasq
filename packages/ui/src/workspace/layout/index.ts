/** Workspace layout — recursive split tree for the tiling chat workspace. */
export type { LayoutNode, LeafPane, PaneId, SplitNode, WorkspaceLayout } from "./types";
export {
  activeConvId,
  allOpenConvIds,
  emptyLayout,
  findLeaf,
  leaves,
  paneOfTab,
} from "./tree";
export {
  closeTab,
  focusPane,
  moveTab,
  openTab,
  pruneLayout,
  pruneFileRefs,
  removeConversation,
  resizeSplit,
  setActiveTab,
  showWelcome,
  splitWithTab,
} from "./ops";
export { newPaneId } from "./paneId";
export { deserializeLayout, serializeLayout } from "./persist";
export { hasBrowserTab, reconcileBrowserTabs } from "./browserTabs";
export {
  artifactRef,
  browserRef, fileRef,
  chatRef,
  isChatRef,
  migrateTabId,
  tabKind,
  tabRefId,
  type TabKind,
} from "./tabRef";
