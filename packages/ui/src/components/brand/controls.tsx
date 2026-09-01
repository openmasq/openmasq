import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * Card / Button / Input — the three form-and-surface primitives the admin consoles
 * compose. They lived TWICE, in `apps/web/components/ui/` and `apps/ops/components/ui/`,
 * the second barrel ANNOUNCING the copy-paste rather than avoiding it — for lack of a
 * shared package. A single home now, because the two copies had already diverged: one
 * wrote `bg-surface-card`, the other `bg-[var(--surface-card)]`, and their primary
 * buttons weren't the same colour.
 *
 * The original reason for the split — "brand.tsx is already over 300 LOC" — is gone:
 * `brand.tsx` became this folder, and these get their own file rather than growing
 * `primitives.tsx`.
 */

type Pad = "none" | "sm" | "md" | "lg";

// The design system's scale (`tokens/layout.css`: --space-3/5/6), not an approximation:
// the admin kit composes its cards with `padding="md"` = 20 px, which `p-4` rendered as 16.
const PAD: Record<Pad, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

/**
 * Surface primitive. Token-styled; layout comes from `className`, never inline style.
 *
 * Radius and fill come from the design source's `Card`
 * (`.claude/skills/design-system/components/display/Card.jsx`): `--radius-lg` (12) and
 * the spacing scale. NOT its `--shadow-sm`: measured in the admin kit as it actually
 * RENDERS, the card is flat (its page loads the chat's borderless skin, which sets
 * shadows to `none`) — it's a crisp edge and a hairline that set it apart, not a shadow.
 */
export function Card({
  children,
  padding = "lg",
  className = "",
  onClick,
}: {
  children: ReactNode;
  padding?: Pad;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-card border border-border-subtle rounded-lg ${PAD[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

export type ButtonVariant = "primary" | "cta" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  /** The design-system CTA. Ground and ink are the paired tokens, so it inverts
   *  correctly in all four themes. */
  primary: "bg-brand text-brand-contrast border border-transparent hover:opacity-90",
  /**
   * The bright-lime CTA of the internal ops console — kept as a SEPARATE variant so
   * extracting this primitive changed nothing visually.
   *
   * ⚠️ Root rule 12 hazard, preserved verbatim rather than silently repainted: this
   * pins a literal ink (`--forest-900`) on a `--lime` ground, and the dark-green theme
   * re-points `--lime` to a near-black (`#11160b`) while `--forest-900` stays dark —
   * dark ink on a dark ground, i.e. the text is gone. It is safe today only because
   * `apps/ops` ships no theme switcher. There is no `--ink-on-lime` token to pair it
   * with; adding one (or moving ops onto `primary`) is the real fix and is a design
   * decision, not a refactor.
   */
  cta: "bg-[var(--lime)] text-[var(--forest-900)] border border-transparent font-semibold hover:opacity-90",
  secondary: "bg-surface-card text-body border border-border-default hover:bg-surface-hover",
  ghost: "bg-transparent text-body border border-transparent hover:bg-surface-hover",
  danger: "bg-transparent text-hl-pink border border-border-default hover:bg-surface-hover",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
};

/** Action primitive (variant + size + optional leading icon). Token-styled; disabled
 *  dims and blocks pointer events. */
export function Button({
  children,
  variant = "secondary",
  size = "md",
  iconLeft,
  className = "",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: Size;
  iconLeft?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-sans font-medium cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {iconLeft}
      {children}
    </button>
  );
}

/** Labelled text field. The label is optional so it also works as a bare input;
 *  `help` renders muted below. */
export function Input({
  label,
  help,
  className = "",
  ...rest
}: {
  label?: string;
  help?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block flex-1">
      {label && <span className="block text-sm font-medium text-strong mb-1.5">{label}</span>}
      <input
        {...rest}
        className={`w-full box-border h-11 px-3 rounded-md border border-border-default bg-surface-card font-sans text-base text-strong outline-none focus:border-border-strong ${className}`}
      />
      {help && <span className="block text-xs text-muted mt-1.5">{help}</span>}
    </label>
  );
}
