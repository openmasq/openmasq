import type { ReactNode } from "react";
import { useState } from "react";
import type { AskTarget } from "../../types";
import {
  BrowserIcon,
  ExpandIcon,
  FeedbackIcon,
  FolderIcon,
  HelpIcon,
  PlusIcon,
  RefreshIcon,
} from "../../components/brand";
import { useLocalFsCapable } from "../../hooks/useLocalFsCapable";
import { FolderTreePanel } from "./folders/FolderTreePanel";
import { RailRow, RailSquare, FaviconTile } from "./RightRailParts";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../i18n";
/**
 * The RIGHT RAIL — the workspace's right-edge sidebar, a sibling of the left
 * `Rail`/`Sidebar` on the shell frame (mounted by `AppShell`, `chats` + `library`).
 * Its MAIN job is agent-browser management — it lists the browser's REAL web tabs
 * (selecting switches the child's tab, ✕ closes it, the globe opens a new one).
 * Documents live in the `SidePanel`'s own `PanelTabs`, not here. Two widths: normal
 * (icon tabs) and expanded (a labelled list). Clicking the ACTIVE browser tab
 * collapses the panel (caller decides).
 *
 * The FOOT carries everything that is NOT a source: the two "ask the app" actions
 * only while a panel is open) then the two ask-the-app actions — « Aide » (the guide) and
 * « Envoyer un avis » — moved off the left rail to keep it pure NAVIGATION. ⚠️ This rail
 * only exists on `chats` + `library`: the other sections keep reaching the guide via ⌘K
 * (« aide ») and mobile via Réglages, which is why the guide stays shell-level.
 *
 * Once OPEN, it shows the TWO deposits stacked — the web tabs, then the file
 * sources (`FolderTreePanel`: granted folders and connected storage). They answer
 * the same question, "what can I open next to the conversation?", so
 * making them exclusive always hid half the answer. A single scrollbar for the
 * two: two in 214 px is twice too many.
 *
 * Three things remain deliberate:
 *  · the folders group shows as soon as the PLATFORM is capable, including
 *    empty: with no local folder and no cloud connected, the panel used to show nothing at all —
 *    yet that is exactly the user who needs inviting, and both invitations (grant
 *    a folder, connect a storage) live inside it. Only a platform WITHOUT the
 *    slot (web preview, mobile) has nothing to offer and hides it;
 *  · a tree doesn't fit in the 44 px rail: this one keeps the tabs and a button
 *    that OPENS the panel, rather than a truncated stand-in;
 *  · open DOCUMENTS still don't live here — they switch from the panel's
 *    tab bar (`PanelTabs`). A source one opens FROM is not a list
 *    of open items.
 */

