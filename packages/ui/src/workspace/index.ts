/** Tiling chat workspace — recursive split layout + its renderer. */
export * from "./layout";
export { WorkspaceView, newPaneId, type WorkspaceViewProps } from "./WorkspaceView";
export { WorkspaceGutter } from "./WorkspaceGutter";
/** For a tab strip that wants to render the in-flight tab differently. Null = no
 *  DnD provider (single pane / mobile), which is the supported state. */
export { useWorkspaceDnd } from "./WorkspaceDnd";
