import { type ReactNode } from "react";
import type { PanelItem } from "../../state/redux";
import { PanelTabs } from "./PanelTabs";

import { useT } from "../../i18n";
/**
 * THE side panel — the right half of the screen, shared by the chats and the
 * bibliothèque (its state lives in the `panel` slice, so it survives section
 * switches). DOCUMENTS (files + artifacts) are switched from a conversation-style
 * tab strip at the TOP here (`PanelTabs`); the agent BROWSER is switched from the
 * RightRail instead. The CONTENT is injected by the shell (`renderContent`), so this
 * stays chrome with no knowledge of file viewers.
 *
 * The strip sits ABOVE `.side-panel-body` on purpose: the browser is an alwaysOnTop
 * native window whose bounds are anchored to the body, so the strip stays visible and
 * clickable even while the browser holds the panel — letting the user switch to a
 * document (which hides the browser) without going through the rail.
 */
export function SidePanel({
  items,
  activeId,
  renderContent,
  onSelect,
  onCloseItem,
  onOpenFile,
}: {
  items: PanelItem[];
  activeId: string | null;
  renderContent: (item: PanelItem) => ReactNode;
  onSelect: (id: string) => void;
  onCloseItem: (id: string) => void;
  onOpenFile: () => void;
}) {
  const t = useT();
  const active = items.find((i) => i.id === activeId) ?? items[items.length - 1] ?? null;
  const docItems = items.filter((i) => i.kind !== "browser");
  const docActiveId = active && active.kind !== "browser" ? active.id : null;
  return (
    <aside className="side-panel" aria-label={t.shell.panelTabs.sidePanel}>
      {docItems.length > 0 && (
        <PanelTabs
          items={docItems}
          activeId={docActiveId}
          onSelect={onSelect}
          onClose={onCloseItem}
          onOpenFile={onOpenFile}
        />
      )}
      <div className="side-panel-body">{active ? renderContent(active) : null}</div>
    </aside>
  );
}
