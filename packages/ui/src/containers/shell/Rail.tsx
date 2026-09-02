import { useMemo } from "react";
import { PlusIcon, SearchIcon, SECTION_ICON, ShieldIcon, Avatar } from "../../components/brand";
import { BrandMark } from "../../components/media/BrandLogo";
import type { Conversation } from "../../types";
import { useAppSelector } from "../../state/redux";
import { isGated, useFeatureAccess } from "../../state/billing/featureAccess";
import { protectedCount } from "../../state/redaction/protectedCount";
import { sectionGuides } from "../../help";
import { useT } from "../../i18n";
import { useSectionNav } from "./useSectionNav";

interface Props {
  conversations: Conversation[];
  /** Expand the full conversation sidebar (logo click). */
  onExpand: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  /** Open the ⌘K search palette (owned by AppShell). */
  onOpenSearch: () => void;
  /** Open the "Votre avis" modal. Absent when the platform has no `host.avis` —
   *  the action is then not rendered at all rather than offered and dead. */
  userName?: string;
  /** Open Settings ON A SPECIFIC TAB. The shield promises the privacy report:
   *  without this argument it could only land on the default tab (Account). */
  onOpenSettings: (tab?: string) => void;
}

/**
 * Collapsed sidebar = the compact icon rail (matching the chat-app kit): brand
 * mark (expands the sidebar), new chat, Search (⌘K), the five sections, then a
 * spacer, the privacy shield and the account avatar — both opening settings. Shown
 * when the conversation sidebar is collapsed.
 *
 * The sections are ITERATED from the one vocabulary (`sectionGuides`, the same list
 * and the same gating as `Sidebar`), each wearing its `SECTION_ICON` — five hand-written
 * buttons used to sit here, which is how a section could exist in one nav and not the
 * other. Tooltips are plain `title`s: `brand/TooltipLayer` draws them like every other
 * glyph-only control's.
 */
export function Rail({
  conversations,
  onExpand,
  onNew,
  onSelect,
  onOpenSearch,
  userName,
  onOpenSettings,
}: Props) {
  const { section, go } = useSectionNav();
  const t = useT();
  // The governable gates (`state/featureAccess.ts`): a closed gate doesn't render
  // its entry. The feature itself keeps running — except Compétences.
  const access = useFeatureAccess();
  /* Each section's `tip` is its label AND what it is for (`help/sections.ts`) — a tip
     that only repeats the label taught nothing, and four of these names are the app's own
     words. The `aria-label` reads the NAME alone. */
  const sections = sectionGuides(t).filter((s) => !isGated(s.id) || access[s.id]);
  // The Mémoire « nouveau » dot — raised on a background note, cleared on visit.
  const memoryFresh = useAppSelector((s) => s.ui.memoryFresh);
  // The SAME number the confidentialité report shows (`state/protectedCount.ts`) —
  // this shield opens that report, so the two must not disagree.
  const protectedN = useMemo(() => protectedCount(conversations), [conversations]);

  return (
    <div className="rail">
      <button
        className="rail-btn rail-logo"
        onClick={onExpand}
        title={t.chrome.expandSidebar}
        aria-label={t.chrome.expandSidebar}
      >
        <BrandMark size={24} className="brand-mark" />
      </button>

      <button className="rail-new" onClick={onNew} title={t.chrome.newChat} aria-label={t.chrome.newChat}>
        <PlusIcon size={18} />
      </button>

      <button
        className="rail-btn"
        onClick={onOpenSearch}
        title={t.chrome.searchShortcut}
        aria-label={t.chrome.search}
      >
        <SearchIcon size={18} />
      </button>

      {sections.map((s) => {
        const Glyph = SECTION_ICON[s.id];
        // The Mémoire « nouveau » dot: a background extraction noted something the user
        // hasn't seen — the tip says so, and the dot clears on visit.
        const fresh = s.id === "memory" && memoryFresh;
        return (
          <button
            key={s.id}
            className={`rail-btn rail-nav ${section === s.id ? "active" : ""}`}
            onClick={() => go(s.id)}
            title={fresh ? t.chrome.memoryFresh : s.tip}
            aria-label={fresh ? t.chrome.memoryFresh : s.label}
          >
            <Glyph size={16} />
            {fresh && <span className="rail-note-dot" aria-hidden="true" />}
          </button>
        );
      })}

      <div className="rail-spacer" />

      {/* ⚠️ The shield opens « Confidentialité », NOT the default tab. Both
          buttons used to call `go("settings")`, so the shield landed on « Compte » —
          a button that announces « rapport de confidentialité » and opens the account page.
          For a lawyer that's THE document being asked for (proving that professional
          secrecy held), and the app was denying it to her through a misrouting. */}
      <button
        className="rail-btn"
        onClick={() => onOpenSettings("privacy")}
        title={t.chrome.privacyReportTip(protectedN)}
        aria-label={t.chrome.privacyReport}
      >
        <ShieldIcon size={18} />
      </button>
      <button
        className="rail-avatar"
        onClick={() => onOpenSettings()}
        title={t.chrome.account}
        aria-label={t.chrome.account}
      >
        <Avatar name={userName ?? t.chrome.you} size={30} muted />
      </button>

    </div>
  );
}
