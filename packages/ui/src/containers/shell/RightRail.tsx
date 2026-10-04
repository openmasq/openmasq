import type { ReactNode } from "react";
import type { AskTarget } from "../../types";
import { BrowserIcon, ExpandIcon, FolderIcon, PlusIcon } from "../../components/brand";
import { useLocalFsCapable } from "../../hooks/useLocalFsCapable";
import { FolderTreePanel } from "./folders/FolderTreePanel";
import { RailRow, RailSquare, FaviconTile } from "./RightRailParts";
import { RailFoot, type FootActions } from "./RightRailFoot";
import { useRailExpanded } from "./hooks/useRailExpanded";

import { useT } from "../../i18n";
/**
 * The RIGHT RAIL — the workspace's right-edge sidebar, a sibling of the left
 * `Rail`/`Sidebar` on the shell frame (mounted by `DesktopShell` in EVERY section).
 * Its MAIN job is agent-browser management — it lists the browser's REAL web tabs
 * (selecting switches the child's tab, ✕ closes it, the globe opens a new one).
 * Documents live in the `SidePanel`'s own `PanelTabs`, not here. Two widths: normal
 * (icon tabs) and expanded (a labelled list), REMEMBERED (`useRailExpanded`). Clicking
 * the ACTIVE browser tab collapses the panel (caller decides).
 *
 * ⚠️ `hostsPanel` false (Réglages, Mémoire, Coffre, Compétences — no side panel there):
 * the rail keeps only its FOOT (`RightRailFoot`: update, « Aide », « Envoyer un avis »)
 * and the Demandes bell. They used to vanish with the rail, and a waiting update or a
 * share request has no other door. Same width everywhere, so the frame doesn't jump.
 *
 * Once OPEN, it shows the TWO deposits stacked — the web tabs, then the file
 * sources (`FolderTreePanel`). They answer the same question, "what can I open next to
 * the conversation?", so making them exclusive always hid half the answer. A single
 * scrollbar for the two: two in 214 px is twice too many.
 *
 * Three things remain deliberate:
 *  · the folders group shows as soon as the PLATFORM is capable, including empty:
 *    that is exactly the user who needs inviting, and both invitations (grant a folder,
 *    connect a storage) live inside it. Only a platform WITHOUT the slot hides it;
 *  · a tree doesn't fit in the 44 px rail: this one keeps the tabs and a button that
 *    OPENS the panel, rather than a truncated stand-in;
 *  · open DOCUMENTS still don't live here — they switch from the panel's tab bar.
 */

/** One rail entry for a REAL browser web tab (labelled by title, else host). */
export interface RailBrowserTab {
  id: string;
  label: string;
  /** The site favicon as a raster `data:` URL, else absent → the letter tile. */
  favicon?: string;
  /** The tab the model is PILOTING — the drive halo follows this, not the visible tab. */
  agent?: boolean;
}

