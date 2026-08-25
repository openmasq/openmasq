import { Icon } from "./Icon";

/* The marks that NAME a place in the app — a shell section, a panel, a surface. These
   are identity, not verbs: the rail, the sidebar, the mobile bar and the section's own
   empty state must all wear the SAME one, or the section is unrecognisable across them. */

export const MessageIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
  </Icon>
);
/** Square speech bubble — the "envoyer un avis" rail action. Deliberately a
 *  DIFFERENT shape from `MessageIcon` (the round bubble = Conversations), which
 *  sits a few pixels away in the same rail. */
export const FeedbackIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);
export const BookIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Icon>
);
export const LockIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);
/** Lucide `sparkles` — the Compétences mark (a user-authored, reusable prompt), worn by
 *  every surface that means "compétence": the rail, the sidebar, the mobile bar, the
 *  composer picker, the staged chip, the sent bubble's tag and the section's empty state.
 *  It is theirs ALONE — `GridIcon` is already MCP + CSV artifacts + sheet files + Sync,
 *  so the section had no glyph of its own to be recognised by. */
export const SparklesIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </Icon>
);
/** The Mémoire mark — the kit's NETWORK glyph (four linked nodes): the page IS a graph
 *  now, and the mark says so. Its alone, like every section mark. */
export const MemoryIcon = (p: { size?: number }) => (
  <Icon {...p} stroke={1.9}>
    <circle cx="6" cy="7" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <circle cx="17" cy="17" r="2.2" />
    <circle cx="7" cy="17" r="2.2" />
    <path d="M8 7.6l7.8-1.2M7.4 8.9l-.2 6M8.6 16.3l6.6.4M17.7 15l-1.4-6.8M8.2 8.4l7.6 7" />
  </Icon>
);
export const GridIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </Icon>
);
export const LayersIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m12.83 2.18 8.74 4.37a1 1 0 0 1 0 1.79l-8.74 4.37a2 2 0 0 1-1.66 0L2.43 8.34a1 1 0 0 1 0-1.79l8.74-4.37a2 2 0 0 1 1.66 0Z" />
    <path d="m2 12.5 9.17 4.59a2 2 0 0 0 1.66 0L22 12.5" />
    <path d="m2 17 9.17 4.59a2 2 0 0 0 1.66 0L22 17" />
  </Icon>
);
export const SettingsIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
/** Web-browser glyph (a globe) — the integrated agent-browser toggle. */
export const BrowserIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20z" />
  </Icon>
);
/** Lucide `file` — a FILE tab's mark (kit `FileIcon`, added with the unified tabs). */
export const FileIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Icon>
);
/** Lucide `folder` — a DIRECTORY in the Bibliothèque's « Dossiers » tab. */
export const FolderIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
  </Icon>
);
export const SidebarIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </Icon>
);
export const LayoutSplitIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 3v18" />
  </Icon>
);
/** Lucide `workflow` — the WORKFLOWS section's mark (its alone; `LayersIcon` was
 *  already worn by the Versions tab + the MCP tools modal). */
export const WorkflowIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect width="8" height="8" x="3" y="3" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect width="8" height="8" x="13" y="13" rx="2" />
  </Icon>
);