/** A FOOT entry, rendered either as an icon (narrow rail) or a labelled row (wide view). */
interface FootItem {
  key: string;
  icon: JSX.Element;
  label: string;
  title: string;
  onClick: () => void;
}

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
  browserTabs,
  activeBrowserTab,
  browserOnScreen,
  browserBusy,
  driving,
  onNewBrowser,
  onSelectBrowserTab,
  onCloseBrowserTab,
  onOpenGuide,
  onOpenFeedback,
  shareInbox,
  shareInboxNarrow,
  onOpenUpdate,
  updateVersion,
  onManageFolders,
  onOpenConnector,
  onAskTarget,
}: {
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
  /** Reopen the announcement of a DOWNLOADED update — the button only exists
   *  while a version is waiting for a restart (paired with `updateVersion`). */
  onOpenUpdate?: () => void;
  /** The ready version, to NAME it ("Restart for 0.5.1"). */
  updateVersion?: string | null;
  /** Open « Aide » (the in-app guide). */
  onOpenGuide: () => void;
  /** Open « Votre avis ». Absent (no `host.avis`) ⇒ not rendered at all. */
  onOpenFeedback?: () => void;
  /** The share-requests bell (ShareInbox), wide-row / narrow-icon variants —
   *  slots, so this rail stays ignorant of the org-share machinery. */
  shareInbox?: ReactNode;
  shareInboxNarrow?: ReactNode;
  /** Open Réglages → Connecteurs on the Filesystem connector (grant/revoke).
   *  Absent ⇒ the tree offers no way out to the settings. */
  onManageFolders?: () => void;
  /** Open Réglages → Connecteurs on a storage connector (Drive, OneDrive…). */
  onOpenConnector?: (connectorId: string) => void;
  /** Ask ABOUT a source (« Demander », on hover) — a granted folder, or a file/folder of a
   *  connected storage. STAGED as a tag on the OPEN conversation (a new one only when none
   *  exists, like « Demander à propos de cette page »; `useStagedIntents.askAboutTarget`). */
  onAskTarget?: (target: AskTarget) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  // The platform's CAPABILITY, not "are there already folders": the panel must
  // show precisely when there is nothing, since it is the one that invites adding some.
  const hasFolders = useLocalFsCapable();

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

  const newBrowserBtn = (
    <button
      type="button"
      className={`rail-btn${browserBusy && !browserOnScreen ? " busy" : ""}`}
      title={t.shell.rightRail.newBrowserTab}
      aria-label={t.shell.rightRail.newBrowserTab}
      onClick={onNewBrowser}
    >
      <BrowserIcon size={18} />
    </button>
  );

  const browserActive = (id: string) => browserOnScreen && id === activeBrowserTab;

  /**
   * THE FOOT — everything that is NOT a deposit, in BOTH widths.
   *
   * ⚠️ It carries ONLY the "ask the app" actions (+ the Demandes bell). The
   * panel's commands (expand / close) were removed: re-clicking the
   * ACTIVE tab already collapses, every item has its own cross — only add one back if a
   * gesture becomes unreachable. A single array for both renders (narrow icons /
   * labelled rows), otherwise the labels would get lost on one side.
   */
  const askBtns: FootItem[] = [
    // The update FIRST in the foot, only when there is one — last
    // it used to slide under the fold of the narrow rail for whoever also has « Envoyer un avis ».
    ...(onOpenUpdate && updateVersion
      ? [
          {
            key: "update",
            icon: <RefreshIcon size={17} />,
            label: t.chrome.updateReady(updateVersion),
            title: t.chrome.updateReadyTip(BRAND.name, updateVersion),
            onClick: onOpenUpdate,
          },
        ]
      : []),
    { key: "guide", icon: <HelpIcon size={17} />, label: t.chrome.help, title: t.chrome.helpTip(BRAND.name), onClick: onOpenGuide },
    ...(onOpenFeedback
      ? [{ key: "avis", icon: <FeedbackIcon size={17} />, label: t.chrome.sendFeedback, title: t.chrome.sendFeedback, onClick: onOpenFeedback }]
      : []),
  ];

  // A single parameterized render (narrow icon / wide row): the update's accent
  // must be identical on both sides, two copied blocks would lose it.
  const footBtn = (f: FootItem, wide: boolean) => (
    <button
      key={f.key}
      type="button"
      className={`${wide ? "rr-foot-row" : "rail-btn"}${f.key === "update" ? " rr-upd" : ""}`}
      title={f.title}
      aria-label={wide ? undefined : f.label}
      onClick={f.onClick}
    >
      {wide ? (
        <>
          <span className="rr-foot-ico" aria-hidden="true">{f.icon}</span>
          <span className="rr-foot-lbl">{f.label}</span>
        </>
      ) : (
        f.icon
      )}
    </button>
  );
  const footIcons = askBtns.map((f) => footBtn(f, false));
  const footRows = askBtns.map((f) => footBtn(f, true));

  const browserTile = (t: RailBrowserTab) => <FaviconTile label={t.label} src={t.favicon} />;
  const itemProps = (t: RailBrowserTab) => ({
    label: t.label,
    on: browserActive(t.id),
    tile: browserTile(t),
    // The drive indicator follows the PILOTED tab (`agent`), not the visible/active one.
    drive: driving && !!t.agent,
    onSelect: () => onSelectBrowserTab(t.id),
    onClose: () => onCloseBrowserTab(t.id),
  });

  if (expanded) {
    return (
      <aside className="right-rail expanded" aria-label={t.shell.rightRail.ariaLabel}>
        <div className="rr-head">
          <span className="cv-eyebrow rr-title">{t.shell.rightRail.title}</span>
          {expandBtn}
        </div>
        {/* ONE column, two deposits stacked: the web tabs and the file
            sources are both "what can be opened next to the conversation".
            A switcher made them exclusive — so half the answer was
            always hidden, and it took a click to remember what was on
            the other side. A single scroll too: two scrollbars in 214 px is
            twice too many. */}
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
        <div className="rr-foot">{shareInbox}{footRows}</div>
      </aside>
    );
  }

  return (
    <aside className="right-rail" aria-label={t.shell.rightRail.ariaLabel}>
      {expandBtn}
      {newBrowserBtn}
      {/* A tree doesn't fit in 44 px: the narrow rail shows the tabs, and the
          button above is what leads to the folders. */}
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
      {footIcons}
    </aside>
  );
}
