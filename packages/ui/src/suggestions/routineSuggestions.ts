import type { Messages } from "@openmasq/i18n";
import { findConnector } from "@openmasq/catalog/mcp";
import { connectorCopy, mcpAuthTagCopy } from "../help/catalogCopy";
import type { Competence } from "../types";
import { pickSuggestions } from "./suggestions";
import { routineSuggestions, type RoutineSuggestion } from "./routineTemplates";
import { genericRoutineFor } from "./routineGeneric";

export { routineSuggestions, type RoutineSuggestion };

/** How many templates the modal offers at once. */
export const ROUTINE_SUGGESTION_LIMIT = 6;

/** A template whose service can't do this in one click. */
export interface OwnKeysNote {
  /** The connector, by the name the user sees. */
  service: string;
  /** What the one-click connection does NOT cover, in the catalog's own words
   *  (« lire vos emails ») — the whole point: Gmail SENDS in one click, only
   *  READING needs the user's own client. */
  adds: string;
  /** The full user-facing sentence, straight from `mcpAuthTagCopy` — the copy has ONE
   *  home, so the chip and the Réglages card can never explain it differently. */
  title: string;
}

/**
 * The services this template uses that need the user's OWN OAuth client.
 *
 * Derived from the catalog (`byoOnly` / `byoAdds`), never written into the template
 * — so the day Google's audit clears and those fields disappear, the warning goes
 * with them. Nothing to remember to delete.
 *
 * ⚠️ Known limit: the flag is per CONNECTOR, not per capability. A future template
 * that only SENT mail (covered in one click) would still be marked. No current
 * template is in that case — every Gmail one reads — and over-warning is the right
 * side to err on: the alternative is a hand-written flag per template, which drifts.
 */
export function ownKeysNeeded(s: Pick<RoutineSuggestion, "servers">, t: Messages): OwnKeysNote[] {
  const notes: OwnKeysNote[] = [];
  for (const id of s.servers) {
    const c = findConnector(id);
    if (!c || (!c.byoOnly && !c.byoAdds)) continue;
    notes.push({
      service: connectorCopy(c.id, c, t).name,
      adds: c.byoAdds ?? t.connectorCatalog.auth.thisAccess,
      title: mcpAuthTagCopy(c, t).title,
    });
  }
  return notes;
}

/**
 * The templates to offer beside `existing` (the skills the person already has), the
 * ones whose connectors are actually CONNECTED first — a routine you can
 * launch today is worth more than one that starts with a connection screen.
 * No `connected` ⇒ plain catalog order (see the order note above: that is
 * exactly the first-run case, which is why the head of the list is account-free).
 *
 * ⚠️ …but the LAST slot is reserved for a routine needing a connection the user
 * doesn't have yet, whenever the cap would otherwise hide every one of them.
 * A template naming an unconnected service is not dead weight: launching it
 * makes the agent offer one-click connector cards, so it is how a second
 * integration gets discovered. Ranking alone killed that for precisely the user
 * most likely to connect another one. See `pickSuggestions`'s `reserveLastFor`.
 *
 * ⚠️ `unavailable` is not cosmetic. A built-in connector's enable path is
 * HOST-side (`host.mcp.enableBrowser`) and simply ABSENT on some platforms, so
 * a template scoped to it there is a dead routine: it would launch, name a
 * connector that cannot exist, and quietly do nothing. The page passes what its
 * host can't offer, exactly like the Settings grid gates its browser card.
 */
export function suggestedRoutines(
  existing: readonly Competence[],
  t: Messages,
  opts: {
    /** Catalog ids with a connected account — ranked first. */
    connected?: ReadonlySet<string>;
    /** Catalog ids this host cannot offer at all — templates naming one are dropped. */
    unavailable?: ReadonlySet<string>;
    limit?: number;
  } = {},
): RoutineSuggestion[] {
  const { connected, unavailable, limit = ROUTINE_SUGGESTION_LIMIT } = opts;
  const all = routineSuggestions(t);
  const offerable = unavailable?.size
    ? all.filter((s) => !s.servers.some((id) => unavailable.has(id)))
    : all;
  if (!connected?.size) return pickSuggestions(offerable, existing, limit);
  const connectedCount = (s: RoutineSuggestion) =>
    s.servers.filter((id) => connected.has(id)).length;
  return pickSuggestions(offerable, existing, limit, {
    score: connectedCount,
    // A DISCOVERY template: not one of its connectors is connected, so launching
    // it is what surfaces the connector cards.
    reserveLastFor: (s) => connectedCount(s) === 0,
  });
}

/**
 * Narrow an ALREADY-RANKED list to the integrations the user just ticked in the
 * editor — what makes the side panel answer « et avec Gmail, je peux faire quoi ? »
 * instead of showing the same six routines forever.
 *
 * Takes the ranked output of {@link suggestedRoutines} rather than re-deriving it,
 * for two reasons: the ticked set lives in the modal's DRAFT (the page that computed
 * the list can't see it), and sorting a pre-ranked list with a STABLE sort keeps
 * « connecté d'abord » as the tie-break for free — no second scoring rule to drift.
 *
 * ⚠️ **EVERY ticked integration comes back with at least one idea.** The curated list
 * covers a dozen services; the catalog has ~50. Showing the GENERAL list for the other
 * forty was the bug: tick Outlook, get Slack ideas under a « pour ces intégrations »
 * heading, click one, and it swaps the tick you just made. So a ticked service no
 * curated template names gets one BUILT from its catalog entry
 * (`genericRoutineFor`) — which also means a connector added tomorrow has an idea
 * the day it ships, with nothing to write.
 *
 * The cap stretches to fit the ticks for the same reason: ticking eight services and
 * seeing six is the same broken promise, one service further down.
 */
export function focusRoutines(
  ranked: readonly RoutineSuggestion[],
  focus: ReadonlySet<string> | undefined,
  t: Messages,
  limit = ROUTINE_SUGGESTION_LIMIT,
): RoutineSuggestion[] {
  if (!focus?.size) return ranked.slice(0, limit);
  const covered = (s: RoutineSuggestion) => s.servers.filter((id) => focus.has(id)).length;
  // Curated first, best coverage first (two ticked services beat one).
  const matching = [...ranked.filter((s) => covered(s) > 0)].sort(
    (a, b) => covered(b) - covered(a),
  );
  const served = new Set(matching.flatMap((s) => s.servers.filter((id) => focus.has(id))));
  const generated = [...focus]
    .filter((id) => !served.has(id))
    .map((id) => genericRoutineFor(id, t))
    .filter((s): s is RoutineSuggestion => s !== undefined);
  return [...matching, ...generated].slice(0, Math.max(limit, focus.size));
}
