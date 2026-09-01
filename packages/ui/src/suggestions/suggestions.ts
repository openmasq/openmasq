/**
 * STARTING TEMPLATES — the starter templates the two authoring modals offer
 * (Compétences and Workflows). One home for both, because the two lists are
 * siblings and the picking rules must not drift (root rule 9): a template is
 * only ever a PREFILL of the create form, never something the app installs by
 * itself. Nothing here reaches the wire — whatever the user then saves and
 * sends goes through the ordinary redaction pipeline like any typed text.
 *
 * React-free and unit-tested; the catalogs live beside this file
 * (`./skillSuggestions.ts`, `./routineSuggestions.ts`).
 */

/** The fields every template prefills, and the shape of a create-form draft. */
export interface SuggestionBase {
  /** Stable key — presentation only (React key + the untouched-draft check). */
  id: string;
  name: string;
  desc: string;
  prompt: string;
}

/** Name key for the "the user already has this one" test: case- AND
 *  accent-insensitive, so « Réponse e-mail » is not re-offered as « reponse
 *  e-mail ». */
const nameKey = (s: string): string =>
  s.trim().toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");

/**
 * The templates worth showing: drop the ones the user already authored (by
 * name), optionally rank by `score` (higher first, ties keep catalog order —
 * `Array.prototype.sort` is stable), then cap at `limit`.
 *
 * Filtering on the NAME rather than the id is deliberate: a template the user
 * picked and saved keeps its name, but not its id (a saved compétence gets a
 * fresh uuid), so the id would re-offer what is already in the list.
 */
export function pickSuggestions<T extends SuggestionBase>(
  all: readonly T[],
  existing: readonly { name: string }[],
  limit: number,
  opts: {
    /** Higher shows first. Ties keep catalog order. */
    score?: (s: T) => number;
    /**
     * "Never let the cap hide EVERY one of these." When no picked template
     * satisfies the predicate but a dropped one does, the best dropped match
     * takes the LAST slot.
     *
     * Why it exists: ranking by what the user can already run is right for
     * immediate value and wrong for discovery — a template naming a service
     * they haven't connected is not dead weight, it is the path to connecting
     * it (an unfulfillable request makes the agent offer one-click connector
     * cards, `agent/suggestIntegrations.ts`). Ranking alone buried that funnel
     * exactly for the user who connected one service and might connect a
     * second. One reserved slot keeps it alive without costing the top of the
     * strip.
     */
    reserveLastFor?: (s: T) => boolean;
  } = {},
): T[] {
  const { score, reserveLastFor } = opts;
  const taken = new Set(existing.map((e) => nameKey(e.name)));
  const fresh = all.filter((s) => !taken.has(nameKey(s.name)));
  const ordered = score ? [...fresh].sort((a, b) => score(b) - score(a)) : fresh;
  const cap = Math.max(0, limit);
  const picked = ordered.slice(0, cap);
  // Only meaningful when the cap actually DROPPED something: a list that fits
  // whole already shows every candidate there is.
  if (reserveLastFor && picked.length === cap && cap > 0 && ordered.length > cap) {
    if (!picked.some(reserveLastFor)) {
      const reserved = ordered.slice(cap).find(reserveLastFor);
      if (reserved) picked[picked.length - 1] = reserved;
    }
  }
  return picked;
}

/**
 * Whether the picker may still be shown — i.e. picking again can DESTROY NO
 * USER WORK. True while the draft is empty, and while it still matches a
 * template verbatim (so the user can try several before typing). The first
 * edit hides the strip, which is what makes "picking replaces everything" safe
 * without a confirm.
 */
export function isUntouchedDraft(
  draft: { name: string; desc: string; prompt: string },
  all: readonly SuggestionBase[],
): boolean {
  if (!draft.name.trim() && !draft.desc.trim() && !draft.prompt.trim()) return true;
  return all.some(
    (s) => s.name === draft.name && s.desc === draft.desc && s.prompt === draft.prompt,
  );
}
