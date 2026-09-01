import type { Messages } from "@openmasq/i18n";
import type { Competence, CompetenceCategoryId } from "../types";
import { suggestedCompetences, type CompetenceSuggestion } from "./competenceSuggestions";
import { suggestedRoutines, type RoutineSuggestion } from "./routineSuggestions";

/**
 * WHAT THE MODAL OFFERS — a single list, ever since compétences and
 * "workflows" became one.
 *
 * The two catalogues stay TWO files, and that is intentional: they don't share
 * the same ranking rules. Prose prompts are ranked by theme (the five categories
 * are interleaved at the top, without which a lawyer would only see redaction); routines
 * are ranked by what is CONNECTED, with a slot reserved for a routine
 * with nothing connected — that is how a second integration gets discovered.
 * Merging the two rankings into one would have lost one of the two rules.
 *
 * This file therefore only puts them end to end, prose first: the modal opens
 * on what works with nothing plugged in.
 */

export type AnyTemplate = CompetenceSuggestion | RoutineSuggestion;

/** A template that drives connectors — what the app used to call a "workflow".
 *  The test is on the FIELD, never on a label: it is `servers` that decides
 *  behaviour, so it is what decides presentation. */
export function isRoutineTemplate(t: AnyTemplate): t is RoutineSuggestion {
  return Array.isArray((t as RoutineSuggestion).servers);
}

/** The category a template pre-fills into the creation form. */
export function templateCategory(t: AnyTemplate): CompetenceCategoryId {
  return isRoutineTemplate(t) ? "routine" : t.cat;
}

/**
 * The templates to offer alongside what the person already has. `connected` /
 * `unavailable` only concern routines (see `suggestedRoutines`); `focus` is
 * handled by the caller, which alone sees the draft currently being edited.
 */
export function offeredTemplates(
  existing: readonly Competence[],
  t: Messages,
  opts: {
    connected?: ReadonlySet<string>;
    unavailable?: ReadonlySet<string>;
    /** How many of each of the two families. */
    limit?: number;
  } = {},
): AnyTemplate[] {
  const { limit, connected, unavailable } = opts;
  return [
    ...suggestedCompetences(existing, t, limit),
    ...suggestedRoutines(existing, t, { connected, unavailable, limit }),
  ];
}
