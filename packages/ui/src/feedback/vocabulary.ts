import type { Messages } from "@openmasq/i18n";
import type { FeedbackCategory, FeedbackMood } from "./feedback";

/**
 * The VOCABULARY of « Votre avis » — what the modal SHOWS, separated from what `avis.ts`
 * DECIDES (when a send is allowed, what a prefilled draft contains).
 *
 * The cut follows the repo's rule (logic in `.ts`, presentation elsewhere) and it is what
 * keeps `avis.ts` under the cap: the labels now coming from the catalogue, the two tables
 * became functions, longer than the constants they replace.
 */

/** The ORDER, the GLYPH and the HUE of a mood stay here — they are not translated.
 *  Only the label comes from the catalogue (`modals.avis.moods`). */
export function feedbackMoods(t: Messages): {
  id: FeedbackMood;
  glyph: string;
  label: string;
  tone: string;
}[] {
  // Glyphs are mono-font faces (the kit's), not emoji — Space Mono renders them.
  return [
    { id: "love", glyph: "◕‿◕", label: t.modals.feedback.moods.love, tone: "lime" },
    { id: "ok", glyph: "•‿•", label: t.modals.feedback.moods.ok, tone: "sky" },
    { id: "meh", glyph: "•︵•", label: t.modals.feedback.moods.meh, tone: "amber" },
  ];
}

export function feedbackCategories(t: Messages): { id: FeedbackCategory; label: string }[] {
  return [
    { id: "idea", label: t.modals.feedback.categories.idea },
    { id: "bug", label: t.modals.feedback.categories.bug },
    { id: "love", label: t.modals.feedback.categories.love },
    { id: "other", label: t.modals.feedback.categories.other },
  ];
}

