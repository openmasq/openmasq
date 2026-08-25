import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { ConvTab } from "../pages/ChatWorkspace/ConvTabs";
import type { LayoutNode, LeafPane, SplitNode, WorkspaceLayout } from "./layout";
import { focusPane, moveTab, resizeSplit, setActiveTab, splitWithTab, useAppDispatch, useAppSelector } from "../state/redux";
import { useChatSelector } from "../containers/providers/chatStore";
import { WorkspaceGutter } from "./WorkspaceGutter";
import { PaneDropHint, WorkspaceDndProvider, useWorkspaceDnd } from "./WorkspaceDnd";

import { newPaneId } from "./layout/paneId";

export { newPaneId };

export interface WorkspaceViewProps {
  /** Resolve a conversation id → its live tab metadata (title/logo/busy). */
  resolveTab: (convId: string) => ConvTab | null;
  /** Render a pane's body — a ChatView whose header shows the PANE's tabs (AppShell
   *  owns the ChatView + store wiring). `onTabPointerDown` starts a tab drag; null
   *  when splitting is disabled. The workspace only lays panes out + previews drops. */
  renderPane: (
    convId: string | null,
    paneId: string,
    focused: boolean,
    onTabPointerDown: ((id: string, e: ReactPointerEvent) => void) | undefined,
  ) => ReactNode;
  /** Allow drag-to-split / drag-to-move. Default true; the mobile shell passes false
   *  (no room to tile) so tabs aren't draggable and no drop overlay renders. */
  enableSplit?: boolean;
}

/** What the recursive renderers need: the public props PLUS the layout + its WRITE
 *  ops, which WorkspaceView now READS via a selector and DISPATCHES itself — no longer
 *  the 5 callbacks + `layout` drilled from AppShell (the read-selector/write-dispatch
 *  container pattern; these ops are pure redux layout mutations, no chat-store coupling). */
interface WsCtx extends WorkspaceViewProps {
  layout: WorkspaceLayout;
  onSelectTab: (paneId: string, convId: string) => void;
  onFocusPane: (paneId: string) => void;
  onResize: (splitId: string, sizes: number[]) => void;
  onMoveTab: (convId: string, toPane: string) => void;
  onSplit: (targetPane: string, convId: string, direction: "row" | "column", position: "before" | "after") => void;
}

/**
 * Recursive renderer for the tiling chat workspace. A SPLIT node becomes a flex
 * row/column whose children are proportionally sized (flex-grow = size fraction)
 * with a {@link WorkspaceGutter} between each; a LEAF becomes a framed pane with
 * its own {@link PaneTabs} strip + the AppShell-provided body. Dragging a tab shows
 * per-pane {@link PaneDropZones} (edge = split, centre = move). Purely structural —
 * it holds NO store/host state.
 */
export function WorkspaceView(props: WorkspaceViewProps) {
  const dispatch = useAppDispatch();
  // Read the layout + dispatch its writes HERE (container) instead of receiving the
  // layout + 5 callbacks drilled from AppShell. Behaviour is identical — the SAME
  // dispatches, relocated to where the workspace is actually rendered.
  const layout = useAppSelector((s) => s.ui.layout);
  // `setActiveId` is a STABLE store action read via the selector bridge (not drilled). Select
  // = layout dispatch + activeId in ONE handler so React 18 batches them (avoids the
  // layout→effect→setActiveId double render). Reading it via a selector re-renders nothing
  // (a stable function is Object.is-equal every time).
  const setActiveId = useChatSelector((s) => s.setActiveId);
  const ctx: WsCtx = {
    ...props,
    layout,
    onSelectTab: (paneId, convId) => {
      dispatch(setActiveTab({ paneId, convId }));
      setActiveId(convId);
    },
    onFocusPane: (paneId) => dispatch(focusPane(paneId)),
    onResize: (splitId, sizes) => dispatch(resizeSplit({ splitId, sizes })),
    onMoveTab: (convId, toPane) => dispatch(moveTab({ convId, toPane })),
    onSplit: (targetPane, convId, direction, position) =>
      dispatch(splitWithTab({ targetPane, convId, direction, position, newPaneId: newPaneId() })),
  };
  const tree = (
    <div className="ws-root">
      <Node node={ctx.layout.root} focusedPane={ctx.layout.focusedPane} p={ctx} />
    </div>
  );
  // No DnD provider ⇒ `useWorkspaceDnd()` is null ⇒ tabs aren't draggable and no drop
  // overlay renders (the mobile guard, and a clean "splitting off" mode).
  return props.enableSplit === false ? (
    tree
  ) : (
    <WorkspaceDndProvider onMove={ctx.onMoveTab} onSplit={ctx.onSplit}>
      {tree}
    </WorkspaceDndProvider>
  );
}

function Node({ node, focusedPane, p }: { node: LayoutNode; focusedPane: string; p: WsCtx }) {
  return node.kind === "leaf" ? (
    <Pane pane={node} focused={node.id === focusedPane} p={p} />
  ) : (
    <Split node={node} focusedPane={focusedPane} p={p} />
  );
}

function Split({ node, focusedPane, p }: { node: SplitNode; focusedPane: string; p: WsCtx }) {
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={containerRef} className={`ws-split ${node.direction}`}>
      {node.children
        .map((child, i) => (
          <div className="ws-cell" key={child.id} style={{ flexGrow: node.sizes[i] ?? 1, flexBasis: 0 } as CSSProperties}>
            <Node node={child} focusedPane={focusedPane} p={p} />
          </div>
        ))
        .flatMap((cell, i) =>
          i < node.children.length - 1
            ? [
                cell,
                <WorkspaceGutter
                  key={`g-${i}`}
                  direction={node.direction}
                  containerRef={containerRef}
                  sizes={node.sizes}
                  index={i}
                  onResize={(sizes) => p.onResize(node.id, sizes)}
                />,
              ]
            : [cell],
        )}
    </div>
  );
}

function Pane({ pane, focused, p }: { pane: LeafPane; focused: boolean; p: WsCtx }) {
  const dnd = useWorkspaceDnd();
  // The tabs render INSIDE the pane's ChatView header (one bar per pane); the
  // workspace only supplies the drag starter + the drop preview.
  const onTabPointerDown = dnd
    ? (id: string, e: ReactPointerEvent) => {
        if (!focused) p.onFocusPane(pane.id);
        const label = p.resolveTab(id)?.title ?? "Conversation";
        dnd.startTabDrag(id, label, e, () => p.onSelectTab(pane.id, id));
      }
    : undefined;
  return (
    <div
      className={`ws-pane${focused ? " focused" : ""}`}
      data-pane={pane.id}
      onMouseDownCapture={() => {
        if (!focused) p.onFocusPane(pane.id);
      }}
    >
      {p.renderPane(pane.activeTab, pane.id, focused, onTabPointerDown)}
      <PaneDropHint paneId={pane.id} />
    </div>
  );
}
