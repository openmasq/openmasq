import { useId, type ReactNode } from "react";
import { BRAND } from "@openmasq/branding";

/** Compact status / category label (mono, pill). Matches the kit's Badge. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "coral" | "green" | "violet" | "blue" | "amber";
}) {
  return (
    <span className={`cv-badge tone-${tone}`}>{children}</span>
  );
}

/**
 * Ghost icon button — square, rounded, subtle hover. Matches the kit's IconButton.
 *
 * **THE glyph-only control.** Every icon-with-no-text action goes through it rather
 * than a hand-rolled `<button>`: that is what keeps their size, hover and pressed
 * state identical across the app (two neighbours in the composer had drifted to
 * different shapes AND different sizes).
 *
 * `label` writes BOTH `aria-label` and `title`. The `title` is not the native tooltip
 * it looks like — `TooltipLayer` intercepts it app-wide and draws the branded one.
 */
export function IconButton({
  children,
  onClick,
  label,
  size = "md",
  active = false,
  busy = false,
  expanded,
  haspopup,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  label?: string;
  size?: "sm" | "md";
  active?: boolean;
  /** Extra class for a one-off STATE this primitive shouldn't grow a prop for (e.g.
   *  `pulse-once`, the feedback glyph's first-sight nudge). Appended, never replacing
   *  — the base `icon-btn` styling is what makes these buttons interchangeable. */
  className?: string;
  /** Show a small pulsing dot (e.g. background browser activity to review). */
  busy?: boolean;
  /** This button opens a menu/dialog, and it is currently open. Drives `aria-expanded`
   *  — without it a screen reader announces a plain button and never says the menu
   *  it just opened exists. */
  expanded?: boolean;
  haspopup?: "menu" | "dialog" | "listbox";
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${size} ${active ? "active" : ""}${busy ? " busy" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={haspopup}
    >
      {children}
      {busy && <span className="icon-btn-dot" aria-hidden="true" />}
    </button>
  );
}

/** User avatar — initials on a deterministic pearl-tinted background, or a NEUTRAL
 *  grey when `muted` (the signed-in user's own avatar, so it isn't a coloured chip
 *  that reads like a status). */
export function Avatar({
  name = "",
  size = 32,
  muted = false,
}: {
  name?: string;
  size?: number;
  muted?: boolean;
}) {
  // Each soft fill travels with ITS pearl ink (rule 12) — the pairs are measured in all
  // four themes by `styles/textContrast.test.ts`. No literals: a re-toned pearl would
  // strand a frozen hex, and `--green-ink` (the old emerald ink) flips light in dark mode
  // while the soft fill stays a light mint.
  const palette = [
    ["var(--pearl-coral-soft)", "var(--pearl-coral-ink)"],
    ["var(--pearl-amber-soft)", "var(--pearl-amber-ink)"],
    ["var(--pearl-emerald-soft)", "var(--pearl-emerald-ink)"],
    ["var(--pearl-azure-soft)", "var(--pearl-azure-ink)"],
    ["var(--pearl-violet-soft)", "var(--pearl-violet-ink)"],
    ["var(--pearl-magenta-soft)", "var(--pearl-magenta-ink)"],
  ] as const;
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [bg, fg] = muted
    ? (["var(--border-strong)", "var(--text-strong)"] as const)
    : palette[hash % palette.length];
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: bg,
        color: fg,
        fontSize: Math.max(11, Math.round(size * 0.4)),
      }}
    >
      {initials}
    </span>
  );
}

/* On/off toggle — coral when on (the redact Switch). */
export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`cv-switch ${checked ? "on" : ""}`}
    >
      <span className="knob" />
    </button>
  );
}

/* ─────────────────────────────── redact mark ─────────────────────────────
   The pearl logomark — an iris-gradient rounded square with a white pearl.     */

export function RedactMark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className="cv-icon"
      aria-label={BRAND.name}
      role="img"
    >
      <defs>
        <linearGradient
          id={id}
          x1="18"
          y1="14"
          x2="104"
          y2="108"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8C7CEE" />
          <stop offset="0.55" stopColor="#6E5BE6" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <rect x="14" y="14" width="92" height="92" rx="30" fill={`url(#${id})`} />
      <circle cx="60" cy="60" r="22" fill="#fff" fillOpacity="0.95" />
      <circle cx="51.5" cy="51.5" r="7.5" fill="#fff" />
      <circle cx="60" cy="60" r="22" fill={`url(#${id})`} fillOpacity="0.18" />
    </svg>
  );
}

/** The kit's empty-state "C" mark — an open ring in the ink colour. */
export function CMark({ size = 52 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="cv-icon cv-mark"
      aria-label={BRAND.name}
      role="img"
    >
      <path
        d="M23.5 9.2 A 9.6 9.6 0 1 0 23.5 22.8"
        stroke="currentColor"
        strokeWidth="5.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
