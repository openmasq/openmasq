import type { Messages } from "@openmasq/i18n";
import type { SuggestionBase } from "./suggestions";

/** One workflow template — a `WorkflowDraft` plus a stable id. */
export interface RoutineSuggestion extends SuggestionBase {
  /** Catalog connector ids (`@openmasq/catalog` MCP registry). Pinned by
   *  `suggestions.test.ts` against the registry — a renamed connector must
   *  break a test, not silently offer a template scoped to nothing. */
  servers: string[];
}

/**
 * The routines people ask for first, one per common connector family.
 *
 * ⚠️ ORDER MATTERS — the modal shows the first `ROUTINE_SUGGESTION_LIMIT`, and
 * a first-run user has NOTHING connected, so the connected-first ranking below
 * can't help them: catalog order is what they see. Hence the head of the list:
 *  1. a template that needs NO ACCOUNT at all (the built-in browser), so the
 *     first chip is launchable on the very first day — pinned by the test;
 *  2. then the everyday routines a ONE-CLICK connection can actually run —
 *     agenda, réunions, notes, canal — because a template whose service needs the
 *     user's own OAuth client is a wall, not a demo (see `ownKeysNeeded`);
 *  3. the ones gated behind « Mes clés » (Gmail read, Drive), kept and MARKED
 *     rather than hidden: they are the best argument for setting those keys up,
 *     and Google's audit is a temporary blocker;
 *  4. the dev-only ones LAST — useful, but a narrow audience should not fill a
 *     strip capped at six.
 *
 * ⚠️ Les MOTS (nom, description, invite) vivent dans `@openmasq/i18n` (`templates.routines`)
 * — l'invite PRÉ-REMPLIT le message de la personne, donc elle se lit dans sa langue. Ici :
 * l'id, l'ordre, et les connecteurs que chaque routine déclare.
 *
 * Two rules the copy follows:
 *  - every template READS, none writes on its own — a write template that fires
 *    before the user has seen anything would make the write-confirm card the
 *    first thing they meet, and « montre-moi d'abord » is the habit worth
 *    seeding;
 *  - the values that change at each launch are `{accolades}`, the convention
 *    the modal's own note documents.
 */
/** L'ordre est celui de la STRIP : ce qui ne demande aucun compte d'abord. */
const ROUTINE_SHAPE: readonly { id: string; servers: string[] }[] = [
  { id: "comparer-offres", servers: ["browser"] },
  { id: "preparer-journee", servers: ["google-calendar"] },
  { id: "compte-rendu-reunions", servers: ["fireflies"] },
  { id: "recherche-notion", servers: ["notion"] },
  { id: "revue-boite-mail", servers: ["gmail"] },
  { id: "point-hebdo-slack", servers: ["slack"] },
  { id: "point-client", servers: ["gmail", "google-drive"] },
  { id: "recherche-documents", servers: ["google-drive"] },
  { id: "point-paiements", servers: ["stripe"] },
  { id: "veille-sujet", servers: ["tavily"] },
  { id: "revue-depot", servers: ["github"] },
  { id: "suivi-projet", servers: ["linear"] },
  { id: "erreurs-semaine", servers: ["sentry"] },
];

/** Les routines proposées, dans la langue de `t`. */
export function routineSuggestions(t: Messages): RoutineSuggestion[] {
  return ROUTINE_SHAPE.map((r) => ({ ...r, ...t.templates.routines[r.id] }));
}

/** Les ids livrés, dans l'ordre du catalogue — une FORME, sans un mot : de quoi jouer
 *  les modèles (suite e2e) sans avoir à choisir une langue. */
export function routineIds(): string[] {
  return ROUTINE_SHAPE.map((r) => r.id);
}

/** Les connecteurs qu'une routine déclare — une FORME, sans un mot. */
export function templateServersOf(id: string): string[] | undefined {
  return ROUTINE_SHAPE.find((r) => r.id === id)?.servers;
}
