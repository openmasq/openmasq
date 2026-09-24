/**
 * The CSS side of the redaction palette's ORDER. The order itself — and the walk that reads
 * it — live in `@openmasq/redact` (`highlight/walk.ts`), because the proxy CLI walks the same
 * sequence in a terminal; what belongs here is only how a swatch becomes CSS.
 *
 * These are KEYS, not colours. `styles/redaction.css` maps each to the `--hl-*` token of the
 * redaction SECTION it names, plus that hue's own `--ink-on-hl-*` — so re-toning the palette
 * at its source (`SECTION_HUE`) reaches the loader too, and it can never drift from the marks
 * a real conversation shows.
 */
export { CAV_SWATCHES, type CavSwatch } from "@openmasq/redact";
import { CAV_SWATCHES } from "@openmasq/redact";

/** The CSS custom properties for a swatch index (fill + the ink that reads on it). */
export function cavVars(swatch: number): { "--cav": string; "--cav-on": string } {
  const key = CAV_SWATCHES[((swatch % CAV_SWATCHES.length) + CAV_SWATCHES.length) % CAV_SWATCHES.length];
  return { "--cav": `var(--cav-${key})`, "--cav-on": `var(--cav-${key}-on)` };
}
