/** Workspace layout — recursive split tree for the tiling chat workspace. */
export type { LayoutNode, LeafPane, SplitNode, WorkspaceLayout } from "./types";
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
export {
  chatRef,
  isChatRef,
  tabRefId,
} from "./tabRef";
