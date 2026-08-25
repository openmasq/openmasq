import { type CSSProperties } from "react";
import { Icon } from "./Icon";

/* The VERBS — a glyph on something the user clicks to do a thing. */

export const PlusIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M5 12h14M12 5v14" />
  </Icon>
);
/* The share-requests bell (ShareInbox) — Lucide `bell`. */
export const BellIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </Icon>
);
export const SearchIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);
export const SendIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);
/** The one FILLED glyph in the set: a stop square reads as a solid target, and an
 *  outlined one is easily mistaken for the empty artifact/CSV rects. Hence a bare
 *  `<svg fill="currentColor">` rather than the stroked `Icon` wrapper. */
export const StopIcon = (p: { size?: number }) => (
  <svg
    width={p.size ?? 20}
    height={p.size ?? 20}
    viewBox="0 0 24 24"
    fill="currentColor"
    className="cv-icon"
  >
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);
export const CheckIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
export const XIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);
export const TrashIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </Icon>
);
export const LogOutIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Icon>
);
/** Lucide `pen-line` — the writing/redaction glyph (empty-thread starters). */
export const EditIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);
export const CopyIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect width="14" height="14" x="8" y="8" rx="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </Icon>
);
export const RefreshIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </Icon>
);
export const DownloadIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </Icon>
);
export const ArrowRightIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Icon>
);
export const ThumbUpIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </Icon>
);
export const ThumbDownIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </Icon>
);
export const MicIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </Icon>
);
export const PaperclipIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Icon>
);
export const ChevDownIcon = (p: { size?: number; style?: CSSProperties }) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
/** Chevron-LEFT — the "back" affordance (settings rail). A real left-pointing path,
 *  not a CSS-rotated `ChevDownIcon`: rotating an icon also rotates its stroke
 *  rendering off the pixel grid, and the kit draws this one at a heavier 2.2 stroke. */
export const ChevLeftIcon = (p: { size?: number; stroke?: number }) => (
  <Icon stroke={2.2} {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);
/** Chevron-RIGHT — the "opens a detail" affordance (mobile settings rows). Same
 *  real-path rationale as `ChevLeftIcon`. */
export const ChevRightIcon = (p: { size?: number; stroke?: number }) => (
  <Icon stroke={2.2} {...p}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
/** Lucide `external-link` — the action leaves the app (opens the system browser). */
export const ExternalIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>
);
/** Lucide `maximize-2` — expand a surface (the right rail's labelled-list mode). */
export const ExpandIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </Icon>
);
/** Kit `ForkIcon` — duplicate a conversation FROM this message (the fork point). */
export const ForkIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="7" r="2.5" />
    <path d="M6 8.5v7" />
    <path d="M18 9.5c0 4-6 2.5-6 6.5" />
  </Icon>
);
export const DotsIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </Icon>
);
