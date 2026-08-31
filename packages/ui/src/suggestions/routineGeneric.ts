import type { Messages } from "@openmasq/i18n";
import { findConnector } from "@openmasq/catalog/mcp";
import { connectorCopy } from "../help/catalogCopy";
import type { RoutineSuggestion } from "./routineTemplates";

/**
 * A routine idea BUILT from a connector's own catalog entry, for the services the
 * curated list doesn't cover.
 *
 * Why generated rather than written: the catalog holds ~50 connectors and grows; the
 * curated templates cover a dozen. Hand-writing the rest would be forty paragraphs to
 * maintain, drifting from the catalog the day someone adds a connector — the exact
 * "must agree" duplication root rule 9 forbids. Generated, a new connector has an idea
 * the day it ships, and it can never name a service that no longer exists.
 *
 * The trade is deliberate: a generated idea is VAGUER than a curated one (it can't know
 * that Fireflies holds transcriptions and Stripe holds payments). It is a starting point
 * the user edits, which is what every template here is — and a vague idea about the right
 * service beats a precise idea about the wrong one, which is what the general-list
 * fallback used to show.
 */
export function genericRoutineFor(connectorId: string, t: Messages): RoutineSuggestion | undefined {
  const c = findConnector(connectorId);
  if (!c) return undefined;
  const copy = connectorCopy(c.id, c, t);
  return {
    // Namespaced so it can never collide with a curated id, and stable per connector
    // (the picked-state check and React keys both need that).
    id: `generic:${c.id}`,
    name: t.templates.generic.name(copy.name),
    // The catalog's own one-liner, lowercased into the sentence — it is what the
    // Réglages card already tells the user this connector does, so the two agree.
    desc: t.templates.generic.desc(lowerFirst(copy.desc)),
    servers: [c.id],
    prompt: t.templates.generic.prompt(copy.name),
  };
}

/** Lowercase the first letter only — the catalog descs open with a capital
 *  ("Rechercher et lire vos emails"), which reads wrong mid-sentence. Leaves an
 *  ACRONYM alone ("CRM : gérer…" must not become "cRM"). */
function lowerFirst(s: string): string {
  if (!s) return s;
  if (s.length > 1 && s[1] === s[1].toUpperCase() && /\p{L}/u.test(s[1])) return s;
  return s[0].toLowerCase() + s.slice(1);
}
