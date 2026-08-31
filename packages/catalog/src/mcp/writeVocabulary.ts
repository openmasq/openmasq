/**
 * THE read-vs-write vocabulary for MCP tool names — and THE classifier that reads it.
 *
 * One single home (rule 9) because there are TWO boundaries that must judge alike:
 * the renderer's agentic loop (`@openmasq/ui` `isWriteTool` — the confirmation UX)
 * and the main process's write-gate (`apps/desktop` `isWriteToolName` — the real
 * boundary, the one a renderer XSS cannot bypass). The two copies had
 * drifted: disjoint verb lists, different anchoring, and OPPOSITE DEFAULTS
 * (the UI let an unknown name through, main blocked it). The unified default is
 * main's: **unknown ⇒ WRITE** (fail closed, rule 7) — a tool whose name says
 * nothing may mutate, so it confirms.
 *
 * The four expressions read together or not at all: `WRITE_VERB` is broad and
 * collides with names (`get_issue`, `get_run`), which `DESTRUCTIVE_VERB` and
 * `COMPOUND_WRITE` catch, and `READ_VERB` is a trust anchor only because
 * it's at the HEAD (`^`) — without the anchor, `delete_read_receipts` would pass for a
 * read. Editing one without re-reading the others opens a path.
 */

/** A READ verb — anchored at the HEAD (`^`): the head of the name is the command, and it's
 *  the only place where a read verb is proof of trust. */
export const READ_VERB =
  /^(search|list|get|read|fetch|retrieve|find|lookup|describe|details?|query|count|download|export|check|view|show|preview|inspect|browse|scan)\b/i;

/** A WRITE verb, anywhere in the name. Deliberately BROAD (the union of the two
 *  former UI + main lists): a token from this list in a name with no read
 *  prefix is enough to confirm. */
export const WRITE_VERB =
  /\b(write|create|update|modify|edit|delete|remove|destroy|post|put|patch|send|refund|charge|cancel|insert|upsert|upload|add|set|archive|rename|move|publish|deploy|revoke|pay|transfer|issue|capture|void|execute|run|apply|merge|drop|truncate|migrate|grant|approve|provision|terminate|restore|purge|wipe|replace|disable|enable|assign|invite|share)\b/i;

/** NON-ambiguous destructive verbs (H-5 audit): never a read object name
 *  (unlike `issue`/`run`/`post` in WRITE_VERB), so one of these verbs ANYWHERE
 *  wins over a read prefix — `get_and_purge`, `delete_read_receipts`. */
export const DESTRUCTIVE_VERB =
  /\b(delete|remove|destroy|drop|truncate|purge|erase|wipe|revoke|terminate|deprovision|deregister|unpublish|unlink|detach|disable|deactivate|refund|chargeback|cancel|void|overwrite|reset|uninstall|kill|expire)\b/i;

/** A COMPOUND command — read verb, CONJUNCTION, write verb
 *  (`get_and_send_email`, `list_then_charge`). The conjunction distinguishes "two
 *  commands" from a read of an object with a write-sounding name (`get_issue` has none). */
export const COMPOUND_WRITE = new RegExp(
  `\\b(?:and|then|plus)\\b[\\w\\s]*?${WRITE_VERB.source}`,
  "i",
);

/** A read verb anywhere — the WEAK proof, accepted only when the name carries
 *  NO proof of writing at all (see the classifier). Derived from READ_VERB (a single
 *  list), minus the `^` anchor. */
const READ_ANYWHERE = new RegExp(`\\b(?:${READ_VERB.source.slice(1)})`, "i");

/** The `WRITE_VERB` verbs that just as commonly NAME a READ:
 *  `execute-sql`, `run-query`, `run-report`. A strict subset, deliberately kept short —
 *  `apply`/`issue`/`capture`/`post` are NOT in it: their read usage is marginal and the
 *  benefit isn't worth the risk. Only used by `isAmbiguousWrite` below. */
export const AMBIGUOUS_WRITE_VERB = /\b(execute|run)\b/i;

export interface ToolWriteAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

