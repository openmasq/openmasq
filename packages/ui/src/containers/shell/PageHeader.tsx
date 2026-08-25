import type { ReactNode } from "react";
import { IconButton, SidebarIcon } from "../../components/brand";

interface Props {
  title: string;
  subtitle: string;
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
export function PageHeader({ title, subtitle, onToggleSidebar, action }: Props) {
  return (
    <header className="page-header">
      {onToggleSidebar && (
        <IconButton size="sm" label="Basculer la barre latérale" onClick={onToggleSidebar}>
          <SidebarIcon size={18} />
        </IconButton>
      )}
      <div className="page-header-text">
        <h1 className="cv-display page-header-title">{title}</h1>
        <div className="page-header-sub">{subtitle}</div>
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  );
}