export function RightRail({
  hostsPanel,
  browserTabs,
  activeBrowserTab,
  browserOnScreen,
  browserBusy,
  driving,
  onNewBrowser,
  onSelectBrowserTab,
  onCloseBrowserTab,
  shareInbox,
  shareInboxNarrow,
  onManageFolders,
  onOpenConnector,
  onAskTarget,
  ...foot
}: FootActions & {
  /** This section hosts the side panel (`chats` + `library`); else the rail is FOOT-only. */
  hostsPanel: boolean;
  /** The agent browser's REAL web tabs (empty until the child reports). */
  browserTabs: RailBrowserTab[];
  /** The child's active web-tab id, else null. */
  activeBrowserTab: string | null;
  /** The panel currently shows the browser (drives the accent + collapse). */
  browserOnScreen: boolean;
  /** The agent is driving the browser while it is off-screen — pulse the globe. */
  browserBusy?: boolean;
  /** The agent is driving the browser right now — drive dot on its tab. */
  driving?: boolean;
  onNewBrowser: () => void;
  onSelectBrowserTab: (id: string) => void;
  onCloseBrowserTab: (id: string) => void;
  /** The share-requests bell (ShareInbox), wide-row / narrow-icon variants —
   *  slots, so this rail stays ignorant of the org-share machinery. */
  shareInbox?: ReactNode;
  shareInboxNarrow?: ReactNode;
  /** Open Réglages → Connecteurs on the Filesystem connector (grant/revoke).
   *  Absent ⇒ the tree offers no way out to the settings. */
  onManageFolders?: () => void;
  /** Open Réglages → Connecteurs on a storage connector (Drive, OneDrive…). */
  onOpenConnector?: (connectorId: string) => void;
  /** Ask ABOUT a source (« Demander ») — a granted folder, or a file/folder of a
   *  connected storage. STAGED as a tag on the OPEN conversation (a new one only when none
   *  exists, like « Demander à propos de cette page »; `useStagedIntents.askAboutTarget`). */
  onAskTarget?: (target: AskTarget) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useRailExpanded();
  // The platform's CAPABILITY, not "are there already folders": the panel must
  // show precisely when there is nothing, since it is the one that invites adding some.
  const hasFolders = useLocalFsCapable();

  if (!hostsPanel) {
    return (
      <aside className="right-rail" aria-label={t.shell.rightRail.footAriaLabel}>
        <span className="right-rail-spacer" aria-hidden="true" />
        {shareInboxNarrow}
        <RailFoot wide={false} {...foot} />
      </aside>
    );
  }

  const expandBtn = (
    <button
      type="button"
      className="rail-btn"
      title={expanded ? t.shell.rightRail.collapse : t.shell.rightRail.expand}
      aria-label={expanded ? t.shell.rightRail.collapse : t.shell.rightRail.expand}
      aria-pressed={expanded}
      onClick={() => setExpanded((v) => !v)}
    >
      <ExpandIcon size={16} />
    </button>
  );

  const browserActive = (id: string) => browserOnScreen && id === activeBrowserTab;
  const itemProps = (tab: RailBrowserTab) => ({
    label: tab.label,
    on: browserActive(tab.id),
    tile: <FaviconTile label={tab.label} src={tab.favicon} />,
    // The drive indicator follows the PILOTED tab (`agent`), not the visible/active one.
    drive: driving && !!tab.agent,
    onSelect: () => onSelectBrowserTab(tab.id),
    onClose: () => onCloseBrowserTab(tab.id),
  });

  if (expanded) {
    return (
      <aside className="right-rail expanded" aria-label={t.shell.rightRail.ariaLabel}>
        <div className="rr-head">
          <span className="cv-eyebrow rr-title">{t.shell.rightRail.title}</span>
          {expandBtn}
        </div>
        {/* ONE column, two deposits stacked: the web tabs and the file sources are
            both "what can be opened next to the conversation". */}
        <div className="rr-body">
          <div className="rr-tree-group" title={t.shell.rightRail.browser}>
            <span className="rr-group-ico" aria-hidden="true">
              <BrowserIcon size={13} />
            </span>
            <span className="cv-eyebrow rr-group-lbl">{t.shell.rightRail.web}</span>
            <span className="rr-group-rule" aria-hidden="true" />
            <button
              type="button"
              className="rr-tree-gear"
              title={t.shell.rightRail.newBrowserTab}
              aria-label={t.shell.rightRail.newBrowserTab}
              onClick={onNewBrowser}
            >
              <PlusIcon size={13} />
            </button>
          </div>
          <div className="rr-list">
            {browserTabs.map((tab) => (
              <RailRow key={tab.id} {...itemProps(tab)} />
            ))}
            {/* Empty, it says WHOSE browser this is — the globe alone read as "a browser". */}
            {browserTabs.length === 0 && <div className="rr-empty">{t.shell.rightRail.noTabs}</div>}
          </div>
          {hasFolders && (
            <FolderTreePanel
              onManageFolders={onManageFolders}
              onOpenConnector={onOpenConnector}
              onAskTarget={onAskTarget}
            />
          )}
        </div>
        <div className="rr-foot">
          {shareInbox}
          <RailFoot wide {...foot} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="right-rail" aria-label={t.shell.rightRail.ariaLabel}>
      {expandBtn}
      {/* The width toggle is a panel command; the two openers below are not — a rule
          keeps them from reading as one row of look-alike squares. */}
      <span className="right-rail-sep" aria-hidden="true" />
      <button
        type="button"
        className={`rail-btn${browserBusy && !browserOnScreen ? " busy" : ""}`}
        title={t.shell.rightRail.openBrowser}
        aria-label={t.shell.rightRail.openBrowser}
        onClick={onNewBrowser}
      >
        <BrowserIcon size={18} />
      </button>
      {/* A tree doesn't fit in 44 px: the narrow rail shows the tabs, and this button
          is what leads to the folders. */}
      {hasFolders && (
        <button
          type="button"
          className="rail-btn"
          title={t.shell.rightRail.foldersTip}
          aria-label={t.shell.rightRail.folders}
          onClick={() => setExpanded(true)}
        >
          <FolderIcon size={18} />
        </button>
      )}
      {browserTabs.length > 0 && <span className="right-rail-sep" aria-hidden="true" />}
      {browserTabs.map((tab) => (
        <RailSquare key={tab.id} {...itemProps(tab)} />
      ))}
      <span className="right-rail-spacer" aria-hidden="true" />
      {shareInboxNarrow}
      <RailFoot wide={false} {...foot} />
    </aside>
  );
}
