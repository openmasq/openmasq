import { BRAND_RING, BRAND_BAR } from "./BrandMark";

import { useT } from "../../../i18n";
/**
 * Animated brand mark for loading states: the ring holds still, ghosted, while
 * the redaction bar sweeps across it and back — the redaction being applied,
 * looping. Pure CSS (see `.om-loader` in styles.css); reduced-motion shows the
 * static, fully-drawn mark.
 *
 * The ring is the ONLY thing dimmed: it is the part that is already there, and
 * the bar has to stay full-strength or the sweep reads as a fade rather than as
 * a mark being laid down.
 *
 * `mono` is kept for call sites that ask for the black logo explicitly; the mark
 * paints with `currentColor` either way, so the distinction is only which token
 * the loader inherits — `--text-strong` (near-black in light, light in dark, so
 * it never vanishes on a dark surface) versus the ambient colour.
 */
export function BrandLoader({
  size = 52,
  className,
  mono = false,
}: {
  size?: number;
  className?: string;
  /** Paint the mark in the strong ink (the black logo) rather than inheriting. */
  mono?: boolean;
}) {
  const t = useT();
  const classes = ["om-loader", mono ? "mono" : "", className].filter(Boolean).join(" ");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      className={classes}
      role="img"
      aria-label={t.leaves.loading}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={BRAND_RING} className="om-loader-ring" />
      <rect {...BRAND_BAR} className="om-loader-bar" />
    </svg>
  );
}
