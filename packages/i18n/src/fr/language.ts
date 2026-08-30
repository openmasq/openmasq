/**
 * Tranche « language » du catalogue FR — la langue SOURCE.
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/language.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const language = {
  label: "Langue",
  hint: "La langue de l'application. Vos conversations gardent celle dans laquelle vous écrivez.",
  names: { fr: "Français", en: "English" },
} satisfies Messages["language"];
