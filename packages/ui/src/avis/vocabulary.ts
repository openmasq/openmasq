import type { Messages } from "@openmasq/i18n";
import type { FeedbackCategory, FeedbackMood } from "./avis";

/**
 * Le VOCABULAIRE de « Votre avis » — ce que la modale MONTRE, séparé de ce que `avis.ts`
 * DÉCIDE (quand un envoi est permis, ce qu'un brouillon pré-rempli contient).
 *
 * La coupe suit la règle du dépôt (logique en `.ts`, présentation ailleurs) et elle est ce
 * qui garde `avis.ts` sous le cap : les étiquettes venant maintenant du catalogue, les
 * deux tables sont devenues des fonctions, plus longues que les constantes qu'elles
 * remplacent.
 */

/** L'ORDRE, le GLYPHE et la TEINTE d'une humeur restent ici — ils ne se traduisent pas.
 *  Seule l'étiquette vient du catalogue (`modals.avis.moods`). */
export function feedbackMoods(t: Messages): {
  id: FeedbackMood;
  glyph: string;
  label: string;
  tone: string;
}[] {
  // Glyphs are mono-font faces (the kit's), not emoji — Space Mono renders them.
  return [
    { id: "love", glyph: "◕‿◕", label: t.modals.avis.moods.love, tone: "lime" },
    { id: "ok", glyph: "•‿•", label: t.modals.avis.moods.ok, tone: "sky" },
    { id: "meh", glyph: "•︵•", label: t.modals.avis.moods.meh, tone: "amber" },
  ];
}

export function feedbackCategories(t: Messages): { id: FeedbackCategory; label: string }[] {
  return [
    { id: "idea", label: t.modals.avis.categories.idea },
    { id: "bug", label: t.modals.avis.categories.bug },
    { id: "love", label: t.modals.avis.categories.love },
    { id: "other", label: t.modals.avis.categories.other },
  ];
}

