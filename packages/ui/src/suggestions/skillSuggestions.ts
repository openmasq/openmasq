import type { Messages } from "@openmasq/i18n";
import type { Skill, SkillCategoryId } from "../types";
import { pickSuggestions, type SuggestionBase } from "./suggestions";

/** One compétence template — a `CompetenceDraft` plus a stable id. */
export interface SkillSuggestion extends SuggestionBase {
  cat: SkillCategoryId;
}

/**
 * The compétences people ask for first. CURATED, not generated: each one is a
 * prompt that stands on its own.
 *
 * ⚠️ ORDER MATTERS — the modal shows the first `COMPETENCE_SUGGESTION_LIMIT`,
 * so the five categories are INTERLEAVED at the head: grouped by theme, the
 * visible strip was three ways to write prose and a lawyer never saw a template
 * for their work. Pinned by `suggestions.test.ts` (the OFFERED set, not just the
 * catalog, must cover every category).
 *
 * ⚠️ The WORDS live in `@openmasq/i18n` (`templates.competences`) — the prompt pre-fills
 * the message, so it is read in the person's language. Here: the id, the order, the
 * category.
 *
 * Two rules the copy follows, and they are not decoration:
 *  - the instruction ends on the LABEL of what the user must paste (« Texte : »),
 *    so a picked template leaves an obvious hole to fill rather than looking
 *    finished;
 *  - it never asks the model to invent what the source does not say — a
 *    template is a starting point the user edits, and a confident hallucination
 *    is the one thing they will not catch.
 */
/** The order is the STRIP's, and the five categories are INTERLEAVED in it (see above). */
const SKILL_SHAPE: readonly { id: string; cat: SkillCategoryId }[] = [
  { id: "reponse-email", cat: "redaction" },
  { id: "resume-document", cat: "analyse" },
  { id: "explication-code", cat: "code" },
  { id: "lecture-contrat", cat: "juridique" },
  { id: "reponse-client", cat: "support" },
  { id: "relecture", cat: "redaction" },
  { id: "compte-rendu", cat: "analyse" },
  { id: "traduction", cat: "redaction" },
];

/** Les compétences proposées, dans la langue de `t`. */
export function skillSuggestions(t: Messages): SkillSuggestion[] {
  return SKILL_SHAPE.map((c) => ({ ...c, ...t.templates.skills[c.id] }));
}

/** How many templates the modal offers at once — enough to cover the usual
 *  needs, few enough that the strip stays a hint and not a second page. */
export const SKILL_SUGGESTION_LIMIT = 6;

/** The templates to offer beside `existing` (the user's own compétences). */
export function suggestedSkills(
  existing: readonly Skill[],
  t: Messages,
  limit = SKILL_SUGGESTION_LIMIT,
): SkillSuggestion[] {
  return pickSuggestions(skillSuggestions(t), existing, limit);
}
