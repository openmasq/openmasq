/**
 * THE source of the redaction palette: one SECTION, one hue.
 *
 * Everything that colours a redaction derives from `SECTION_HUE` — the inline chat marks,
 * the composer band, the document/PDF canvas painters, the debug log, the privacy report,
 * the "Règles de redaction" screen, the org admin console, the browser extension. There is
 * no second map to keep in agreement: `CATEGORY_HUE` (per fine category) is COMPUTED from
 * this one via `CATEGORY_SECTION`, so the rules screen and the mark the user sees in a real
 * conversation cannot disagree. That was the drift this file exists to remove — the screen
 * used to carry a palette of its own, and it silently said "e-mail is blue" while the chat
 * painted it lime.
 *
 * It lives HERE and not in `@openmasq/catalog` (which owns the rest of the category display
 * metadata: labels, order, defaults) only because of the dependency direction: `catalog`
 * depends on this package, never the reverse, and the engine's own highlighter needs the
 * hue. `catalog` re-exports it, so a consumer still has one import to reach for.
 *
 * ⚠️ Adding a section means adding its hue here, and adding a hue means declaring
 * `--hl-<hue>` AND `--ink-on-hl-<hue>` AND `--hl-<hue>-soft` in `packages/ui/src/styles.css`
 * (plus the extension's `tokens.css`). Both are enforced — `packages/ui/src/styles/
 * contrast.test.ts` derives its hue list from `SECTION_HUE` and measures every pair against
 * WCAG AA in all four themes, so a hue with no token, or one re-toned without re-checking
 * its ink, fails CI rather than shipping an unreadable mark.
 */
import type { Hue, RedactionCategory } from "../types";

export type { Hue };

/**
 * The product's redaction SECTIONS, in display order. This is the order the rules screen
 * and the admin policy grid render, so it is the product's own grouping — not the engine's.
 */
export const REDACTION_SECTIONS = [
  "Identité",
  "Contact",
  "Localisation",
  "Organisation",
  "Financier",
  "Identifiants",
  "Réseau",
  "Système",
  "Secrets",
] as const;

export type RedactionSection = (typeof REDACTION_SECTIONS)[number];

/**
 * ⭐ THE SOURCE. One hue per section — nine sections, nine hues, no collapse.
 *
 * Which section gets which hue is a FATIGUE decision, made against real usage
 * (`redaction_applied` counts): the sections people trigger most often carry the calmest
 * fills, and the loud ones are spent on what is both rare and worth an alarm.
 *   • Contact is the highest-volume section by a factor of two — it gets the calm `sky`.
 *   • Identité, Localisation and Organisation follow, on soft `violet`/`mint`/`teal`.
 *   • Système (file paths) arrives in BURSTS — a pasted log is dozens of marks at once — so
 *     it takes the near-neutral `slate`, which reads as a wash rather than a rash.
 *   • Secrets is rare AND the one family where being loud is a service: a leaked API key
 *     should catch the eye. It gets the only red in the palette.
 *   • `lime` is deliberately NOT here. It is the highest-chroma colour we have and the
 *     brand accent (`--brand`, `.om-mark`) — as a redaction hue it both tired the eye on
 *     the busiest section and clashed with the brand's own marker.
 */
export const SECTION_HUE: Record<RedactionSection, Hue> = {
  Identité: "violet",
  Contact: "sky",
  Localisation: "mint",
  Organisation: "teal",
  Financier: "amber",
  Identifiants: "gold",
  Réseau: "pink",
  Système: "slate",
  Secrets: "red",
};

/**
 * Which section each fine category belongs to — the other half of the derivation.
 *
 * Total over the engine's enum, RETIRED categories included (`health`, `number`): the
 * record is indexed by `RedactionCategory`, and a category the product no longer exposes
 * still needs a hue for the debug log and for a vault entry written before its retirement.
 */
export const CATEGORY_SECTION: Record<RedactionCategory, RedactionSection> = {
  name: "Identité",
  dob: "Identité",
  username: "Identité",
  health: "Identité",
  email: "Contact",
  phone: "Contact",
  address: "Contact",
  location: "Localisation",
  company: "Organisation",
  company_id: "Organisation",
  card: "Financier",
  salary: "Financier",
  iban: "Financier",
  // A bare number token (n1, n2…) is arithmetic the model computes on — same section as a
  // salary, which is the one live category that tokenises that way.
  number: "Financier",
  national_id: "Identifiants",
  ip: "Réseau",
  url: "Réseau",
  path: "Système",
  secret: "Secrets",
  apikey: "Secrets",
};
