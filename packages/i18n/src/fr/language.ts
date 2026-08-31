/**
 * The FR catalogue's « language » slice — the SOURCE language.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/language.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const language = {
  label: "Langue",
  hint: "La langue de l'application. Vos conversations gardent celle dans laquelle vous écrivez.",
  names: { fr: "Français", en: "English" },
} satisfies Messages["language"];
