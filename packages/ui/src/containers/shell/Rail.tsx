import { useMemo } from "react";
import {
  PlusIcon,
  MessageIcon,
  BookIcon,
  LockIcon,
  SparklesIcon,
  MemoryIcon,
  SearchIcon,
  ShieldIcon,
  Avatar,
} from "../../components/brand";
import { BrandMark } from "../../components/media/BrandLogo";
import type { Conversation, Section } from "../../types";
import { useAppSelector } from "../../state/redux";
import { useFeatureAccess } from "../../state/featureAccess";
import { protectedCount } from "../../state/protectedCount";
import { sectionGuide } from "../../help";
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
 * mark (expands the sidebar), new chat, Chats / Bibliothèque nav, Search (⌘K),
 * then a spacer, the privacy shield and the account avatar — both opening
 * settings. Shown when the conversation sidebar is collapsed.
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
  /** The tooltip for a section: its label AND what it is for, from the one vocabulary
   *  (`help/sections.ts`). A tip that only repeats the label taught nothing — and four of
   *  these six names are the app's own words, so the rail was the app's least legible part. */
  const tip = (id: Section): string => sectionGuide(id, t)?.tip ?? id;
  /** The label read from the same button — the NAME alone, without the phrase that explains it. */
  const label = (id: Section): string => sectionGuide(id, t)?.label ?? id;
  // The governable gates (`state/featureAccess.ts`): a closed gate doesn't render
  // its entry. The feature itself keeps running — except Compétences.
  const access = useFeatureAccess();
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
        data-tip={t.chrome.expandSidebar}
        aria-label={t.chrome.expandSidebar}
      >
        <BrandMark size={24} className="brand-mark" />
      </button>

      <button className="rail-new" onClick={onNew} data-tip={t.chrome.newChat} aria-label={t.chrome.newChat}>
        <PlusIcon size={18} />
      </button>

      <button
        className="rail-btn"
        onClick={onOpenSearch}
        data-tip={t.chrome.searchShortcut}
        aria-label={t.chrome.search}
      >
        <SearchIcon size={18} />
      </button>

      <button
        className={`rail-btn rail-nav ${section === "chats" ? "active" : ""}`}
        onClick={() => go("chats")}
        data-tip={tip("chats")}
        aria-label={label("chats")}
      >
        <MessageIcon size={16} />
      </button>
      {access.library && (
        <button
          className={`rail-btn rail-nav ${section === "library" ? "active" : ""}`}
          onClick={() => go("library")}
          data-tip={tip("library")}
          aria-label={label("library")}
        >
          <BookIcon size={16} />
        </button>
      )}
      {access.competences && (
        <button
          className={`rail-btn rail-nav ${section === "competences" ? "active" : ""}`}
          onClick={() => go("competences")}
          data-tip={tip("competences")}
          aria-label={label("competences")}
        >
          <SparklesIcon size={16} />
        </button>
      )}
      {access.memory && (
        <button
          className={`rail-btn rail-nav ${section === "memory" ? "active" : ""}`}
          onClick={() => go("memory")}
          data-tip={memoryFresh ? t.chrome.memoryFresh : tip("memory")}
          aria-label={memoryFresh ? t.chrome.memoryFresh : label("memory")}
        >
          <MemoryIcon size={16} />
          {/* Background extraction noted something the user hasn't seen — cleared on visit. */}
          {memoryFresh && <span className="rail-note-dot" aria-hidden="true" />}
        </button>
      )}
      <button
        className={`rail-btn rail-nav ${section === "vault" ? "active" : ""}`}
        onClick={() => go("vault")}
        data-tip={tip("vault")}
        aria-label={label("vault")}
      >
        <LockIcon size={16} />
      </button>

      <div className="rail-spacer" />

      {/* ⚠️ The shield opens « Confidentialité », NOT the default tab. Both
          buttons used to call `go("settings")`, so the shield landed on « Compte » —
          a button that announces « rapport de confidentialité » and opens the account page.
          For a lawyer that's THE document being asked for (proving that professional
          secrecy held), and the app was denying it to her through a misrouting. */}
      <button
        className="rail-btn"
        onClick={() => onOpenSettings("privacy")}
        data-tip={t.chrome.privacyReportTip(protectedN)}
        aria-label={t.chrome.privacyReport}
      >
        <ShieldIcon size={18} />
      </button>
      <button
        className="rail-avatar"
        onClick={() => onOpenSettings()}
        data-tip={t.chrome.account}
        aria-label={t.chrome.account}
      >
        <Avatar name={userName ?? t.chrome.you} size={30} muted />
      </button>

    </div>
  );
}
