import type { ReactNode } from "react";
import { IconButton, SidebarIcon } from "../../components/brand";
import { sectionGuide, type SectionGuide } from "../../help";
import { useT } from "../../i18n";

interface Props {
  /**
   * A SECTION header: its name and its phrase come from the vocabulary
   * (`help/sections.ts`), not from the caller. The four pages used to copy the name
   * the rail, the sidebar, and the guide already displayed — « Mémoire » lived in
   * four places, only one of which was translated.
   */
  section?: SectionGuide["id"];
  /** A header that is NOT a section: Settings, whose title follows the tab.
   *  Provide `title`/`subtitle` OR `section`, never both. */
  title?: string;
  subtitle?: string;
  /**
   * Expand/collapse the primary sidebar. Every full-page surface gets it (the
   * toggle used to live ONLY in the chat's `.chat-topbar`, so Bibliothèque /
   * Coffre / Réglages had no way to collapse the sidebar). Omitted on the mobile
   * variant, where the drawer is driven by the chat header + BottomNav.
   */
  onToggleSidebar?: () => void;
  /** Right-aligned page action (buttons, filters…). */
  action?: ReactNode;
}

/**
 * The ONE page header — reskin of the design kit's `PageShell` head. Every
 * non-chat page (Bibliothèque, Coffre, Compétences, Réglages) renders its
 * title/subtitle through this, so they can't drift apart again.
 *
 * ONE compact bar (kit `PageShell`): the sidebar toggle sits INLINE, left of the
 * title, in the same 14px-padded bar — not in a separate strip above it, which
 * pushed every title a full bar lower than the kit. `.page-header` carries the
 * frameless-window drag region (children opt back out).
 */
export function PageHeader({ section, title, subtitle, onToggleSidebar, action }: Props) {
  const t = useT();
  const guide = section ? sectionGuide(section, t) : undefined;
  return (
    <header className="page-header">
      {onToggleSidebar && (
        <IconButton size="sm" label={t.chat.toggleSidebar} onClick={onToggleSidebar}>
          <SidebarIcon size={18} />
        </IconButton>
      )}
      <div className="page-header-text">
        <h1 className="cv-display page-header-title">{guide?.label ?? title}</h1>
        <div className="page-header-sub">{guide?.subtitle ?? subtitle}</div>
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}
