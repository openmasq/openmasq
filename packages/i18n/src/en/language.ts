/**
 * The EN catalogue's « language » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/language.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const language = {
  label: "Language",
  hint: "The app's own language. Your conversations keep the one you write in.",
  // Endonyms — each language named in its OWN tongue, identical across catalogues.
  names: { fr: "Français", en: "English" },
} satisfies Messages["language"];
