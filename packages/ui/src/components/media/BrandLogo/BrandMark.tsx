/**
 * The brand mark: the **O of Open**, struck through by the product's redaction
 * bar. Two shapes only — an even-odd ring and a rounded bar — so it stays legible
 * from a 16px rail glyph to a splash screen. Paints with `currentColor`.
 *
 * ⚠️ The bar OVERSHOOTS the ring on both sides (x=2 → 98 over a 6 → 94 ring), and
 * that overshoot is load-bearing: flush with the ring the two shapes close into a
 * blob at 16px and the mark reads as a solid disc, losing the redaction it is
 * about. Keep the bleed if the geometry is ever re-cut.
 */
import { BRAND } from "@openmasq/branding";

/** The ring — even-odd so the counter (the O's hole) punches through. */
export const BRAND_RING =
  "M50 6C25.7 6 6 25.7 6 50s19.7 44 44 44 44-19.7 44-44S74.3 6 50 6Zm0 17c14.9 0 27 12.1 27 27S64.9 77 50 77 23 64.9 23 50s12.1-27 27-27Z";

/** The redaction bar struck across the ring — geometry shared with `BrandLoader`. */
export const BRAND_BAR = { x: 2, y: 41, width: 96, height: 18, rx: 5 } as const;

export function BrandMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      role="img"
      aria-label={BRAND.name}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={BRAND_RING} />
      <rect {...BRAND_BAR} />
    </svg>
  );
}
