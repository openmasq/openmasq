import type { Messages } from "@openmasq/i18n";
import { filterSkills } from "../../skills/skills";
import type { Skill } from "../../types";

// Pure logic for the composer's "/" palette — typing "/" at the start of an EMPTY
// draft opens the compétence lookup, the text after it filters, arrows + Enter pick.
// Kept out of Composer.tsx (logic in .ts, chrome in .tsx) and unit-tested.

/** Longest draft still treated as a lookup — beyond this the user is clearly
 *  writing a message that happens to start with "/", not searching. */
const MAX_QUERY = 64;

/**
 * The palette query for a draft, or `null` when the palette must be closed.
 * Open ⇔ the draft STARTS with "/" and is still a one-line lookup:
 *  - a newline means the user moved on to composing (never hijack Enter then);
 *  - an over-long draft is a sentence, not a search;
 *  - anything not starting with "/" (including "a /command" mid-text) is typing.
 */
export function slashQuery(input: string): string | null {
  if (!input.startsWith("/")) return null;
  const rest = input.slice(1);
  if (rest.includes("\n") || rest.length > MAX_QUERY) return null;
  return rest;
}

/** The compétences the current query matches — same filter as the Compétences page
 *  (name/desc, case-insensitive; "" keeps all), so the two lookups agree. */
export function slashMatches(list: readonly Skill[], query: string): Skill[] {
  return filterSkills(list, "all", query);
}

/** A built-in palette ACTION (not a compétence): picking it rewrites the draft. */
export interface SlashAction {
  id: string;
  label: string;
  desc: string;
  /** The draft after picking — e.g. « Retiens que  », caret at the end. */
  insert: string;
}

/** The built-ins. « /retenir » teaches the MÉMOIRE's conversational gesture — picking
 *  it seeds the phrase whose send gets noted (and whose chip confirms it). */
const SLASH_SHAPE: readonly { id: string; insert: string }[] = [
  {
    id: "retenir",
    insert: "Retiens que ",
  },
];

/** The actions the query matches (id prefix or label/desc substring; "" keeps all).
 *  `memoryOpen` (default: true) removes them all: « /retenir » is an AFFORDANCE of the
 *  Mémoire, which leaves with its door — the Mémoire itself keeps working, and
 *  "retiens que…" spelled out in full is still honored (`../../state/featureAccess.ts`). */
/** The shipped actions, labeled in `t`'s language — their `insert`, though, is the
 *  PHRASE the memory recognizes: it belongs to the gesture, not to the translation. */
function slashActions(t: Messages): SlashAction[] {
  return SLASH_SHAPE.map((a) => ({ ...a, ...t.conversation.slashRemember }));
}

export function slashActionMatches(query: string, t: Messages, memoryOpen = true): SlashAction[] {
  if (!memoryOpen) return [];
  const q = query.trim().toLowerCase();
  return slashActions(t).filter(
    (a) => !q || a.id.startsWith(q) || a.label.toLowerCase().includes(q) || a.desc.toLowerCase().includes(q),
  );
}

/** Clamp the keyboard cursor into the list (the list shrinks as the query narrows). */
export function clampSlashIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}
