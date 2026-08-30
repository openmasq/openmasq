/**
 * Tranche « language » du catalogue EN — traduit de la source (`../fr/`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/language.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const language = {
  label: "Language",
  hint: "The app's own language. Your conversations keep the one you write in.",
  // Endonyms — each language named in its OWN tongue, identical across catalogues.
  names: { fr: "Français", en: "English" },
} satisfies Messages["language"];
