import { Icon } from "./Icon";

/* The marks that stand for a KIND of thing or a state: identity, protection, money,
   time. Several double as redaction-category glyphs (`pages/Settings/shared.ts` maps a
   category to one of these) — their hue comes from `CATEGORY_HUE`, never from here. */

export const EyeIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const EyeOffIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M9.9 4.24A9.1 9.1 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-2.16 3.19M6.6 6.6A17.9 17.9 0 0 0 2 12s3.5 7 10 7a9 9 0 0 0 3.4-.66" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m2 2 20 20" />
  </Icon>
);
export const ShieldIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  </Icon>
);
export const InfoIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </Icon>
);
/** Lucide `circle-help`. THE mark for « Aide » — the in-app guide, and nothing else.
 *  `InfoIcon` explains one thing in place; this one opens the guide. */
export const HelpIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </Icon>
);
/** Lucide `triangle-alert`. The state glyph for "you are taking a real risk" — keep it
 *  for actual danger; `InfoIcon` is the one for merely useful context. */
export const AlertIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Icon>
);
export const KeyIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
    <path d="m21 2-9.6 9.6" />
    <circle cx="7.5" cy="15.5" r="5.5" />
  </Icon>
);
export const UsersIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);
export const UserIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);
export const CardIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect width="20" height="14" x="2" y="5" rx="2" />
    <line x1="2" x2="22" y1="10" y2="10" />
  </Icon>
);
export const ActivityIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  </Icon>
);
/** Lucide `zap` — the credits/quota glyph (kit `CreditsCard`), and the Modèles tab. */
export const ZapIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  </Icon>
);
/** Lucide `coins` — the PRICE of a model (selector's meta chips). */
export const CoinsIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </Icon>
);
/** Lucide `book-open` — the CONTEXT window (« ce qu'il peut lire d'un seul tenant »). */
export const BookOpenIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </Icon>
);
/** Lucide `gauge` — the THROUGHPUT (tokens/minute) of a model. */
export const GaugeIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="m12 14 4-4" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </Icon>
);
/** Lucide `clock` — the reset-date glyph (kit `CreditsCard` footer). */
export const ClockIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Icon>
);
/** Lucide `plug` — « brancher ce service »: the action for a storage source that isn't
 *  connected yet. A state, not a place, hence its home here. */
export const PlugIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M12 22v-5" />
    <path d="M9 8V2" />
    <path d="M15 8V2" />
    <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
  </Icon>
);
/** Lucide `hard-drive` — « sur cet appareil »: the local store, as opposed to
 *  remote storage. Marks a GROUP of sources, where a label would eat the width. */
export const HardDriveIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <line x1="22" x2="2" y1="12" y2="12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    <line x1="6" x2="6.01" y1="16" y2="16" />
    <line x1="10" x2="10.01" y1="16" y2="16" />
  </Icon>
);
/** Lucide `cloud` — the REMOTE store (Drive, OneDrive, Dropbox), counterpart to
 *  `HardDriveIcon`. The two only read together: they oppose two places. */
export const CloudIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
  </Icon>
);

/* The two STATES of an object list — grid or rows. An inseparable pair: they
   only read one AGAINST the other, in `components/ViewModeToggle.tsx`. We didn't
   reuse `GridIcon` (already MCP + CSV artifacts + sheets + Sync): a display mode
   wearing a connector's mark no longer reads as a display mode. */
export const TilesIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Icon>
);
export const RowsIcon = (p: { size?: number }) => (
  <Icon {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);

/** Lucide `star` — the FAVORITE marker. Filled = pinned, outline = not; the fill
 *  sits on the stroke itself (`Icon` fixes `fill:none`). */
export const StarIcon = (p: { size?: number; filled?: boolean }) => (
  <Icon size={p.size}>
    <path
      fill={p.filled ? "currentColor" : "none"}
      d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.29 21.75a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.053 10.535a.53.53 0 0 1 .294-.904l5.165-.756a2.12 2.12 0 0 0 1.597-1.16z"
    />
  </Icon>
);

/** Lucide `house` — the DEFAULT MODEL marker (the one for new conversations).
 *  Filled = it's the default; outline = clickable to become it. */
export const HouseIcon = (p: { size?: number; filled?: boolean }) => (
  <Icon size={p.size}>
    <path
      fill={p.filled ? "currentColor" : "none"}
      d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
    />
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
  </Icon>
);

/**
 * The THREE strokes of Lucide `menu`, always drawn — and the LAST N in BOLD: the
 * protection level, shown as a gauge that fills from the bottom. One bold stroke =
 * Standard, two = Renforcé, three = Strict. The composer's button carries the CURRENT
 * level, each menu card its own: the list then reads as a scale.
 *
 * ⚠️ The pale strokes STAY. Drawing only N of them, the glyph lost its scale —
 * a single stroke compared to nothing and looked like a dash. What carries the level
 * is the CONTRAST between what's reached and what isn't; that's also what
 * keeps the same footprint from one level to the next, so no visual jump in the action
 * row when the user changes level.
 *
 * ⚠️ Opacity comes WITH the thickness, it doesn't replace it: at 15-16 px, 2.6 against
 * 1.5 is hard to tell apart on a non-Retina screen, and a pale-but-thick stroke reads as
 * a badly-rendered active bar. The two together leave no doubt.
 *
 * The count comes from `privacy/privacyLevel.ts` `levelBars`, never from a caller: it's the one
 * that knows a « Sur mesure » setting can claim no tier and is derived from what
 * is actually active.
 *
 * What this glyph is NOT, and why: not the SHIELD, even though that's the vocabulary of
 * redaction — it lives two pixels away on the « N à redact » pill, and two
 * shields in the same row no longer distinguish the counter from the setting; not the round
 * GAUGE, already the context window in the neighboring model row.
 */
export const LevelsIcon = ({ bars = 3, ...p }: { size?: number; bars?: 1 | 2 | 3 }) => {
  const trait = (on: boolean) =>
    on ? { strokeWidth: 2.6 } : { strokeWidth: 1.5, opacity: 0.32 };
  return (
    <Icon {...p}>
      <path d="M4 6h16" {...trait(bars >= 3)} />
      <path d="M4 12h16" {...trait(bars >= 2)} />
      <path d="M4 18h16" {...trait(true)} />
    </Icon>
  );
};
