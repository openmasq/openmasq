import { BRAND } from "@openmasq/branding";
import { useMemo, useState } from "react";
import type { Competence, Conversation } from "../../types";
import {
  PlusIcon,
  SearchIcon,
  Avatar,
  Badge,
  MessageIcon,
  BookIcon,
  LockIcon,
  SparklesIcon,
  MemoryIcon,
  WorkflowIcon,
} from "../../components/brand";
import { ConfirmDialog } from "../../components/feedback/ConfirmDialog";
import { BrandMark } from "../../components/media/BrandLogo";
import { groupConversationsByDate } from "../../hooks/conversationGroups";
import { ConvRow } from "./ConvRow";
import { sectionGuides, type SectionGuide } from "../../help";
import { useT } from "../../i18n";
import { featureUsage, isGated, useFeatureAccess } from "../../state/featureAccess";
import { useSectionNav } from "./useSectionNav";

/** The glyph each section wears. Kept beside the vocabulary it decorates, and keyed by
 *  the same ids, so a section added to `SECTION_GUIDE` fails to compile without one. */
const SECTION_ICON: Record<SectionGuide["id"], (p: { size?: number }) => JSX.Element> = {
  chats: MessageIcon,
  library: BookIcon,
  competences: SparklesIcon,
  memory: MemoryIcon,
  vault: LockIcon,
};

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenSettings: () => void;
  /** Open the ⌘K search palette (owned by AppShell). */
  onOpenSearch: () => void;
  /** The user's PINNED compétences — listed under the nav for one-click insertion.
   *  Empty (the default) renders nothing. */
  pinnedCompetences?: Competence[];
  /** Insert a compétence's prompt into the composer. Absent ⇒ the pinned list is
   *  inert, so callers that can't insert simply don't pass pins. */
  onUseCompetence?: (c: Competence) => void;
  /** Signed-in user's display name — drives the account avatar's initials. Absent
   *  (signed out / no email) ⇒ the catalogue's « Vous » / « You », so the fallback name
   *  follows the interface language instead of being frozen in French. */
  userName?: string;
  /** Rename a conversation from its row. Absent ⇒ the row offers no rename. */
  onRename?: (id: string, title: string) => void;
  /** Delete a conversation. Absent ⇒ the row offers no delete. The CONFIRMATION is
   *  this component's (one dialog for the whole list); the caller just deletes. */
  onDelete?: (id: string) => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onOpenSettings,
  onOpenSearch,
  pinnedCompetences = [],
  onUseCompetence,
  userName,
  onRename,
  onDelete,
}: Props) {
  const { section, go } = useSectionNav();
  const t = useT();
  // Les portes gouvernables : une section fermée sort de la nav (`state/featureAccess.ts`).
  const access = useFeatureAccess();
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const groups = useMemo(
    () => groupConversationsByDate(conversations, t),
    [conversations],
  );

  return (
    <aside className="sidebar">
      <div
        className="sidebar-wordmark"
        onClick={() => onOpenSettings()}
        title={BRAND.name}
      >
        {/* Sized to the kit's expanded sidebar head (26px mark + a 24px wordmark) —
            it used to render at 40/46px, dwarfing everything under it. */}
        <BrandMark size={26} className="brand-mark" />
        <span className="cv-wordmark cv-display">{BRAND.name}</span>
      </div>

      <button className="btn-new" onClick={onNew}>
        <PlusIcon size={18} />
        {t.chrome.newChat}
      </button>

      {/* Search sits right under "new conversation" now (grouped at the top, per the
          refreshed kit). Clicking it opens the full ⌘K palette — a single affordance. */}
      <button
        className="sidebar-search"
        onClick={onOpenSearch}
        title={t.chrome.searchShortcut}
        aria-label={t.chrome.search}
      >
        <SearchIcon size={17} />
        <span className="search-lbl"><span className="om-sweep">{t.chrome.search}</span></span>
        <span className="search-kbd">⌘K</span>
      </button>

      {/* Labels AND their hover explanation come from the one vocabulary
          (`help/sections.ts`) — the same sentences the rail tips and the guide use, so
          the nav can never name a section the guide describes differently. */}
      <nav className="side-nav">
        {sectionGuides(t).filter((s) => !isGated(s.id) || access[s.id]).map((s) => {
          const Glyph = SECTION_ICON[s.id];
          return (
            <button
              key={s.id}
              className={`side-nav-item ${section === s.id ? "active" : ""}`}
              onClick={() => go(s.id)}
              title={s.tip}
            >
              {/* 15, against the 17/18 of the controls above: the nav row is 32 high
                  and the glyph is a marker beside a label, not a target of its own. */}
              <Glyph size={15} />
              <span className="om-sweep">{s.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Les compétences ÉPINGLÉES — un clic les met en scène, tout l'intérêt de
          l'épingle. Masqué entièrement quand rien n'est épinglé. Celles qui pilotent des
          connecteurs portent le même glyphe qu'ailleurs : c'est le CHAMP `servers` qui
          décide, jamais une seconde liste. */}
      {/* Usage fermé : les épingles partent avec le reste. Sans ça, l'épingle resterait
          le seul moyen de mettre en scène une compétence — depuis une page devenue
          inatteignable (`state/featureAccess.ts`). */}
      {featureUsage("competences") && pinnedCompetences.length > 0 && (
        <div className="om-skill-pins">
          {pinnedCompetences.map((c) => (
            <button
              key={c.id}
              type="button"
              className="om-skill-pin-item"
              onClick={() => onUseCompetence?.(c)}
              title={c.servers?.length ? t.chrome.launchPinned(c.desc || c.name) : c.desc || c.name}
            >
              {c.servers?.length ? (
                <span className="om-wf-pin-ico">
                  <WorkflowIcon size={12} />
                </span>
              ) : (
                <span className="om-skill-pin-dot" />
              )}
              <span className="om-skill-pin-name">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* `role="listbox"` pairs with each `ConvRow`'s `role="option"` — the rows are
          focusable and keyboard-selectable (Entrée/Espace), see ConvRow. The visible
          eyebrow is aria-hidden because the group already announces the same label. */}
      <nav className="conv-list" role="listbox" aria-label={t.chrome.conversations}>
        {conversations.length === 0 && (
          <p className="empty-hint">{t.chrome.noConversations}</p>
        )}
        {groups.map((group) => (
          <div key={group.key} role="group" aria-label={group.label}>
            <div className="cv-eyebrow" aria-hidden>{group.label}</div>
            {group.items.map((c) => (
              <ConvRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onSelect={() => onSelect(c.id)}
                onRename={onRename ? (title) => onRename(c.id, title) : undefined}
                onAskDelete={onDelete ? () => setPendingDelete(c) : undefined}
              />
            ))}
          </div>
        ))}
      </nav>

      <button
        className="sidebar-user"
        onClick={() => onOpenSettings()}
        title={t.chrome.account}
      >
        <Avatar name={userName ?? t.chrome.you} size={30} muted />
        <div className="flex-min">
          <div className="u-name">{userName ?? t.chrome.you}</div>
          <div className="u-sub">{t.chrome.privateSpace}</div>
        </div>
        <Badge tone="neutral">{t.chrome.private}</Badge>
      </button>

      {/* Deleting a conversation destroys its messages AND its vault — the mapping that
          makes its redaction reversible. There is no undo, so it is the one row action
          that asks first. */}
      {pendingDelete && (
        <ConfirmDialog
          title={t.chrome.deleteConversation}
          message={t.chrome.deleteConversationBody(pendingDelete.title || t.chrome.untitledConversation)}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onDelete?.(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </aside>
  );
}
