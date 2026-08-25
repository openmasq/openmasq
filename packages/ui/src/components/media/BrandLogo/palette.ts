/**
 * The redaction palette's ORDER, for anything that walks it as a SEQUENCE rather than
 * picking the hue its data dictates. Today that is the thinking loader's mini grid
 * (`MiniRedaction`); it lives here rather than in that component so a second such surface
 * cannot disagree on what the 3rd swatch is.
 *
 * These are KEYS, not colours. `styles/redaction.css` maps each to the `--hl-*` token of the
 * redaction SECTION it names, plus that hue's own `--ink-on-hl-*` — so re-toning the palette
 * at its source (`SECTION_HUE`, `packages/redact/src/highlight/sections.ts`) reaches the
 * loader too, and it can never drift from the marks a real conversation shows.
 *
 * IDENTITÉ leads on purpose, then the black bar — the classic redacted-block look, the one
 * swatch that is not a section hue — then the palette unrolls in section order.
 */
export const CAV_SWATCHES = [
  "identite",
  "bar",
  "contact",
  "localisation",
  "organisation",
  "financier",
  "identifiants",
  "reseau",
  "systeme",
  "secrets",
] as const;

export type CavSwatch = (typeof CAV_SWATCHES)[number];

/** The CSS custom properties for a swatch index (fill + the ink that reads on it). */
export function cavVars(swatch: number): { "--cav": string; "--cav-on": string } {
  const key = CAV_SWATCHES[((swatch % CAV_SWATCHES.length) + CAV_SWATCHES.length) % CAV_SWATCHES.length];
  return { "--cav": `var(--cav-${key})`, "--cav-on": `var(--cav-${key}-on)` };
}