/**
 * Is a tool a WRITE (⇒ confirmation)?
 *
 * A server annotation can only RAISE suspicion, never lower it (a compromised
 * server would mark everything `readOnlyHint:true` to skip the dialog) — a bare
 * `readOnlyHint:true` only breaks the tie for a GENERIC name. Then the name:
 * a destructive verb anywhere confirms BEFORE the read short-circuit; a read
 * prefix with no compound command is a read; a write verb confirms; a
 * read verb anywhere with ZERO proof of writing is a read (the
 * `stripe_api_read`, `notion__notion-fetch` case — the vendor repeats its name before the verb).
 * The description, same trust as an annotation, only breaks the tie for a generic name.
 *
 * **Everything else ⇒ WRITE** (fail closed): `notion-duplicate-page`, `issue`,
 * `customers` — a name that doesn't prove reading confirms.
 */
export function classifyToolWrite(
  name: string,
  annotations?: ToolWriteAnnotations,
  description?: string,
): boolean {
  if (annotations) {
    if (annotations.destructiveHint === true) return true;
    if (annotations.readOnlyHint === false) return true;
  }
  // The redaction client stamps a SINGLE `${server}__` prefix: the connector
  // boundary is the FIRST `__` (a `lastIndexOf` would truncate a bare name containing `__`).
  const i = name.indexOf("__");
  const bare = i >= 0 ? name.slice(i + 2) : name;
  const words = bare.replace(/[_-]+/g, " ");
  // Destructive anywhere: BEFORE the read short-circuit (H-5).
  if (DESTRUCTIVE_VERB.test(words)) return true;
  // Read head, no compound command ⇒ read (get_issue stays a read).
  if (READ_VERB.test(words) && !COMPOUND_WRITE.test(words)) return false;
  if (WRITE_VERB.test(words)) return true;
  // Weak proof: a read verb anywhere, with — established above — zero
  // write or destructive verb in the name (so no compound is possible).
  if (READ_ANYWHERE.test(words)) return false;
  // Generic name: the annotation then the description break the tie; otherwise fail closed.
  if (annotations?.readOnlyHint === true) return false;
  if (description) {
    if (WRITE_VERB.test(description) || DESTRUCTIVE_VERB.test(description)) return true;
    if (READ_ANYWHERE.test(description)) return false;
  }
  return true;
}

/**
 * Does the WRITE verdict hold ONLY on an AMBIGUOUS verb, against a server's
 * declared read-only claim? (`posthog__execute-sql` + `readOnlyHint:true`.)
 *
 * ⚠️ This does NOT make the tool readable: `classifyToolWrite` still says write, so
 * confirmation stays REQUIRED — a spoofed `readOnlyHint` can execute nothing in
 * silence. It only lifts one thing: the AUTOMATIC refusal in read-only mode. Without
 * this nuance, "look at the activity" refused `execute-sql` without asking
 * anyone anything, and the one tool able to answer became unreachable for ANY
 * read question (log from 15/08: nine turns, no answer). Asking is the
 * right compromise; refusing outright protected nothing, since confirmation
 * already protected it.
 *
 * False ⇒ unchanged behavior. Cumulative requirements: the server DECLARES read
 * only, no destructive or compound verb, and the verdict FALLS if the ambiguous
 * verbs are removed (otherwise another write verb carries it — `run_and_delete`).
 */
export function isAmbiguousWrite(
  name: string,
  annotations?: ToolWriteAnnotations,
  description?: string,
): boolean {
  if (annotations?.readOnlyHint !== true || annotations.destructiveHint === true) return false;
  if (!classifyToolWrite(name, annotations, description)) return false; // already a read
  const i = name.indexOf("__");
  const words = (i >= 0 ? name.slice(i + 2) : name).replace(/[_-]+/g, " ");
  if (DESTRUCTIVE_VERB.test(words) || COMPOUND_WRITE.test(words)) return false;
  if (!AMBIGUOUS_WRITE_VERB.test(words)) return false;
  // The ambiguous verb must be the SOLE cause: without it, no write verdict remains.
  const sansAmbigu = words.replace(new RegExp(AMBIGUOUS_WRITE_VERB.source, "gi"), " ");
  return !WRITE_VERB.test(sansAmbigu);
}
